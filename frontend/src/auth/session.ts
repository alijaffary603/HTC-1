import type { Session } from '../types'

// The current session, shared by the UI (via useAuth) and the API client.
// Persisted in localStorage so a refresh keeps you signed in.

const KEY = 'gridskills.session'
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let current: Session | null = read()

export const sessionStore = {
  get: (): Session | null => current,
  set(next: Session | null) {
    current = next
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next))
      else localStorage.removeItem(KEY)
    } catch {
      /* storage unavailable: session lasts until the tab closes */
    }
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
