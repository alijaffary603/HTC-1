# Deploying the model and advisor API

The local app works without AWS. Deployment uses AWS SAM and Docker to build Python dependencies for Lambda's Linux runtime. AWS CLI/SAM must be installed and authenticated with an IAM role, SSO or a named AWS profile; a generic "AWS API key" is not sufficient authentication for deployment.

1. Create or select an AWS Secrets Manager secret containing either the Gemini key as plaintext or `{"GEMINI_API_KEY":"..."}`. Keep its ARN for deployment. Do not put the key in the SAM command or frontend configuration.
2. Prepare and review the source package:

```powershell
python scripts/prepare_lambda.py
sam validate --template-file deployment/template.yaml --lint
sam build --template-file deployment/template.yaml --use-container
sam deploy --guided
```

Supply the secret ARN, the exact frontend origin and the Gemini model. The function can read only that secret. The template creates a public HTTP API with explicit-origin CORS and rate/concurrency throttles. The advisor sends requests to Google, even though its backend runs on AWS. If using a customer-managed KMS key for the secret, grant the Lambda role permission to decrypt with that specific key as well.

3. Set `VITE_MODEL_API_URL` to the stack's `ModelApiUrl` output, then rebuild the frontend. Keep `VITE_API_URL` unset unless a separate account/pathway/postings backend is available. The advisor uses no account impersonation or mock authentication tokens.

The public advisor is bounded by gateway throttling, maximum payload size, a two-request application concurrency limit and a provider timeout. Before a broad public launch, add your chosen identity enforcement or bot protection and operational usage monitoring. Current plan storage is browser-local, not DynamoDB. The template does not provision account services or deploy the frontend.

Endpoints:

- `GET /health`
- `GET /score?occupation=11100&region=4830`
- `GET /resources?target=7220`
- `GET /mentors?target=7220&region=4830`
- `POST /advisor` with occupation, target, region, preferences, question and up to eight recent conversation messages.

Official references: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html).
