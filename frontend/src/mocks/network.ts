import type { Match } from '../types'
import { OCCUPATIONS, REGIONS } from '../data/reference'

// MOCK people for the "people like you" feature. Fictional.

const occ = (code: string) => {
  const o = OCCUPATIONS.find((x) => x.code === code)!
  return { code: o.code, title: o.title }
}
const region = (id: string) => {
  const r = REGIONS.find((x) => x.id === id)!
  return { id: r.id, name: r.name, short: r.short }
}

const PEOPLE: Match[] = [
  { id: 'm1', firstName: 'Priya', region: region('Calgary'), from: occ('1110'), to: occ('1002'), kind: 'mentor', blurb: 'Went from audit to running finance for a solar developer in 2024.' },
  { id: 'm2', firstName: 'Daniel', region: region('Calgary'), from: occ('1110'), to: occ('2230'), kind: 'peer', blurb: 'Taking a construction estimating course this winter.' },
  { id: 'm3', firstName: 'Aisha', region: region('Edmonton'), from: occ('4122'), to: occ('4121'), kind: 'mentor', blurb: 'Teaches electrical pre-apprenticeship at a college.' },
  { id: 'm4', firstName: 'Tom', region: region('Edmonton'), from: occ('4122'), to: occ('1120'), kind: 'peer', blurb: 'Exploring corporate training roles.' },
  { id: 'm5', firstName: 'Mei', region: region('Lethbridge-Medicine Hat'), from: occ('6002'), to: occ('7001'), kind: 'mentor', blurb: 'Runs maintenance at a solar site after 10 years in retail.' },
  { id: 'm6', firstName: 'Carlos', region: region('Lethbridge-Medicine Hat'), from: occ('6002'), to: occ('1320'), kind: 'peer', blurb: 'Retail operations background, learning logistics.' },
  { id: 'm7', firstName: 'Grace', region: region('Calgary'), from: occ('6002'), to: occ('7001'), kind: 'peer', blurb: 'Starting a construction management certificate.' },
  { id: 'm8', firstName: 'Sam', region: region('Edmonton'), from: occ('7220'), to: occ('7201'), kind: 'mentor', blurb: 'Electrical supervisor on solar builds. Happy to talk tickets.' },
]

/** Same region first; same move ranked above same starting role. */
export function mockMatches(regionId: string, fromCode: string, toCode?: string): Match[] {
  const score = (m: Match) =>
    (m.region.id === regionId ? 4 : 0) + (m.from.code === fromCode ? 2 : 0) + (toCode && m.to.code === toCode ? 3 : 0)
  return PEOPLE.filter((m) => score(m) >= 2).sort((a, b) => score(b) - score(a))
}
