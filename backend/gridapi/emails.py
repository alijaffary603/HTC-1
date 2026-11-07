"""Emails we send through SES: the monthly outlook change and introduction requests.

Kept plain on purpose. Tables and inline styles only, because a lot of email
clients ignore <style>.
"""
from html import escape
from urllib.parse import urlencode

INK, MUTED, GREEN, RULE = "#1B2A31", "#4F5E65", "#2E6B3F", "#E3E7E0"
FONT = "Arial, Helvetica, sans-serif"


def _wrap(title, body_html, footer_html):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{escape(title)}</title></head>
<body style="margin:0;padding:24px 12px;background:#F1F3EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #D9DFD6;border-radius:8px;">
<tr><td style="padding:24px 32px 4px;font-family:{FONT};font-size:20px;font-weight:bold;color:{INK};">GridSkills</td></tr>
<tr><td style="padding:12px 32px 24px;font-family:{FONT};font-size:16px;line-height:24px;color:{INK};">{body_html}</td></tr>
</table>
<p style="max-width:600px;margin:12px auto;font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};">{footer_html}</p>
</body></html>"""


def _change_word(delta):
    return "up" if delta > 0 else "down"


def outlook_change(name, alert, before, after, snapshot, app_url):
    """One alert whose scores moved. before/after are summary entries from the pipeline."""
    job = alert["occupation"]["title"]
    region = alert["region"]["name"]
    url = f"{app_url}/results?{urlencode({'occupation': alert['occupation']['code'], 'region': alert['region']['id']})}"
    lines = []
    for label, key in (("Energy project demand (tailwind)", "tailwind"), ("Recent job trend", "jobTrend")):
        delta = after[key] - before[key]
        if abs(delta) >= 1:
            lines.append((label, before[key], after[key], f"{_change_word(delta)} {abs(round(delta))}"))

    subject = f"Your outlook for {job} in {region} changed"
    rows = "".join(
        f'<tr><td style="padding:8px 0;border-top:1px solid {RULE};">{escape(l)}</td>'
        f'<td style="padding:8px 0;border-top:1px solid {RULE};text-align:right;">{round(b)} → <strong>{round(a)}</strong> ({escape(d)})</td></tr>'
        for l, b, a, d in lines
    )
    body = (
        f"<p style='margin:0 0 12px;'>Hi {escape(name or 'there')},</p>"
        f"<p style='margin:0 0 16px;'>AESO's latest grid connection list ({escape(snapshot)}) moved the outlook for "
        f"{escape(job.lower())} in the {escape(region)} region.</p>"
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='font-size:15px;'>{rows}</table>"
        f"<p style='margin:20px 0 0;'><a href='{escape(url)}' style='color:{GREEN};font-weight:bold;'>See the full outlook</a></p>"
        f"<p style='margin:16px 0 0;font-size:14px;color:{MUTED};'>Scores run 0 to 100 and compare this job with others "
        "across Alberta. They're estimates, not a promise of jobs.</p>"
    )
    footer = f"You're getting this because you set up an alert for {escape(job.lower())} in {escape(region)}. " \
             f"<a href='{escape(app_url)}/alerts' style='color:{MUTED};'>Change or turn off your alerts</a>."
    text = "\n".join(
        [f"Hi {name or 'there'},", "",
         f"AESO's latest grid connection list ({snapshot}) moved the outlook for {job.lower()} in the {region} region.", ""]
        + [f"{l}: {round(b)} -> {round(a)} ({d})" for l, b, a, d in lines]
        + ["", f"See the full outlook: {url}", "", f"Change or turn off your alerts: {app_url}/alerts"]
    )
    return {"subject": subject, "html": _wrap(subject, body, footer), "text": text}


def intro_request(requester_name, requester_email, pathway):
    move = f"{pathway['from']['title'].lower()} to {pathway['to']['title'].lower()}"
    subject = f"{requester_name} would like to talk about moving from {move}"
    body = (
        f"<p style='margin:0 0 12px;'>Hi {escape(pathway['firstName'])},</p>"
        f"<p style='margin:0 0 12px;'>{escape(requester_name)} saw that you're looking at a move from "
        f"{escape(move)} in the {escape(pathway['region']['name'])} region, and is making a similar one.</p>"
        f"<p style='margin:0;'>If you'd like to talk, just reply to this email. It goes straight to them. "
        "If not, you don't need to do anything.</p>"
    )
    footer = "You're getting this because you chose to let others making a similar move find you on GridSkills. " \
             "You can turn that off on your saved pathways page."
    text = (f"Hi {pathway['firstName']},\n\n{requester_name} saw that you're looking at a move from {move} in the "
            f"{pathway['region']['name']} region, and is making a similar one.\n\nIf you'd like to talk, reply to this "
            f"email. It goes straight to them ({requester_email}).")
    return {"subject": subject, "html": _wrap(subject, body, footer), "text": text}


def send(ses, sender, to, email, reply_to=None):
    kwargs = {}
    if reply_to:
        kwargs["ReplyToAddresses"] = [reply_to]
    ses.send_email(
        Source=sender,
        Destination={"ToAddresses": [to]},
        Message={
            "Subject": {"Data": email["subject"], "Charset": "UTF-8"},
            "Body": {"Html": {"Data": email["html"], "Charset": "UTF-8"},
                     "Text": {"Data": email["text"], "Charset": "UTF-8"}},
        },
        **kwargs,
    )
