import type { Session } from '../types'
import { sessionStore } from './session'

// Talks to Amazon Cognito's user pool API directly with fetch, so the app doesn't need
// the Amplify SDK. Region and client id come from the build (scripts/deploy.py sets them).

const REGION = import.meta.env.VITE_COGNITO_REGION as string | undefined
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined

export const COGNITO_CONFIGURED = Boolean(REGION && CLIENT_ID)

export class CognitoError extends Error {
  type: string
  constructor(type: string, message: string) {
    super(message)
    this.type = type
  }
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify({ ClientId: CLIENT_ID, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const type = String(data.__type ?? 'Unknown').split('#').pop() ?? 'Unknown'
    throw new CognitoError(type, data.message ?? 'Sign-in service error.')
  }
  return data as T
}

interface AuthResult {
  AuthenticationResult: { IdToken: string; RefreshToken?: string; ExpiresIn: number }
}

function claims(idToken: string): Record<string, string> {
  const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    Array.from(atob(part), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  )
  return JSON.parse(json)
}

function toSession(result: AuthResult['AuthenticationResult'], refreshToken?: string): Session {
  const c = claims(result.IdToken)
  return {
    user: { id: c.sub, name: c.name ?? c.email, email: c.email },
    token: result.IdToken,
    refreshToken: result.RefreshToken ?? refreshToken,
    // refresh a minute early so a request never goes out with a token about to expire
    expiresAt: Date.now() + (result.ExpiresIn - 60) * 1000,
  }
}

export async function cognitoSignUp(name: string, email: string, password: string) {
  await call('SignUp', {
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
    ],
  })
}

export async function cognitoConfirm(email: string, code: string) {
  await call('ConfirmSignUp', { Username: email, ConfirmationCode: code })
}

export async function cognitoResendCode(email: string) {
  await call('ResendConfirmationCode', { Username: email })
}

export async function cognitoSignIn(email: string, password: string): Promise<Session> {
  const r = await call<AuthResult>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  })
  return toSession(r.AuthenticationResult)
}

/** The current session, refreshed first if its token has run out. Null when signed out. */
export async function freshSession(): Promise<Session | null> {
  const s = sessionStore.get()
  if (!s || !COGNITO_CONFIGURED || !s.expiresAt || Date.now() < s.expiresAt) return s
  if (!s.refreshToken) {
    sessionStore.set(null)
    return null
  }
  try {
    const r = await call<AuthResult>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: s.refreshToken },
    })
    const next = toSession(r.AuthenticationResult, s.refreshToken)
    sessionStore.set(next)
    return next
  } catch {
    // refresh token expired or revoked: make them sign in again
    sessionStore.set(null)
    return null
  }
}
