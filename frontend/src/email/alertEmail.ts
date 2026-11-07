import type { JobAlert, JobPosting, Range, User } from '../types'

// Job alert email: subject, preheader, HTML and plain-text bodies.
// Pure TypeScript with no React or browser APIs, so the backend (Lambda + SES on
// an EventBridge schedule) can import it unchanged to send the real emails.
// The HTML uses tables and inline styles because many email clients ignore <style>.

export interface AlertEmailInput {
  user: Pick<User, 'name' | 'email'>
  alert: JobAlert
  /** Postings inside the alert's window (last day or last week) */
  postings: JobPosting[]
  /** Optional outlook for this job and region, shown as context */
  tailwind?: Range
  /** Base URL of the app, e.g. https://signal.example */
  appUrl: string
  now?: Date
}

export interface AlertEmail {
  subject: string
  preheader: string
  html: string
  text: string
}

const C = {
  ink: '#1B2A31',
  muted: '#4F5E65',
  green: '#2E6B3F',
  rule: '#E3E7E0',
  page: '#F1F3EE',
  tint: '#EEF3EC',
}
const FONT = 'Arial, Helvetica, sans-serif'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function windowDays(frequency: JobAlert['frequency']) {
  return frequency === 'daily' ? 1 : 7
}

export function frequencyLabel(frequency: JobAlert['frequency']) {
  return frequency === 'daily' ? 'Every morning' : 'Every Monday'
}

export function formatSalary(s: JobPosting['salary']) {
  if (s.per === 'hour') return `$${s.min}–$${s.max} an hour`
  const k = (n: number) => `$${n.toLocaleString('en-CA')}`
  return `${k(s.min)}–${k(s.max)} a year`
}

export function postedAgo(iso: string, now = new Date()) {
  const hours = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 3_600_000))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export function buildAlertEmail({ user, alert, postings, tailwind, appUrl, now = new Date() }: AlertEmailInput): AlertEmail {
  const job = lowerFirst(alert.occupation.title)
  const where = `the ${alert.region.short} region`
  const period = alert.frequency === 'daily' ? 'since yesterday' : 'this week'
  const n = postings.length
  const subject = `${n} new posting${n === 1 ? '' : 's'} for ${job} in ${alert.region.short}`
  const preheader =
    n === 0
      ? `No new postings ${period}.`
      : n === 1
        ? `${postings[0].title} at ${postings[0].employer}.`
        : `${postings[0].title} at ${postings[0].employer}, plus ${n - 1} more.`
  const outlookUrl = `${appUrl}/results?${new URLSearchParams({ occupation: alert.occupation.code, region: alert.region.id })}`
  const manageUrl = `${appUrl}/alerts`
  const intro = `${n} new posting${n === 1 ? '' : 's'} for ${job} in ${where} ${period}.`

  const rows = postings
    .map(
      (p) => `
          <tr>
            <td style="padding:18px 32px;border-top:1px solid ${C.rule};font-family:${FONT};">
              <a href="${esc(p.url)}" style="font-size:17px;line-height:24px;font-weight:bold;color:${C.green};text-decoration:underline;">${esc(p.title)}</a>
              <div style="font-size:14px;line-height:21px;color:${C.muted};margin-top:4px;">${esc(p.employer)}, ${esc(p.town)}</div>
              <div style="font-size:14px;line-height:21px;color:${C.ink};margin-top:2px;">${esc(formatSalary(p.salary))}. Posted ${esc(postedAgo(p.postedAt, now))}.</div>
            </td>
          </tr>`,
    )
    .join('')

  const outlook = tailwind
    ? `
          <tr>
            <td style="padding:8px 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tint};border-radius:6px;">
                <tr>
                  <td style="padding:16px 20px;font-family:${FONT};font-size:14px;line-height:21px;color:${C.ink};">
                    Tailwind for ${esc(job)} in ${esc(where)} is <strong>${tailwind.low}–${tailwind.high}</strong> out of 100.
                    <a href="${esc(outlookUrl)}" style="color:${C.green};font-weight:bold;">See the full outlook</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : ''

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${esc(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${C.page};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #D9DFD6;border-radius:8px;">
          <tr>
            <td style="padding:24px 32px 4px;font-family:${FONT};font-size:20px;font-weight:bold;letter-spacing:-0.2px;color:${C.ink};">Signal</td>
          </tr>
          <tr>
            <td style="padding:12px 32px 20px;font-family:${FONT};font-size:16px;line-height:24px;color:${C.ink};">
              <p style="margin:0 0 10px;">Hi ${esc(user.name)},</p>
              <p style="margin:0;">${esc(intro)}</p>
            </td>
          </tr>${rows}
          <tr><td style="border-top:1px solid ${C.rule};font-size:0;line-height:0;">&nbsp;</td></tr>${outlook}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
            <tr>
              <td style="padding:16px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
                You’re getting this because you asked for ${alert.frequency} emails about ${esc(job)} in ${esc(where)}.
                <a href="${esc(manageUrl)}" style="color:${C.muted};">Change or pause this alert</a>, or
                <a href="${esc(manageUrl)}" style="color:${C.muted};">unsubscribe</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `Hi ${user.name},`,
    '',
    intro,
    '',
    ...postings.flatMap((p) => [
      p.title,
      `${p.employer}, ${p.town}`,
      `${formatSalary(p.salary)}. Posted ${postedAgo(p.postedAt, now)}.`,
      p.url,
      '',
    ]),
    ...(tailwind ? [`Tailwind for ${job} in ${where}: ${tailwind.low}–${tailwind.high} out of 100. ${outlookUrl}`, ''] : []),
    `You’re getting this because you asked for ${alert.frequency} emails about ${job} in ${where}.`,
    `Change, pause or unsubscribe: ${manageUrl}`,
  ].join('\n')

  return { subject, preheader, html, text }
}
