import type { JobPosting } from '../types'
import { TOWNS, findOccupation, findRegion, type Sector } from '../data/reference'

// MOCK job postings until a postings source is chosen (see Data_availability.md:
// "Job postings data (licensing/cost)" is still open). Employers are fictional.
// Deterministic for a given job, region and day, so previews are stable.

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

const TITLES: Record<string, string[]> = {
  '1002': ['Finance Manager', 'Controller'],
  '1110': ['Staff Accountant', 'Financial Analyst', 'Audit Senior (CPA)'],
  '1120': ['HR Generalist', 'Training Coordinator'],
  '1220': ['Bookkeeper', 'Accounts Payable Clerk'],
  '1311': ['Administrative Assistant', 'Office Coordinator'],
  '1320': ['Logistics Coordinator', 'Materials Coordinator'],
  '1440': ['Scheduling Coordinator', 'Supply Chain Coordinator'],
  '2121': ['Data Scientist', 'Grid Analytics Specialist'],
  '2122': ['Systems Analyst', 'Database Analyst'],
  '2123': ['Software Developer', 'Full-Stack Developer'],
  '2130': ['Civil Engineer (EIT)', 'Mechanical Engineer'],
  '2131': ['Electrical Engineer', 'Protection and Controls Engineer'],
  '2222': ['Network Technician', 'IT Support Technician'],
  '2230': ['Construction Estimator', 'Engineering Technologist'],
  '2231': ['Electrical Technologist', 'SCADA Technician'],
  '3130': ['Registered Nurse', 'Community Health Nurse'],
  '4121': ['Electrical Program Instructor', 'Adult Education Instructor'],
  '4122': ['Grade 3 Teacher', 'High School Science Teacher', 'Kindergarten Teacher'],
  '6002': ['Store Manager', 'Assistant Store Manager'],
  '6410': ['Retail Sales Associate', 'Visual Merchandiser'],
  '7001': ['Construction Manager', 'Facility Maintenance Manager'],
  '7201': ['Electrical Foreman', 'Site Superintendent'],
  '7210': ['Pipe Welder', 'Structural Welder'],
  '7220': ['Journeyperson Electrician', 'Powerline Technician', 'Substation Electrician'],
  '7230': ['Plumber', 'Pipefitter'],
  '7231': ['Carpenter', 'Formwork Carpenter'],
  '7240': ['Millwright', 'Industrial Mechanic'],
  '7330': ['Class 1 Truck Driver', 'Transit Operator'],
  '7340': ['Heavy Equipment Operator', 'Excavator Operator'],
  '9210': ['Power Engineer (4th Class)', 'Plant Operator'],
}

/** A plausible single job title from a group title when we have no hand-written one. */
function fallbackTitle(groupTitle: string) {
  const first = groupTitle.split(/,| and | \(/)[0].trim()
  return first.endsWith('ss') || !first.endsWith('s') ? first : first.slice(0, -1)
}

const EMPLOYERS: Record<Sector, string[]> = {
  power_trades: ['Highline Renewables', 'Coulee Power Services', 'Parkland Grid Contractors'],
  construction: ['Foothills Build Group', 'Tamarack Civil', 'Kestrel Constructors'],
  tech: ['Northern Lights Data', 'Chinook Analytics', 'Ridgeback Software'],
  finance: ['Northgate Ledger Partners', 'Aspen Parkland Credit Co-op', 'Highline Renewables'],
  education: ['Larkspur Academy', 'Coulee Community College', 'Meadowbrook School District'],
  health: ['Meadowlark Family Clinic', 'Northfield Care Centre', 'Coulee Community Health'],
  retail: ['Prairie Provisions Market', 'Fieldstone Home and Hardware', 'Larch Street Outfitters'],
  admin: ['Coulee Power Services', 'Foothills Build Group', 'Meadowlark Family Clinic'],
}

// Annual salary bands by sector; trades and operators are paid hourly.
const ANNUAL: Record<Sector, [number, number]> = {
  power_trades: [75000, 130000],
  construction: [80000, 135000],
  tech: [75000, 125000],
  finance: [62000, 105000],
  education: [60000, 98000],
  health: [78000, 110000],
  retail: [32000, 68000],
  admin: [45000, 72000],
}
const HOURLY: [number, number] = [32, 52]
const isHourly = (code: string) => /^[789]/.test(code) && !/^[789]00/.test(code)

const DAY = 24 * 60 * 60 * 1000

/** Postings for a job in a region from roughly the last 10 days, newest first. */
export function mockPostings(occupationCode: string, regionId: string, now = new Date()): JobPosting[] {
  const occ = findOccupation(occupationCode)
  const region = findRegion(regionId)
  if (!occ || !region) return []
  const towns = TOWNS.filter((t) => t.regionId === regionId)
  const titles = TITLES[occ.code] ?? [fallbackTitle(occ.title)]
  const employers = EMPLOYERS[occ.sector]
  const dayKey = Math.floor(now.getTime() / DAY)
  const count = 2 + Math.floor(hash01(`${occ.code}|${regionId}|${dayKey}`) * 6)

  const postings: JobPosting[] = []
  for (let i = 0; i < count; i++) {
    const r = (k: string) => hash01(`${occ.code}|${regionId}|${dayKey}|${i}|${k}`)
    const ageHours = Math.floor(r('age') * 10 * 24)
    let salary: JobPosting['salary']
    if (isHourly(occ.code)) {
      const min = Math.round(HOURLY[0] + (HOURLY[1] - HOURLY[0]) * r('pay') * 0.7)
      salary = { min, max: min + 4 + Math.round(r('spread') * 6), per: 'hour' }
    } else {
      const [lo, hi] = ANNUAL[occ.sector]
      const min = Math.round((lo + (hi - lo) * r('pay') * 0.65) / 1000) * 1000
      salary = { min, max: min + Math.round(((hi - lo) * (0.15 + r('spread') * 0.15)) / 1000) * 1000, per: 'year' }
    }
    const id = `${occ.code}-${regionId}-${dayKey}-${i}`
    postings.push({
      id,
      title: titles[Math.floor(r('title') * titles.length)],
      employer: employers[Math.floor(r('employer') * employers.length)],
      occupation: { code: occ.code, title: occ.title },
      region,
      town: towns[Math.floor(r('town') * towns.length)]?.name ?? region.name,
      postedAt: new Date(now.getTime() - ageHours * 60 * 60 * 1000).toISOString(),
      salary,
      url: `https://jobs.example.com/postings/${id}`,
    })
  }
  return postings.sort((a, b) => b.postedAt.localeCompare(a.postedAt))
}
