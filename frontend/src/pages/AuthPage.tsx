import { useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { USING_MOCKS } from '../api/client'
import { AuthError } from '../auth/authClient'
import { useAuth, type AuthRedirectState } from '../auth/useAuth'
import hero1200 from '../assets/hero-1200.jpg'

type Mode = 'sign-in' | 'sign-up'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

const COPY: Record<Mode, { title: string; intro: string; submit: string; busy: string }> = {
  'sign-in': {
    title: 'Sign in',
    intro: 'Pick up where you left off with your saved pathways and introductions.',
    submit: 'Sign in',
    busy: 'Signing in',
  },
  'sign-up': {
    title: 'Create your account',
    intro: 'Save the moves you’re considering and meet people who are making them.',
    submit: 'Create account',
    busy: 'Creating account',
  },
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { user, signIn, signUp, confirmSignUp, resendCode } = useAuth()
  const navigate = useNavigate()
  const state = (useLocation().state ?? {}) as AuthRedirectState
  const returnTo = state.from ?? '/'
  const copy = COPY[mode]

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cognito emails a code after sign-up (or when an unconfirmed account signs in)
  const [confirming, setConfirming] = useState(false)
  const [code, setCode] = useState('')
  const [info, setInfo] = useState<string | null>(null)

  if (user && !busy) return <Navigate to={returnTo} replace />

  const errors = {
    name: mode === 'sign-up' && !name.trim() ? 'Enter your first name.' : null,
    email: !email.trim() ? 'Enter your email.' : !EMAIL_RE.test(email.trim()) ? 'Enter an email like name@example.com.' : null,
    password: !password
      ? 'Enter your password.'
      : mode === 'sign-up' && password.length < MIN_PASSWORD
        ? `Use at least ${MIN_PASSWORD} characters.`
        : null,
  }
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (errors.name || errors.email || errors.password) return
    if (confirming && !code.trim()) {
      setError('Enter the code from the email.')
      return
    }
    setBusy(true)
    try {
      if (confirming) await confirmSignUp({ email, password, code })
      else if (mode === 'sign-up') await signUp({ name, email, password })
      else await signIn({ email, password })
      navigate(returnTo, { replace: true })
    } catch (err) {
      if (err instanceof AuthError && err.code === 'confirm_required') {
        setConfirming(true)
        setInfo(err.message)
      } else {
        setError(err instanceof AuthError || err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
      setBusy(false)
    }
  }

  const onResend = async () => {
    setError(null)
    try {
      await resendCode(email)
      setInfo(`We sent a new code to ${email.trim()}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t send a new code. Try again.')
    }
  }

  const other = mode === 'sign-in' ? ('sign-up' as const) : ('sign-in' as const)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '5fr 6fr' },
        columnGap: { md: 10 },
        alignItems: 'start',
      }}
    >
      <Box sx={{ maxWidth: 440, pt: { md: 4 } }}>
        <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          {copy.title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
          {copy.intro}
        </Typography>

        {state.reason && (
          <Alert severity="info" sx={{ mt: 3 }}>
            {state.reason}
          </Alert>
        )}

        <Box component="form" onSubmit={onSubmit} noValidate sx={{ mt: 4 }}>
          <Stack spacing={2.5}>
            {mode === 'sign-up' && (
              <TextField
                label="First name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                error={!!show('name')}
                helperText={show('name')}
                autoFocus
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              error={!!show('email')}
              helperText={show('email')}
              autoFocus={mode === 'sign-in'}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              error={!!show('password')}
              helperText={show('password') ?? (mode === 'sign-up' ? `At least ${MIN_PASSWORD} characters.` : undefined)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            {confirming && (
              <TextField
                label="Code from the email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                helperText={
                  <Link component="button" type="button" onClick={onResend} color="text.primary">
                    Send a new code
                  </Link>
                }
                autoFocus
              />
            )}
          </Stack>

          {info && !error && (
            <Alert severity="info" sx={{ mt: 3 }}>
              {info}
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={busy}
            sx={{ mt: 3 }}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {busy ? copy.busy : confirming ? 'Confirm and sign in' : copy.submit}
          </Button>
        </Box>

        <Typography color="text.secondary" sx={{ mt: 3 }}>
          {mode === 'sign-in' ? 'New to Signal? ' : 'Already have an account? '}
          <Link component={RouterLink} to={`/${other}`} state={state} color="text.primary">
            {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
          </Link>
        </Typography>

        {USING_MOCKS && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
            While Signal is a prototype, accounts are stored in this browser only.
          </Typography>
        )}
      </Box>

      <Box
        component="img"
        src={hero1200}
        alt=""
        sx={{
          display: { xs: 'none', md: 'block' },
          width: '100%',
          height: 'min(620px, 72vh)',
          objectFit: 'cover',
          objectPosition: 'center 65%',
          borderRadius: '10px',
        }}
      />
    </Box>
  )
}
