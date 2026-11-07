import type { Session, User } from '../types'
import { USING_MOCKS } from '../api/client'
import { sessionStore } from './session'

// Sign-up / sign-in. In mock mode accounts live in this browser's localStorage.
// For production, replace the bodies of signUp / signIn / signOut with Amazon
// Cognito calls (e.g. aws-amplify `signUp`, `confirmSignUp`, `signIn`, `signOut`)
// and keep the same signatures, so no UI code changes. Cognito also adds an
// email-confirmation step after sign-up.

export type AuthErrorCode = 'email_taken' | 'invalid_credentials' | 'not_configured'

export class AuthError extends Error {
  code: AuthErrorCode
  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

interface StoredUser extends User {
  passwordHash: string
  createdAt: string
}

const USERS_KEY = 'gridskills.users'
const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const normalise = (email: string) => email.trim().toLowerCase()

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as StoredUser[]
  } catch {
    return []
  }
}
function writeUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    /* ignore */
  }
}

// Mock only: never keep plain passwords, even in a prototype. Real passwords go to Cognito.
async function hash(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`gridskills:${normalise(email)}:${password}`)
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 0
  for (const b of data) h = (Math.imul(h, 31) + b) | 0
  return `weak-${h}`
}

const toSession = (u: StoredUser): Session => ({
  user: { id: u.id, name: u.name, email: u.email },
  token: `mock.${u.id}`,
})

function notConfigured(): never {
  throw new AuthError('not_configured', 'Accounts are not connected to Cognito yet.')
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<Session> {
  if (!USING_MOCKS) notConfigured()
  await delay()
  const email = normalise(input.email)
  const users = readUsers()
  if (users.some((u) => u.email === email)) {
    throw new AuthError('email_taken', 'An account already uses this email. Sign in instead.')
  }
  const user: StoredUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    passwordHash: await hash(email, input.password),
    createdAt: new Date().toISOString(),
  }
  writeUsers([...users, user])
  const session = toSession(user)
  sessionStore.set(session)
  return session
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  if (!USING_MOCKS) notConfigured()
  await delay()
  const email = normalise(input.email)
  const user = readUsers().find((u) => u.email === email)
  // Same message whether the email or the password is wrong, so the form
  // doesn't reveal which emails have accounts.
  if (!user || user.passwordHash !== (await hash(email, input.password))) {
    throw new AuthError('invalid_credentials', 'That email and password don’t match an account.')
  }
  const session = toSession(user)
  sessionStore.set(session)
  return session
}

export async function signOut(): Promise<void> {
  sessionStore.set(null)
}
