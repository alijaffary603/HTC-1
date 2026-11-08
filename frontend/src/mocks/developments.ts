import type { GridDevelopment, GridDevelopments, GridProject } from '../types'
import { SNAPSHOT } from '../data/reference'

// EXAMPLE grid updates for the local preview. Only one month of AESO's list is in the
// app, so real month-to-month changes can't be worked out here. These are real projects
// in the region with made-up changes, and the result is marked `example: true` so the
// page says so. The live site gets real changes from GET /api/developments.

const EARLY = new Set(['cluster', 'early'])

function monthBefore(snapshot: string) {
  const [y, m] = snapshot.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 10)
}

export function exampleDevelopments(region: string, projects: (GridProject & { region: string })[]): GridDevelopments {
  const here = projects.filter((p) => p.region === region)
  const byExpected = (a: GridProject, b: GridProject) => b.mw * b.likelihood - a.mw * a.likelihood
  const picked = new Set<string>()
  const take = (list: GridProject[], n: number) =>
    list.filter((p) => !picked.has(p.projectId)).slice(0, n).map((p) => (picked.add(p.projectId), p))

  const developments: GridDevelopment[] = [
    ...take(here.filter((p) => EARLY.has(p.state)).sort(byExpected), 2).map((p) => ({ ...p, kind: 'new' as const })),
    ...take(here.filter((p) => p.state === 'late').sort(byExpected), 1).map((p) => ({
      ...p,
      kind: 'advanced' as const,
      previousState: 'mid',
    })),
  ]
  return { snapshot: SNAPSHOT, previous: monthBefore(SNAPSHOT), region, developments, example: true }
}
