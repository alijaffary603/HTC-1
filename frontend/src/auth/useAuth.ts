import { useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { sessionStore } from './session'
import { signIn, signOut, signUp } from './authClient'

/** Current user plus sign-in actions. Re-renders when the session changes. */
export function useAuth() {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get)
  return { user: session?.user ?? null, signIn, signUp, signOut }
}

/** State passed to the sign-in / sign-up pages so they can return you afterwards. */
export interface AuthRedirectState {
  from?: string
  reason?: string
}

/** Sends a signed-out visitor to sign in, then back to the current page. */
export function useSignInRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  return (reason: string) =>
    navigate('/sign-in', {
      state: { from: location.pathname + location.search, reason } satisfies AuthRedirectState,
    })
}
