import { useState } from 'react'
import { Alert, Avatar, Box, Button, Chip, MenuItem, Skeleton, Snackbar, Stack, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { getMatches } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { useAuth, useSignInRedirect } from '../auth/useAuth'
import { OCCUPATIONS, REGIONS } from '../data/reference'
import type { Match } from '../types'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function describe(m: Match) {
  return m.kind === 'mentor'
    ? `Moved from ${lower(m.from.title)} to ${lower(m.to.title)}`
    : `Moving from ${lower(m.from.title)} to ${lower(m.to.title)}`
}

// Kept deliberately small for v1 (see Team_split.md: networking scope creep risk).
export default function NetworkPage() {
  const [params, setParams] = useSearchParams()
  const region = params.get('region') ?? 'Calgary'
  const from = params.get('from') ?? '1110'
  const to = params.get('to') ?? undefined
  const [toast, setToast] = useState<string | null>(null)
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const { user } = useAuth()
  const askToSignIn = useSignInRedirect()

  const state = useAsync(() => getMatches(region, from, to), `${region}|${from}|${to}`)

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key !== 'to') next.delete('to')
    setParams(next)
  }
  const clearTo = () => {
    const next = new URLSearchParams(params)
    next.delete('to')
    setParams(next)
  }

  const toTitle = to ? OCCUPATIONS.find((o) => o.code === to)?.title : undefined

  return (
    <Box sx={{ maxWidth: 880 }}>
      <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
        People making a similar move
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: '58ch' }}>
        Others in your region changing jobs the way you are, and mentors who have already made the switch.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
        <TextField
          select
          label="Region"
          value={region}
          onChange={(e) => update('region', e.target.value)}
          sx={{ minWidth: 240 }}
        >
          {REGIONS.map((r) => (
            <MenuItem key={r.id} value={r.id}>
              {r.short}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Current job"
          value={from}
          onChange={(e) => update('from', e.target.value)}
          sx={{ minWidth: 0, flexGrow: 1 }}
        >
          {OCCUPATIONS.map((o) => (
            <MenuItem key={o.code} value={o.code}>
              {o.title}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {toTitle && (
        <Chip label={`Moving to ${lower(toTitle)}`} onDelete={clearTo} sx={{ mt: 2 }} />
      )}

      <Box sx={{ mt: 4 }}>
        {state.status === 'loading' && <Skeleton variant="rounded" height={120} />}
        {state.status === 'error' && <Alert severity="error">People didn’t load: {state.error.message}</Alert>}
        {state.status === 'success' && state.data.length === 0 && (
          <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 4 }}>
            <Typography variant="h3">No one here yet for this move</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Try a nearby region, or save the pathway and come back as more people join.
            </Typography>
          </Box>
        )}
        {state.status === 'success' && state.data.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {state.data.map((m) => (
              <Box
                component="li"
                key={m.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '2.75rem 1fr', sm: '2.75rem 1fr auto' },
                  columnGap: 2,
                  rowGap: 1,
                  py: 3,
                  borderTop: 1,
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: m.kind === 'mentor' ? 'secondary.main' : 'primary.main',
                    color: m.kind === 'mentor' ? 'secondary.contrastText' : 'primary.contrastText',
                    fontWeight: 600,
                  }}
                >
                  {m.firstName[0]}
                </Avatar>
                <Box>
                  <Typography variant="h4">
                    {m.firstName}
                    {m.kind === 'mentor' && (
                      <Typography component="span" variant="body2" color="secondary" sx={{ ml: 1, fontWeight: 500 }}>
                        Mentor
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {describe(m)}, {m.region.short} region.
                  </Typography>
                  <Typography sx={{ mt: 1 }}>{m.blurb}</Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: 2, sm: 3 }, alignSelf: 'start' }}>
                  <Button
                    variant="outlined"
                    disabled={requested.has(m.id)}
                    onClick={() => {
                      if (!user) {
                        askToSignIn(`Sign in to ask ${m.firstName} for an introduction.`)
                        return
                      }
                      setRequested((s) => new Set(s).add(m.id))
                      setToast(`Intro requested from ${m.firstName}.`)
                    }}
                  >
                    {requested.has(m.id) ? 'Requested' : 'Request intro'}
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </Box>
  )
}
