// Shared data contracts between the frontend, the API, and the model/AI functions.
// DRAFT: these are the "day 1 contracts" from Team_split.md. Agree them with the
// data scientist (score) and computer scientist (skills / gap) before Phase 2.

/** A low / base / high scenario range. Scores are on a 0-100 scale. */
export interface Range {
  low: number
  base: number
  high: number
}

export interface Occupation {
  /** NOC 2021 minor group, 4 digits, e.g. "4122" (same codes as gridskills.api) */
  code: string
  title: string
}

export interface Region {
  /** Region name as the model uses it, e.g. "Lethbridge-Medicine Hat" */
  id: string
  /** Display name with proper dashes */
  name: string
  /** Short name for sentences ("the ___ region") */
  short: string
}

export interface Town {
  name: string
  regionId: string
}

// ---- Output of gridskills.api.score(occupation, region) -------------------
// Mirrors the model's JSON exactly (snake_case), so the API can return it as is.
// See docs/using_the_scores.md for what each field means and how to show it.

export interface ModelScore {
  occupation: Occupation
  /** Region id */
  region: string
  tailwind: {
    /** Percentile 0-100, base case */
    score: number
    /** [low, high] percentiles */
    range: [number, number]
    added_jobs_per_year: { low: number; base: number; high: number }
    percent_of_workforce: number
    workforce: number
    top_technologies: { technology: string; share: number }[]
  }
  exposure: {
    score: number
    sector_growth_pct_per_year: number
    share_in_mining_oil_gas: number
    region_load_growth_pct_per_year: number
  }
  job_trend: {
    score: number
    growth_pct_per_year: number
    occupation_growth_pct_per_year_alberta: number
    region_employment_growth_pct_per_year: number
    period: string
    based_on_group: string
  }
  adjacent_roles: { code: string; title: string; closeness: number; tailwind: number }[]
  caveats: string[]
}

/** Output of extract_skills(text) */
export interface SkillsResult {
  skills: { name: string; confidence: number }[]
  /** Best-matching job groups; `because` lists the skills that matched */
  suggestedOccupations: (Occupation & { confidence: number; because?: string[] })[]
}

/** A résumé the person chose to save to their account (one per account, replaced on each upload) */
export interface SavedResume extends SkillsResult {
  fileName: string
  /** Bytes */
  size: number
  uploadedAt: string
}

/** A saved pathway: user's current role -> a target role in a region */
export interface Pathway {
  id: string
  from: Occupation
  to: Occupation
  region: Region
  savedAt: string
  /** Shown to others making a similar move. Off unless the owner turns it on. */
  share?: boolean
}

/** Someone in the network for "people like you" matching */
export interface Match {
  id: string
  firstName: string
  region: Region
  from: Occupation
  to: Occupation
  kind: 'mentor' | 'peer'
  blurb: string
}

/** A signed-in user. Maps to a Cognito user (sub, name, email). */
export interface User {
  id: string
  name: string
  email: string
}

export interface Session {
  user: User
  /** Bearer token for the API (Cognito ID token in production) */
  token: string
  /** Cognito only: used to get a new token when this one expires */
  refreshToken?: string
  /** Cognito only: ms timestamp after which the token needs refreshing */
  expiresAt?: number
}

export type AlertFrequency = 'daily' | 'weekly'

/** A saved search that emails new postings for one job in one region. */
export interface JobAlert {
  id: string
  occupation: Occupation
  region: Region
  frequency: AlertFrequency
  active: boolean
  createdAt: string
}

/** A job posting (sample data until a postings source is chosen). */
export interface JobPosting {
  id: string
  title: string
  employer: string
  occupation: Occupation
  region: Region
  town: string
  postedAt: string
  salary: { min: number; max: number; per: 'year' | 'hour' }
  url: string
}

export interface AdvisorRequest {
  occupation: string
  region: string
  target: string
  preferences: { experience: string; hoursPerWeek: number; budget: number; format: string }
  question: string
  history: { role: 'user' | 'assistant'; text: string }[]
}
export interface AdvisorResource {
  id: string; title: string; provider: string; url: string
  kind: 'requirements' | 'training' | 'network'; description: string; checkedOn: string
}
export interface AdvisorPlan {
  summary: string
  transferableSkills: string[]
  skillGaps: { skill: string; reason: string; resourceIds: string[] }[]
  steps: { title: string; detail: string; week: number; resourceIds: string[] }[]
  outreachDraft: string
  questions: string[]
  resourceIds: string[]
  mentorIds: string[]
  resources: AdvisorResource[]
  mentors: { id: string; name: string; url: string; reason: string }[]
  current: Occupation
  target: Occupation
  region: string
  limitations: string[]
}
export interface SavedAdvisorPlan {
  id: string
  savedAt: string
  completedSteps: number[]
  plan: AdvisorPlan
}
