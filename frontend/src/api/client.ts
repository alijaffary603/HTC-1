import type { AlertFrequency, JobAlert, JobPosting, Match, ModelScore, Occupation, Pathway, Region, SavedResume, SkillsResult } from '../types'
import { mockMatches } from '../mocks/network'
import { mockPostings } from '../mocks/postings'
import { sessionStore } from '../auth/session'
import { freshSession } from '../auth/cognito'

// Single place the UI talks to the backend.
// No VITE_API_URL set -> everything comes from local mocks.
// Set VITE_API_URL (e.g. the API Gateway URL) to call the real API instead.
const API_URL = import.meta.env.VITE_API_URL as string | undefined
export const USING_MOCKS = !API_URL

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms))

/** Thrown when an action needs a signed-in user. */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in to do this.')
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const s = await freshSession()
  return s ? { Authorization: `Bearer ${s.token}` } : {}
}

/** The API sends {"message": "..."} on errors, written to be shown as is. */
async function apiError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null)
  if (res.status === 401) sessionStore.set(null)
  return new Error(body?.message ?? `Something went wrong (${res.status}). Try again.`)
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...init?.headers },
  })
  if (!res.ok) throw await apiError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Real model results, exported from gridskills by scripts/export_app_data.py into
// public/data/scores/<code>.json ({ region: score(...) }). One file per job, cached.
const scoreFiles = new Map<string, Promise<Record<string, ModelScore>>>()

function loadScoreFile(code: string) {
  let file = scoreFiles.get(code)
  if (!file) {
    file = fetch(`${import.meta.env.BASE_URL}data/scores/${encodeURIComponent(code)}.json`).then((res) => {
      if (!res.ok) throw new Error(`We don’t have results for job code ${code}.`)
      return res.json() as Promise<Record<string, ModelScore>>
    })
    file.catch(() => scoreFiles.delete(code))
    scoreFiles.set(code, file)
  }
  return file
}

/** gridskills.api.score(occupation, region): from the exported files, or the API when VITE_API_URL is set. */
export async function getScore(occupation: string, region: string): Promise<ModelScore> {
  if (API_URL) return http(`/score?${new URLSearchParams({ occupation, region })}`)
  const byRegion = await loadScoreFile(occupation)
  const result = byRegion[region]
  if (!result) throw new Error(`We don’t have results for the ${region} region.`)
  return result
}

/** Reads a resume and suggests jobs. Runs in the browser unless VITE_API_URL is set. */
export async function extractSkills(file: File): Promise<SkillsResult> {
  if (USING_MOCKS) {
    const [{ extractResumeText }, { matchResume }] = await Promise.all([
      import('../resume/extractText'),
      import('../resume/matchResume'),
    ])
    return matchResume(await extractResumeText(file))
  }
  const body = new FormData()
  body.append('resume', file)
  const res = await fetch(`${API_URL}/skills`, { method: 'POST', body, headers: await authHeader() })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

/** Emails the person behind a match, with your email as the reply-to. */
export async function requestIntro(matchId: string, region: string): Promise<void> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    await delay(300)
    return
  }
  await http('/intros', { method: 'POST', body: JSON.stringify({ matchId, region }) })
}

export async function getMatches(region: string, from: string, to?: string): Promise<Match[]> {
  if (USING_MOCKS) {
    await delay(300)
    return mockMatches(region, from, to)
  }
  const params = new URLSearchParams({ region, from })
  if (to) params.set('to', to)
  return http(`/matches?${params}`)
}

// --- Saved pathways -------------------------------------------------------
// Each account has its own list. Mock mode keeps them in localStorage, keyed by
// user, until Cognito + DynamoDB exist.

function userKey(): string {
  const s = sessionStore.get()
  if (!s) throw new SignInRequiredError()
  return `gridskills.v2.pathways.${s.user.id}`
}

function readLocal(): Pathway[] {
  try {
    return JSON.parse(localStorage.getItem(userKey()) ?? '[]') as Pathway[]
  } catch (e) {
    if (e instanceof SignInRequiredError) throw e
    return []
  }
}
function writeLocal(p: Pathway[]) {
  const key = userKey()
  try {
    localStorage.setItem(key, JSON.stringify(p))
  } catch {
    /* storage unavailable: ignore */
  }
}

export async function listPathways(): Promise<Pathway[]> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) return readLocal()
  return http('/pathways')
}

export async function savePathway(p: Omit<Pathway, 'id' | 'savedAt'>): Promise<Pathway> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    const all = readLocal()
    const existing = all.find(
      (x) => x.from.code === p.from.code && x.to.code === p.to.code && x.region.id === p.region.id,
    )
    if (existing) return existing
    const saved: Pathway = { ...p, id: crypto.randomUUID(), savedAt: new Date().toISOString() }
    writeLocal([saved, ...all])
    return saved
  }
  return http('/pathways', { method: 'POST', body: JSON.stringify(p) })
}

/** Lets others making a similar move find you. Off until you turn it on. */
export async function setPathwayShare(id: string, share: boolean): Promise<Pathway> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    const all = readLocal()
    const i = all.findIndex((p) => p.id === id)
    if (i < 0) throw new Error('That pathway no longer exists.')
    all[i] = { ...all[i], share }
    writeLocal(all)
    return all[i]
  }
  return http(`/pathways/${id}`, { method: 'PATCH', body: JSON.stringify({ share }) })
}

export async function deletePathway(id: string): Promise<void> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    writeLocal(readLocal().filter((p) => p.id !== id))
    return
  }
  await http(`/pathways/${id}`, { method: 'DELETE' })
}

// --- Job postings and alerts ---------------------------------------------------
// Alerts belong to an account. The backend sends the emails on a schedule
// (EventBridge -> Lambda -> SES) using src/email/alertEmail.ts.

/** Postings for a job in a region, newest first. `sinceDays` limits how far back. */
export async function getPostings(occupation: string, region: string, sinceDays?: number): Promise<JobPosting[]> {
  if (USING_MOCKS) {
    await delay(250)
    const all = mockPostings(occupation, region)
    if (!sinceDays) return all
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000
    return all.filter((p) => new Date(p.postedAt).getTime() >= cutoff)
  }
  const params = new URLSearchParams({ occupation, region })
  if (sinceDays) params.set('sinceDays', String(sinceDays))
  return http(`/postings?${params}`)
}

function alertsKey(): string {
  const s = sessionStore.get()
  if (!s) throw new SignInRequiredError()
  return `gridskills.v2.alerts.${s.user.id}`
}
function readAlerts(): JobAlert[] {
  const key = alertsKey()
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as JobAlert[]
  } catch {
    return []
  }
}
function writeAlerts(a: JobAlert[]) {
  const key = alertsKey()
  try {
    localStorage.setItem(key, JSON.stringify(a))
  } catch {
    /* ignore */
  }
}

export async function listAlerts(): Promise<JobAlert[]> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) return readAlerts()
  return http('/alerts')
}

/** Creates an alert, or returns the existing one for the same job and region. */
export async function createAlert(input: {
  occupation: Occupation
  region: Region
  frequency: AlertFrequency
}): Promise<{ alert: JobAlert; created: boolean }> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    await delay(200)
    const all = readAlerts()
    const existing = all.find((a) => a.occupation.code === input.occupation.code && a.region.id === input.region.id)
    if (existing) return { alert: existing, created: false }
    const alert: JobAlert = {
      id: crypto.randomUUID(),
      occupation: { code: input.occupation.code, title: input.occupation.title },
      region: input.region,
      frequency: input.frequency,
      active: true,
      createdAt: new Date().toISOString(),
    }
    writeAlerts([alert, ...all])
    return { alert, created: true }
  }
  return http('/alerts', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateAlert(id: string, patch: Partial<Pick<JobAlert, 'active' | 'frequency'>>): Promise<JobAlert> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    const all = readAlerts()
    const i = all.findIndex((a) => a.id === id)
    if (i < 0) throw new Error('That alert no longer exists.')
    all[i] = { ...all[i], ...patch }
    writeAlerts(all)
    return all[i]
  }
  return http(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function deleteAlert(id: string): Promise<void> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    writeAlerts(readAlerts().filter((a) => a.id !== id))
    return
  }
  await http(`/alerts/${id}`, { method: 'DELETE' })
}

// --- Saved resume ---------------------------------------------------------------
// One per account, replaced by each new upload, and only when the person chooses to save it.
// Real API: the file goes to a private S3 bucket and the record to DynamoDB (POST /resume).
// Mock mode: only the file name and what was read from it are kept, in this browser.

/** Only the real API keeps the file itself, so only it can offer a download. */
export const CAN_DOWNLOAD_RESUME = !USING_MOCKS

function resumeKey(): string {
  const s = sessionStore.get()
  if (!s) throw new SignInRequiredError()
  return `gridskills.v2.resume.${s.user.id}`
}

export async function getSavedResume(): Promise<SavedResume | null> {
  if (!sessionStore.get()) return null
  if (USING_MOCKS) {
    try {
      return JSON.parse(localStorage.getItem(resumeKey()) ?? 'null') as SavedResume | null
    } catch {
      return null
    }
  }
  const { resume } = await http<{ resume: SavedResume | null }>('/resume')
  return resume
}

/** Reads the resume and saves it to the signed-in person's account in one step. */
export async function saveResume(file: File): Promise<SavedResume> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    const result = await extractSkills(file)
    const saved: SavedResume = { ...result, fileName: file.name, size: file.size, uploadedAt: new Date().toISOString() }
    try {
      localStorage.setItem(resumeKey(), JSON.stringify(saved))
    } catch {
      throw new Error('Your browser couldn’t save the resume. Check that site storage is allowed.')
    }
    return saved
  }
  const body = new FormData()
  body.append('resume', file)
  const res = await fetch(`${API_URL}/resume`, { method: 'POST', body, headers: await authHeader() })
  if (!res.ok) throw await apiError(res)
  return ((await res.json()) as { resume: SavedResume }).resume
}

export async function deleteSavedResume(): Promise<void> {
  if (!sessionStore.get()) throw new SignInRequiredError()
  if (USING_MOCKS) {
    try {
      localStorage.removeItem(resumeKey())
    } catch {
      /* storage unavailable: nothing was saved */
    }
    return
  }
  await http('/resume', { method: 'DELETE' })
}

/** A link to download the saved file that works for a few minutes. */
export async function getSavedResumeFileUrl(): Promise<string> {
  if (!CAN_DOWNLOAD_RESUME) throw new Error('The file itself is only kept when the app runs on AWS.')
  const { url } = await http<{ url: string }>('/resume/file')
  return url
}
