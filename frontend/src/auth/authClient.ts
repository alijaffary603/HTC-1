import type { Session, User } from '../types'
import { USING_MOCKS } from '../api/client'
import { sessionStore } from './session'
import {
  COGNITO_CONFIGURED,
  CognitoError,
  cognitoConfirm,
  cognitoResendCode,
  cognitoSignIn,
  cognitoSignUp,
} from './cognito'

// Sign-up / sign-in. In mock mode accounts live in this browser's localStorage.
// With the real API they go to Amazon Cognito (see cognito.ts). Cognito adds an
// email-confirmation step: signUp throws 'confirm_required', the page asks for the
// code, then calls confirmSignUp, which also signs you in.

export type AuthErrorCode =
  | 'email_taken'
  | 'invalid_credentials'
  | 'not_configured'
  | 'confirm_required'
  | 'invalid_code'
  | 'weak_password'

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

/** Cognito's error types, in words people can act on. */
function fromCognito(e: unknown): never {
  if (!(e instanceof CognitoError)) throw e
  switch (e.type) {
    case 'UsernameExistsException':
      throw new AuthError('email_taken', 'An account already uses this email. Sign in instead.')
    case 'UserNotConfirmedException':
      throw new AuthError('confirm_required', 'Enter the code we emailed you to finish setting up your account.')
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      throw new AuthError('invalid_credentials', 'That email and password don’t match an account.')
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      throw new AuthError('invalid_code', 'That code didn’t work. Check the email or ask for a new one.')
    case 'InvalidPasswordException':
      throw new AuthError('weak_password', e.message)
    default:
      throw new AuthError('not_configured', 'Sign-in isn’t working right now. Try again in a minute.')
  }
}

async function cognitoOnly<T>(fn: () => Promise<T>): Promise<T> {
  if (!COGNITO_CONFIGURED) notConfigured()
  try {
    return await fn()
  } catch (e) {
    fromCognito(e)
  }
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<Session> {
  if (!USING_MOCKS) {
    await cognitoOnly(() => cognitoSignUp(input.name.trim(), normalise(input.email), input.password))
    throw new AuthError('confirm_required', `We emailed a code to ${normalise(input.email)}. Enter it to finish.`)
  }
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

/** Finishes a Cognito sign-up with the emailed code, then signs in. */
export async function confirmSignUp(input: { email: string; password: string; code: string }): Promise<Session> {
  const email = normalise(input.email)
  await cognitoOnly(() => cognitoConfirm(email, input.code.trim()))
  return signIn({ email, password: input.password })
}

export async function resendCode(email: string): Promise<void> {
  await cognitoOnly(() => cognitoResendCode(normalise(email)))
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  if (!USING_MOCKS) {
    const session = await cognitoOnly(() => cognitoSignIn(normalise(input.email), input.password))
    sessionStore.set(session)
    return session
  }
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
