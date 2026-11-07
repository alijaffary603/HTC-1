import type {
  AdjacentRole,
  Confidence,
  Driver,
  LearningResource,
  Occupation,
  Range,
  ScoreResult,
  SkillGap,
} from '../types'
import { OCCUPATIONS, findOccupation, findRegion, type Sector } from './reference'

// MOCK stand-in for the data scientist’s score(occupation, region).
// Numbers are made up but deterministic, so the same input always gives the
// same output (useful for demos). Replace by setting VITE_API_URL.

/** Stable 0-1 pseudo-random value from a string */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

const SECTOR_PROFILE: Record<Sector, { tailwind: number; exposure: number }> = {
  power_trades: { tailwind: 0.9, exposure: 0.25 },
  construction: { tailwind: 0.75, exposure: 0.35 },
  tech: { tailwind: 0.7, exposure: 0.3 },
  finance: { tailwind: 0.5, exposure: 0.35 },
  education: { tailwind: 0.45, exposure: 0.2 },
  health: { tailwind: 0.55, exposure: 0.15 },
  admin: { tailwind: 0.4, exposure: 0.45 },
  retail: { tailwind: 0.35, exposure: 0.55 },
}

// Regional growth (from grid projects) and decline (retirements / falling load)
const REGION_PROFILE: Record<string, { growth: number; decline: number; drivers: Driver[] }> = {
  '4810': {
    growth: 0.7,
    decline: 0.2,
    drivers: [
      { type: 'solar', mw: 220, stage: 'under_construction', probability: 0.9, inServiceYear: 2027 },
      { type: 'wind', mw: 300, stage: 'approved', probability: 0.6, inServiceYear: 2028 },
      { type: 'storage', mw: 80, stage: 'early_study', probability: 0.25, inServiceYear: 2029 },
    ],
  },
  '4820': {
    growth: 0.45,
    decline: 0.35,
    drivers: [
      { type: 'wind', mw: 150, stage: 'approved', probability: 0.55, inServiceYear: 2028 },
      { type: 'storage', mw: 60, stage: 'early_study', probability: 0.25, inServiceYear: 2029 },
    ],
  },
  '4830': {
    growth: 0.85,
    decline: 0.15,
    drivers: [
      { type: 'data_centre', mw: 450, stage: 'approved', probability: 0.4, inServiceYear: 2028 },
      { type: 'storage', mw: 120, stage: 'under_construction', probability: 0.85, inServiceYear: 2027 },
      { type: 'data_centre', mw: 1200, stage: 'early_study', probability: 0.1, inServiceYear: 2030 },
    ],
  },
  '4840': {
    growth: 0.35,
    decline: 0.3,
    drivers: [{ type: 'gas', mw: 240, stage: 'early_study', probability: 0.3, inServiceYear: 2029 }],
  },
  '4850': {
    growth: 0.55,
    decline: 0.3,
    drivers: [
      { type: 'industrial', mw: 180, stage: 'approved', probability: 0.6, inServiceYear: 2028 },
      { type: 'solar', mw: 90, stage: 'early_study', probability: 0.3, inServiceYear: 2029 },
    ],
  },
  '4860': {
    growth: 0.8,
    decline: 0.2,
    drivers: [
      { type: 'industrial', mw: 350, stage: 'under_construction', probability: 0.85, inServiceYear: 2027 },
      { type: 'data_centre', mw: 900, stage: 'early_study', probability: 0.12, inServiceYear: 2030 },
      { type: 'gas', mw: 400, stage: 'approved', probability: 0.65, inServiceYear: 2028 },
    ],
  },
  '4870': {
    growth: 0.5,
    decline: 0.4,
    drivers: [
      { type: 'gas', mw: 300, stage: 'approved', probability: 0.6, inServiceYear: 2028 },
      { type: 'industrial', mw: 120, stage: 'early_study', probability: 0.3, inServiceYear: 2029 },
    ],
  },
  '4880': {
    growth: 0.4,
    decline: 0.6,
    drivers: [
      { type: 'industrial', mw: 250, stage: 'approved', probability: 0.55, inServiceYear: 2028 },
      { type: 'gas', mw: 500, stage: 'under_construction', probability: 0.85, inServiceYear: 2027 },
    ],
  },
}

// Hand-picked adjacent moves for the demo personas; others get a default set.
const ADJACENT: Record<string, string[]> = {
  '41221': ['41210', '11200', '13201'], // teacher
  '41220': ['41210', '11200', '21211'],
  '60020': ['70012', '13201', '70010'], // retail manager
  '64100': ['13201', '13110', '72200'],
  '11100': ['11101', '22303', '21211'], // accountant
  '12200': ['11100', '22303', '13201'],
  '72200': ['72202', '72201', '22310'],
}
const DEFAULT_ADJACENT = ['72202', '22310', '92100', '21232', '70012', '73400']

const alis = (title: string): LearningResource => ({
  title,
  provider: 'ALIS (mock link)',
  url: 'https://alis.alberta.ca/',
})

const SKILLS_FOR: Record<string, SkillGap[]> = {
  '41210': [
    { skill: 'Adult learning design', importance: 'core', resources: [alis('Instructional design for adult learners')] },
    { skill: 'Trade or technical specialty', importance: 'helpful', resources: [alis('Apprenticeship and trades overview')] },
  ],
  '11200': [
    { skill: 'Workforce planning', importance: 'core', resources: [alis('HR fundamentals certificate')] },
    { skill: 'Employment law (Alberta)', importance: 'helpful', resources: [alis('Alberta employment standards')] },
  ],
  '13201': [
    { skill: 'Supply chain basics', importance: 'core', resources: [alis('Supply chain management micro-credential')] },
    { skill: 'ERP software', importance: 'helpful', resources: [alis('Intro to ERP systems')] },
  ],
  '70012': [
    { skill: 'Building systems maintenance', importance: 'core', resources: [alis('Facility management certificate')] },
    { skill: 'Energy management', importance: 'helpful', resources: [alis('Energy efficiency for facilities')] },
  ],
  '70010': [
    { skill: 'Project scheduling', importance: 'core', resources: [alis('Construction project management')] },
    { skill: 'Safety certification (COR)', importance: 'core', resources: [alis('Construction safety training')] },
  ],
  '11101': [
    { skill: 'Financial modelling', importance: 'core', resources: [alis('Financial modelling in Excel')] },
    { skill: 'Energy markets', importance: 'helpful', resources: [alis('Intro to Alberta electricity markets')] },
  ],
  '22303': [
    { skill: 'Quantity take-off', importance: 'core', resources: [alis('Construction estimating certificate')] },
    { skill: 'Blueprint reading', importance: 'core', resources: [alis('Reading construction drawings')] },
  ],
  '21211': [
    { skill: 'Python', importance: 'core', resources: [alis('Python for data analysis')] },
    { skill: 'Statistics', importance: 'core', resources: [alis('Applied statistics')] },
  ],
}
const DEFAULT_SKILLS: SkillGap[] = [
  { skill: 'Industry certification', importance: 'core', resources: [alis('Find a program on ALIS')] },
  { skill: 'Workplace safety', importance: 'helpful', resources: [alis('Workplace safety basics')] },
]

function range(base: number, spread: number): Range {
  return { low: clamp(base - spread), base: clamp(base), high: clamp(base + spread) }
}

function tailwindFor(occ: Occupation, regionId: string): Range {
  const sector = OCCUPATIONS.find((o) => o.code === occ.code)?.sector ?? 'admin'
  const region = REGION_PROFILE[regionId]
  const base = 15 + 70 * (0.6 * SECTOR_PROFILE[sector].tailwind + 0.4 * region.growth) + 10 * (hash01(occ.code + regionId) - 0.5)
  return range(base, 8 + 10 * (1 - region.growth))
}

function summarize(kind: 'tailwind' | 'exposure', base: number): string {
  if (kind === 'tailwind') {
    if (base >= 65) return 'Strong growth nearby is likely to need people in your role.'
    if (base >= 40) return 'Some growth nearby touches your role.'
    return 'Little of the expected growth nearby touches your role.'
  }
  if (base >= 55) return 'Parts of your industry here are shrinking or changing fast.'
  if (base >= 30) return 'Some parts of your industry here are changing.'
  return 'Your role looks stable in this region.'
}

export function mockScore(occupationCode: string, regionId: string): ScoreResult {
  const occ = findOccupation(occupationCode)
  const region = findRegion(regionId)
  if (!occ || !region) throw new Error('Unknown occupation or region')

  const profile = REGION_PROFILE[regionId]
  const sector = occ.sector
  const tailwind = tailwindFor(occ, regionId)
  const exposureBase =
    10 + 70 * (0.6 * SECTOR_PROFILE[sector].exposure + 0.4 * profile.decline) + 10 * (hash01(regionId + occ.code) - 0.5)
  const exposure = range(exposureBase, 10)

  const adjacentCodes = (ADJACENT[occ.code] ?? DEFAULT_ADJACENT.filter((c) => c !== occ.code)).slice(0, 3)
  const adjacentRoles: AdjacentRole[] = adjacentCodes.map((code, i) => {
    const target = findOccupation(code)!
    return {
      occupation: { code: target.code, title: target.title },
      similarity: Math.round((0.85 - i * 0.1 - 0.1 * hash01(code)) * 100) / 100,
      tailwind: tailwindFor(target, regionId),
      missingSkills: SKILLS_FOR[code] ?? DEFAULT_SKILLS,
    }
  })

  const spread = tailwind.high - tailwind.low
  const confidence: Confidence = spread < 18 ? 'high' : spread < 24 ? 'medium' : 'low'

  return {
    occupation: { code: occ.code, title: occ.title },
    region,
    horizonYears: 5,
    tailwind: { range: tailwind, summary: summarize('tailwind', tailwind.base) },
    exposure: { range: exposure, summary: summarize('exposure', exposure.base) },
    adjacentRoles,
    drivers: profile.drivers,
    confidence,
    modelVersion: 'mock-0.1',
  }
}
