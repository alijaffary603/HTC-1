// Shared data contracts between the frontend, the API, and the model/AI functions.
// DRAFT: these are the "day 1 contracts" from Team_split.md. Agree them with the
// data scientist (score) and computer scientist (skills / gap) before Phase 2.

/** A low / base / high scenario range. Scores are on a 0-100 scale. */
export interface Range {
  low: number
  base: number
  high: number
}

export type Confidence = 'low' | 'medium' | 'high'

export interface Occupation {
  /** NOC 2021 code, e.g. "11100" */
  code: string
  title: string
}

export interface Region {
  /** Region ID used by the model (economic region / planning area) */
  id: string
  name: string
}

export interface Town {
  name: string
  regionId: string
}

export interface LearningResource {
  title: string
  provider: string
  url: string
}

export interface SkillGap {
  skill: string
  importance: 'core' | 'helpful'
  resources: LearningResource[]
}

export interface AdjacentRole {
  occupation: Occupation
  /** 0-1, how close this role is to the user's current role */
  similarity: number
  tailwind: Range
  missingSkills: SkillGap[]
}

export interface ScoreDetail {
  range: Range
  /** One-line plain-language explanation */
  summary: string
}

export type ProjectType = 'solar' | 'wind' | 'storage' | 'gas' | 'data_centre' | 'industrial'
export type ProjectStage = 'early_study' | 'approved' | 'under_construction'

/** Grid projects that drive the score (subset of the project table contract) */
export interface Driver {
  type: ProjectType
  mw: number
  stage: ProjectStage
  /** 0-1 probability the project is actually built (Step A) */
  probability: number
  inServiceYear: number
}

/** Output of score(occupation, region) */
export interface ScoreResult {
  occupation: Occupation
  region: Region
  horizonYears: number
  tailwind: ScoreDetail
  exposure: ScoreDetail
  adjacentRoles: AdjacentRole[]
  drivers: Driver[]
  confidence: Confidence
  modelVersion: string
}

/** Output of extract_skills(text) */
export interface SkillsResult {
  skills: { name: string; confidence: number }[]
  suggestedOccupations: (Occupation & { confidence: number })[]
}

/** A saved pathway: user's current role -> a target role in a region */
export interface Pathway {
  id: string
  from: Occupation
  to: Occupation
  region: Region
  savedAt: string
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
