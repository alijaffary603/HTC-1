import type { GridDevelopment, JobAlert, User } from '../types'

// The monthly grid update email, for the preview on the Alerts page.
// This is a TypeScript copy of grid_update() in backend/gridapi/emails.py, which is
// what actually gets sent. Keep the two in step: same wording, same layout.

export interface AlertEmailInput {
  user: Pick<User, 'name' | 'email'>
  alert: JobAlert
  /** Changes in the alert's region, from GET /api/developments */
  developments: GridDevelopment[]
  /** The newer of the two monthly lists compared, e.g. "2026-11-01" */
  snapshot: string | null
  /** Base URL of the app, e.g. https://gridskills.ca */
  appUrl: string
}

export interface AlertEmail {
  subject: string
  preheader: string
  html: string
  text: string
}

const INK = '#1B2A31'
const MUTED = '#4F5E65'
const GREEN = '#2E6B3F'
const RULE = '#E3E7E0'
const FONT = 'Arial, Helvetica, sans-serif'

const TECH: Record<string, string> = {
  data_centre: 'data centre',
  gas: 'gas plant',
  solar: 'solar farm',
  solar_storage: 'solar and storage',
  wind: 'wind farm',
  wind_storage: 'wind and storage',
  storage: 'battery storage',
  storage_long: 'long-duration storage',
  cogen: 'cogeneration plant',
  industrial_load: 'industrial site',
  distribution_load: 'local grid connection',
  other_gen: 'power plant',
  contract_only: 'connection contract',
}
const STAGE: Record<string, string> = {
  cluster: 'in a connection cluster',
  early: 'at an early stage',
  mid: 'at a middle stage',
  late: 'at a late stage',
  isd_review: 'with its in-service date under review',
  on_hold: 'on hold',
}
export const HEADINGS: Record<GridDevelopment['kind'], string> = {
  new: 'New on AESO’s list',
  advanced: 'Moving ahead',
  earlier: 'Coming sooner',
  delayed: 'Delayed',
  on_hold: 'Put on hold',
  left: 'No longer waiting',
}
const ORDER: GridDevelopment['kind'][] = ['new', 'advanced', 'earlier', 'delayed', 'on_hold', 'left']
const MAX_LISTED = 12
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/** "2026-11-01" or "2026-11" -> "November 2026" */
export function monthLabel(value: string | null | undefined) {
  const [y, m] = (value ?? '').split('-')
  const name = MONTHS[Number(m) - 1]
  return name && y ? `${name} ${y}` : value || 'an unknown date'
}

const what = (d: GridDevelopment) =>
  `${Math.round(d.mw).toLocaleString('en-CA')} MW ${TECH[d.tech] ?? (d.tech.replace(/_/g, ' ') || 'project')}`

/** One sentence about one project, in plain words. Same wording as development_line() in emails.py. */
export function developmentLine(d: GridDevelopment) {
  const size = what(d)
  const when = d.isd ? monthLabel(d.isd) : null
  const odds = d.likelihood ? ` About ${Math.round(d.likelihood * 100)}% likely to be built.` : ''
  switch (d.kind) {
    case 'new':
      return `${size}, ${STAGE[d.state] ?? 'newly listed'}${when ? `, expected in service ${when}.` : '.'}${odds}`
    case 'advanced':
      return `Now ${STAGE[d.state] ?? d.state} (was ${STAGE[d.previousState ?? ''] ?? 'earlier'}). ${size}${when ? `, expected in service ${when}.` : '.'}`
    case 'earlier':
    case 'delayed':
      if (d.previousIsd && when) return `Now expected in service ${when} (was ${monthLabel(d.previousIsd)}). ${size}.`
      if (d.kind === 'delayed') return `Its in-service date is now under review. ${size}.`
      return `${size}.`
    case 'on_hold':
      return `Put on hold (was ${STAGE[d.previousState ?? ''] ?? 'active'}). ${size}.`
    default:
      return `${size}. It left the waiting list, which means it was built, cancelled or withdrawn.`
  }
}

export function buildAlertEmail({ user, alert, developments, snapshot, appUrl }: AlertEmailInput): AlertEmail {
  const job = alert.occupation.title
  const region = alert.region.short ?? alert.region.name
  const url = `${appUrl}/results?${new URLSearchParams({ occupation: alert.occupation.code, region: alert.region.id })}`
  const month = monthLabel(snapshot)
  const n = developments.length
  const s = n === 1 ? '' : 's'

  const subject = n
    ? `${n} grid project update${s} in the ${region} region`
    : `Your outlook for ${job} in ${region} changed`
  const intro = n
    ? `AESO’s latest connection list (${month}) has ${n} change${s} in the ${region} region, where you’re following ${job.toLowerCase()}.`
    : `AESO’s latest grid connection list (${month}) moved the outlook for ${job.toLowerCase()} in the ${region} region.`

  const shown = developments.slice(0, MAX_LISTED)
  let sections = ''
  const sectionText: string[] = []
  for (const kind of ORDER) {
    const group = shown.filter((d) => d.kind === kind)
    if (!group.length) continue
    sections += `<p style='margin:20px 0 4px;font-size:13px;font-weight:bold;color:${MUTED};'>${esc(HEADINGS[kind])}</p>`
    sectionText.push('', HEADINGS[kind])
    for (const d of group) {
      sections +=
        `<div style='padding:10px 0;border-top:1px solid ${RULE};'>` +
        `<div style='font-weight:bold;color:${INK};'>${esc(d.name)}</div>` +
        `<div style='font-size:14px;line-height:21px;color:${MUTED};margin-top:2px;'>${esc(developmentLine(d))}</div></div>`
      sectionText.push(`- ${d.name}: ${developmentLine(d)}`)
    }
  }
  if (n > shown.length) {
    sections += `<p style='margin:12px 0 0;font-size:14px;color:${MUTED};'>And ${n - shown.length} more on AESO’s list.</p>`
    sectionText.push(`And ${n - shown.length} more on AESO’s list.`)
  }

  const body =
    `<p style='margin:0 0 12px;'>Hi ${esc(user.name || 'there')},</p>` +
    `<p style='margin:0;'>${esc(intro)}</p>` +
    sections +
    `<p style='margin:20px 0 0;'><a href='${esc(url)}' style='color:${GREEN};font-weight:bold;'>See the full outlook</a></p>` +
    `<p style='margin:16px 0 0;font-size:14px;color:${MUTED};'>Scores run 0 to 100 and compare this job with others ` +
    'across Alberta. They’re estimates, not a promise of jobs.</p>'
  const footer =
    `You’re getting this because you asked for monthly grid updates about ${esc(job.toLowerCase())} in the ` +
    `${esc(region)} region. <a href='${esc(appUrl)}/alerts' style='color:${MUTED};'>Change or turn off your alerts</a>.`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#F1F3EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #D9DFD6;border-radius:8px;">
<tr><td style="padding:24px 32px 4px;font-family:${FONT};font-size:20px;font-weight:bold;color:${INK};">Signal</td></tr>
<tr><td style="padding:12px 32px 24px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};">${body}</td></tr>
</table>
<p style="max-width:600px;margin:12px auto;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${footer}</p>
</body></html>`

  const text = [
    `Hi ${user.name || 'there'},`,
    '',
    intro,
    ...sectionText,
    '',
    `See the full outlook: ${url}`,
    '',
    `Change or turn off your alerts: ${appUrl}/alerts`,
  ].join('\n')

  return { subject, preheader: intro, html, text }
}
