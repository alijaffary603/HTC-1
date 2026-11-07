import type { JobPosting } from '../types'
import { TOWNS, findOccupation, findRegion, type Sector } from './reference'

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
  '11100': ['Staff Accountant', 'Audit Senior (CPA)'],
  '11101': ['Financial Analyst', 'Energy Market Analyst'],
  '12200': ['Bookkeeper', 'Accounts Payable Clerk'],
  '11200': ['HR Generalist', 'Training Coordinator'],
  '13110': ['Administrative Assistant', 'Office Coordinator'],
  '13201': ['Logistics Coordinator', 'Materials Coordinator'],
  '60020': ['Store Manager', 'Assistant Store Manager'],
  '64100': ['Retail Sales Associate', 'Visual Merchandiser'],
  '41220': ['High School Science Teacher', 'Secondary Math Teacher'],
  '41221': ['Grade 3 Teacher', 'Kindergarten Teacher'],
  '41210': ['Electrical Program Instructor', 'Adult Education Instructor'],
  '31301': ['Registered Nurse', 'Community Health Nurse'],
  '21211': ['Data Scientist', 'Grid Analytics Specialist'],
  '21232': ['Software Developer', 'Full-Stack Developer'],
  '21223': ['Database Analyst', 'Data Engineer'],
  '22220': ['Network Technician', 'IT Support Technician'],
  '21300': ['Civil Engineer (EIT)', 'Project Engineer'],
  '21310': ['Electrical Engineer', 'Protection and Controls Engineer'],
  '22310': ['Electrical Technologist', 'SCADA Technician'],
  '22303': ['Construction Estimator', 'Junior Estimator'],
  '70010': ['Construction Manager', 'Site Superintendent'],
  '70012': ['Facility Maintenance Manager', 'Site Operations Lead'],
  '72200': ['Journeyperson Electrician', 'Electrician Apprentice'],
  '72201': ['Industrial Electrician', 'Instrumentation Electrician'],
  '72202': ['Powerline Technician', 'Substation Electrician'],
  '72106': ['Pipe Welder', 'Structural Welder'],
  '72300': ['Plumber', 'Plumbing Apprentice'],
  '72310': ['Carpenter', 'Formwork Carpenter'],
  '72400': ['Millwright', 'Industrial Mechanic'],
  '73400': ['Heavy Equipment Operator', 'Excavator Operator'],
  '92100': ['Power Engineer (4th Class)', 'Plant Operator'],
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
const isHourly = (code: string) => code.startsWith('72') || code.startsWith('73')

const DAY = 24 * 60 * 60 * 1000

/** Postings for a job in a region from roughly the last 10 days, newest first. */
export function mockPostings(occupationCode: string, regionId: string, now = new Date()): JobPosting[] {
  const occ = findOccupation(occupationCode)
  const region = findRegion(regionId)
  if (!occ || !region) return []
  const towns = TOWNS.filter((t) => t.regionId === regionId)
  const titles = TITLES[occ.code] ?? [occ.title]
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
