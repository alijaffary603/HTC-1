"""Emails we send through SES: the monthly grid update and introduction requests.

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
<tr><td style="padding:24px 32px 4px;font-family:{FONT};font-size:20px;font-weight:bold;color:{INK};">Signal</td></tr>
<tr><td style="padding:12px 32px 24px;font-family:{FONT};font-size:16px;line-height:24px;color:{INK};">{body_html}</td></tr>
</table>
<p style="max-width:600px;margin:12px auto;font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};">{footer_html}</p>
</body></html>"""


def _change_word(delta):
    return "up" if delta > 0 else "down"


TECH = {
    "data_centre": "data centre", "gas": "gas plant", "solar": "solar farm", "solar_storage": "solar and storage",
    "wind": "wind farm", "wind_storage": "wind and storage", "storage": "battery storage",
    "storage_long": "long-duration storage", "cogen": "cogeneration plant", "industrial_load": "industrial site",
    "distribution_load": "local grid connection", "other_gen": "power plant", "contract_only": "connection contract",
}
STAGE = {
    "cluster": "in a connection cluster", "early": "at an early stage", "mid": "at a middle stage",
    "late": "at a late stage", "isd_review": "with its in-service date under review", "on_hold": "on hold",
}
HEADINGS = {
    "new": "New on AESO’s list", "advanced": "Moving ahead", "earlier": "Coming sooner",
    "delayed": "Delayed", "on_hold": "Put on hold", "left": "No longer waiting",
}
MAX_LISTED = 12
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]


def month_label(value):
    """'2026-11-01' or '2026-11' -> 'November 2026'."""
    try:
        year, month = value.split("-")[:2]
        return f"{MONTHS[int(month) - 1]} {year}"
    except (AttributeError, ValueError, IndexError):
        return value or "an unknown date"


def _what(d):
    return f"{round(d['mw']):,} MW {TECH.get(d['tech'], d['tech'].replace('_', ' ') or 'project')}"


def development_line(d):
    """One sentence about one project, in plain words. Past tense for what changed."""
    what, when = _what(d), month_label(d["isd"]) if d.get("isd") else None
    odds = f" About {round(d['likelihood'] * 100)}% likely to be built." if d.get("likelihood") else ""
    kind = d["kind"]
    if kind == "new":
        return f"{what}, {STAGE.get(d['state'], 'newly listed')}" + (f", expected in service {when}." if when else ".") + odds
    if kind == "advanced":
        return f"Now {STAGE.get(d['state'], d['state'])} (was {STAGE.get(d.get('previousState'), 'earlier')}). {what}" + (f", expected in service {when}." if when else ".")
    if kind in ("earlier", "delayed") and d.get("previousIsd") and when:
        return f"Now expected in service {when} (was {month_label(d['previousIsd'])}). {what}."
    if kind == "delayed":
        return f"Its in-service date is now under review. {what}."
    if kind == "on_hold":
        return f"Put on hold (was {STAGE.get(d.get('previousState'), 'active')}). {what}."
    return f"{what}. It left the waiting list, which means it was built, cancelled or withdrawn."


def grid_update(name, alert, developments, before, after, snapshot, app_url):
    """The monthly email: what changed on AESO's list in the region, and how the outlook moved.

    developments come from developments.changes(). before/after are the alert's summary
    entries from the pipeline, or None if the job isn't in one of the two months.
    """
    job = alert["occupation"]["title"]
    # the app stores a short name ("Northwest Alberta") next to the full one
    region = alert["region"].get("short") or alert["region"]["name"]
    url = f"{app_url}/results?{urlencode({'occupation': alert['occupation']['code'], 'region': alert['region']['id']})}"
    month = month_label(snapshot)

    lines = []
    if before and after:
        for label, key in (("Energy project demand (tailwind)", "tailwind"), ("Recent job trend", "jobTrend")):
            delta = after[key] - before[key]
            if abs(delta) >= 1:
                lines.append((label, before[key], after[key], f"{_change_word(delta)} {abs(round(delta))}"))

    n = len(developments)
    if n:
        subject = f"{n} grid project update{'s' if n != 1 else ''} in the {region} region"
        intro = (f"AESO’s latest connection list ({month}) has {n} change{'s' if n != 1 else ''} in the "
                 f"{region} region, where you’re following {job.lower()}.")
    else:
        subject = f"Your outlook for {job} in {region} changed"
        intro = f"AESO’s latest grid connection list ({month}) moved the outlook for {job.lower()} in the {region} region."

    shown = developments[:MAX_LISTED]
    sections_html, sections_text = "", []
    for kind in ("new", "advanced", "earlier", "delayed", "on_hold", "left"):
        group = [d for d in shown if d["kind"] == kind]
        if not group:
            continue
        sections_html += (f"<p style='margin:20px 0 4px;font-size:13px;font-weight:bold;color:{MUTED};"
                          f"text-transform:none;'>{escape(HEADINGS[kind])}</p>")
        sections_text += ["", HEADINGS[kind]]
        for d in group:
            sections_html += (f"<div style='padding:10px 0;border-top:1px solid {RULE};'>"
                              f"<div style='font-weight:bold;color:{INK};'>{escape(d['name'])}</div>"
                              f"<div style='font-size:14px;line-height:21px;color:{MUTED};margin-top:2px;'>"
                              f"{escape(development_line(d))}</div></div>")
            sections_text += [f"- {d['name']}: {development_line(d)}"]
    if n > len(shown):
        more = n - len(shown)
        sections_html += f"<p style='margin:12px 0 0;font-size:14px;color:{MUTED};'>And {more} more on AESO’s list.</p>"
        sections_text += [f"And {more} more on AESO’s list."]

    rows = "".join(
        f'<tr><td style="padding:8px 0;border-top:1px solid {RULE};">{escape(l)}</td>'
        f'<td style="padding:8px 0;border-top:1px solid {RULE};text-align:right;">{round(b)} → <strong>{round(a)}</strong> ({escape(d)})</td></tr>'
        for l, b, a, d in lines
    )
    outlook = (
        f"<p style='margin:24px 0 8px;font-weight:bold;'>Your outlook for {escape(job.lower())}</p>"
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='font-size:15px;'>{rows}</table>"
        if rows else ""
    )
    body = (
        f"<p style='margin:0 0 12px;'>Hi {escape(name or 'there')},</p>"
        f"<p style='margin:0;'>{escape(intro)}</p>"
        f"{sections_html}{outlook}"
        f"<p style='margin:20px 0 0;'><a href='{escape(url)}' style='color:{GREEN};font-weight:bold;'>See the full outlook</a></p>"
        f"<p style='margin:16px 0 0;font-size:14px;color:{MUTED};'>Scores run 0 to 100 and compare this job with others "
        "across Alberta. They’re estimates, not a promise of jobs.</p>"
    )
    footer = (f"You’re getting this because you asked for monthly grid updates about {escape(job.lower())} in the "
              f"{escape(region)} region. <a href='{escape(app_url)}/alerts' style='color:{MUTED};'>Change or turn off your alerts</a>.")
    text = "\n".join(
        [f"Hi {name or 'there'},", "", intro]
        + sections_text
        + ([""] + [f"{l}: {round(b)} -> {round(a)} ({d})" for l, b, a, d in lines] if lines else [])
        + ["", f"See the full outlook: {url}", "", f"Change or turn off your alerts: {app_url}/alerts"]
    )
    return {"subject": subject, "html": _wrap(subject, body, footer), "text": text}


def outlook_change(name, alert, before, after, snapshot, app_url):
    """The grid update with no project changes: only the outlook moved."""
    return grid_update(name, alert, [], before, after, snapshot, app_url)


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
    footer = "You're getting this because you chose to let others making a similar move find you on Signal. " \
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
