import type { AdvisorPlan, SavedAdvisorPlan } from '../types'

// Deliberately device-local; no account/cloud persistence is implied.
const KEY = 'gridskills.advisor.plans.v1'
export function listAdvisorPlans(): SavedAdvisorPlan[] {
  const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
  if (!Array.isArray(data)) throw new Error('Saved plans could not be read.')
  return data as SavedAdvisorPlan[]
}
export function saveAdvisorPlan(plan: AdvisorPlan): SavedAdvisorPlan {
  const saved = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), completedSteps: [], plan }
  localStorage.setItem(KEY, JSON.stringify([saved, ...listAdvisorPlans()].slice(0, 30)))
  return saved
}
export function toggleAdvisorStep(id: string, index: number): void {
  const plans = listAdvisorPlans().map(p => p.id === id ? { ...p, completedSteps: p.completedSteps.includes(index) ? p.completedSteps.filter(i => i !== index) : [...p.completedSteps, index] } : p)
  localStorage.setItem(KEY, JSON.stringify(plans))
}
export function deleteAdvisorPlan(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(listAdvisorPlans().filter(p => p.id !== id)))
}
