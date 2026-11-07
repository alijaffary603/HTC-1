import type { Match } from '../types'
import { OCCUPATIONS, REGIONS } from './reference'

// MOCK people for the "people like you" feature. Fictional.

const occ = (code: string) => {
  const o = OCCUPATIONS.find((x) => x.code === code)!
  return { code: o.code, title: o.title }
}
const region = (id: string) => REGIONS.find((r) => r.id === id)!

const PEOPLE: Match[] = [
  { id: 'm1', firstName: 'Priya', region: region('4830'), from: occ('11100'), to: occ('11101'), kind: 'mentor', blurb: 'Moved from audit to energy-sector finance in 2024.' },
  { id: 'm2', firstName: 'Daniel', region: region('4830'), from: occ('11100'), to: occ('22303'), kind: 'peer', blurb: 'Taking an estimating course this winter.' },
  { id: 'm3', firstName: 'Aisha', region: region('4860'), from: occ('41221'), to: occ('41210'), kind: 'mentor', blurb: 'Teaches electrical pre-apprenticeship at a college.' },
  { id: 'm4', firstName: 'Tom', region: region('4860'), from: occ('41221'), to: occ('11200'), kind: 'peer', blurb: 'Exploring corporate training roles.' },
  { id: 'm5', firstName: 'Mei', region: region('4810'), from: occ('60020'), to: occ('70012'), kind: 'mentor', blurb: 'Runs maintenance at a solar site after 10 years in retail.' },
  { id: 'm6', firstName: 'Carlos', region: region('4810'), from: occ('60020'), to: occ('13201'), kind: 'peer', blurb: 'Retail ops background, learning logistics.' },
  { id: 'm7', firstName: 'Grace', region: region('4830'), from: occ('60020'), to: occ('70010'), kind: 'peer', blurb: 'Starting a construction management certificate.' },
  { id: 'm8', firstName: 'Sam', region: region('4860'), from: occ('72200'), to: occ('72202'), kind: 'mentor', blurb: 'Power system electrician, happy to talk tickets.' },
]

/** Same region first; same move ranked above same starting role. */
export function mockMatches(regionId: string, fromCode: string, toCode?: string): Match[] {
  const score = (m: Match) =>
    (m.region.id === regionId ? 4 : 0) + (m.from.code === fromCode ? 2 : 0) + (toCode && m.to.code === toCode ? 3 : 0)
  return PEOPLE.filter((m) => score(m) >= 2).sort((a, b) => score(b) - score(a))
}
