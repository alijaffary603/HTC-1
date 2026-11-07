import type { AdvisorRequest, AdvisorPlan } from '../types'

export const MODEL_API_URL = (import.meta.env.VITE_MODEL_API_URL as string | undefined) ?? '/api'

export async function modelRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MODEL_API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}). Please try again.`)
  return body as T
}

export const askAdvisor = (input: AdvisorRequest) => modelRequest<AdvisorPlan>('/advisor', { method: 'POST', body: JSON.stringify(input) })
