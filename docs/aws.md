# Running Signal on AWS

Everything is in one CloudFormation stack, [`aws/template.yaml`](../aws/template.yaml), deployed by [`scripts/deploy.py`](../scripts/deploy.py). Nothing is clicked together in the console.

## How it fits together

```
EventBridge (12th of each month)
   -> CodeBuild: fetch new AESO list, rebuild the model, run the tests, run the checks
         -> if anything fails: nothing is published, the admin gets an email
         -> if it all passes: publish to S3 (api/latest/ and history/<month>/)
              -> EventBridge (build succeeded) -> Alerts Lambda -> SES emails

Browser -> CloudFront -> S3 (the React app)
                      -> /api/* -> API Gateway -> API Lambda -> S3 (scores)
                                       |                      -> DynamoDB (pathways, alerts, saved résumé record)
                              Cognito JWT check               -> S3 (saved résumé files, opt-in)
                                                              -> Gemini API (résumés)
                                                              -> SES (intro emails)
                                    -> /api/advisor, /resources, /mentors
                                           -> Advisor Lambda (gridskills/server.py) -> Gemini API
```

| Piece | Service | Why this one |
|---|---|---|
| Monthly refresh | CodeBuild on an EventBridge schedule | The model needs pandas and scikit-learn and takes a few minutes. CodeBuild runs it as-is with no container to build. |
| Published scores | S3 | All 1,134 answers (162 jobs × 7 regions) are worked out once a month, so the API only looks them up |
| API | API Gateway (HTTP API) + one Lambda | Tiny, spiky traffic. Costs nothing when idle. `/api/score` returns `gridskills.api.score()` output, which is the app's `ModelScore` type |
| Career advisor | A second Lambda running `gridskills/server.py` | It needs pandas and the model files, so it's kept apart from the light API Lambda. It uses the `outputs/` from the last deploy, so redeploy after a monthly refresh to give it the new numbers |
| Accounts | Cognito | Email sign-up with a confirmation code. API Gateway checks the token before the Lambda runs |
| Saved pathways, alerts, saved résumé record | DynamoDB | Small per-user records, one table |
| Saved résumé files | S3 (résumé bucket) | Only for signed-in people who tick "Save it to my account". Private, encrypted, no versioning, one file per person |
| Email | SES | Monthly "your outlook changed" and introduction emails |
| Résumé matching | Gemini API (`gemini-3.5-flash-lite`) | Picks from our 162 occupation codes, enforced by the response schema |
| Advisor model | Gemini API (`gemini-3.1-flash-lite`, the advisor's own default) | Both read the same key from SSM Parameter Store |
| Web app | S3 + CloudFront | `/api/*` goes to the API on the same domain, so there's no CORS to configure |

No SageMaker, Kinesis, Redshift or containers. The data is small and changes monthly.

## Deploying

You need an AWS account, the AWS CLI (installed), Node (installed), a Gemini API key and the raw data in `data/`.

1. Sign in to AWS on this machine. In the Claude prompt type `! aws configure` and paste an access key, or use `aws login`.
2. Get a Gemini API key from Google AI Studio.
3. Deploy:

```
set GEMINI_API_KEY=your-key
.venv\Scripts\python scripts\deploy.py --sender-email you@example.com --admin-email you@example.com
```

It asks for the Gemini key if `GEMINI_API_KEY` isn't set, and stores it in SSM Parameter Store as a SecureString. The key never goes in the template or in git.

4. Click the verification link SES emails to the sender address.
5. Open the `SiteUrl` the script prints.

Re-running the script updates everything in place. `--skip-data` and `--skip-frontend` skip those steps.

### Things that will trip you up

- **SES sandbox.** New accounts can only send to addresses you've verified in SES. Fine for a demo with your own emails. Ask AWS for production access before real users sign up.
- **Cognito's own emails** (sign-up codes) come from Cognito's default sender, which is capped at 50 a day. Enough for a hackathon.
- **First month.** Outlook alerts compare two published months, so the first email goes out after the second monthly refresh.
- **The monthly job builds whatever was last deployed.** `deploy.py` uploads the current commit. Commit before deploying.

## Running the refresh by hand

```
aws codebuild start-build --project-name <PipelineProject output>
```

Watch it in the CodeBuild console. If the checks fail, the log says which one (see `gridskills/checks.py`).

## Privacy

- **Résumés** go to Google's Gemini API to be read. The upload screen says so. Check that Gemini's data terms for your key's tier are acceptable. Free tier keys may let Google use inputs to improve its products.
- **Saved résumés.** Signed-out people's résumés aren't stored. Signed-in people can tick "Save it to my account" (on by default, shown before they pick a file). Then the file goes to the résumé bucket under `resumes/<their Cognito id>/` and a record with the file name, size, skills and matched jobs goes to DynamoDB. A new upload replaces the old file. Delete on the Saved page removes both, and the bucket has no versioning, so nothing is kept. Downloads use a link that expires after 5 minutes.
- **Shared pathways** are off until the user turns them on. Others see only a first name and the move.
- **Intro emails** are sent by us. The requester's email is only revealed as the reply-to address, after the requester clicked to send.
- Everything else (accounts, pathways, alerts, saved résumés) stays in `ca-central-1`.

## Cost

At hackathon scale this is close to free. Lambda, API Gateway, DynamoDB and Cognito stay within free tiers. CloudFront, S3 and CodeBuild cost cents a month. Gemini Flash-Lite costs a fraction of a cent per résumé. Set an AWS budget alert anyway.

## Tearing it down

```
aws cloudformation delete-stack --stack-name gridskills
```

The S3 buckets (site, data and résumés) must be emptied first or the delete fails. The Gemini key stays in Parameter Store until you delete `/gridskills/gemini-api-key`.
