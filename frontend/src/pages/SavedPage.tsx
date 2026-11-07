import { Alert, Box, Button, FormControlLabel, Skeleton, Stack, Switch, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { deletePathway, listPathways, setPathwayShare } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../auth/useAuth'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function SavedPage() {
  const { user } = useAuth()
  const state = useAsync(listPathways, `pathways|${user?.id ?? ''}`)

  const remove = async (id: string) => {
    await deletePathway(id)
    state.reload()
  }

  const share = async (id: string, on: boolean) => {
    await setPathwayShare(id, on)
    state.reload()
  }

  return (
    <Box sx={{ maxWidth: 880 }}>
      <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
        Saved pathways
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>
        Career moves you’re weighing up.
      </Typography>

      {!user && (
        <Box sx={{ mt: 5, borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 5 }}>
          <Typography variant="h3">Sign in to see your saved pathways</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: '52ch' }}>
            Your saved moves are kept with your account, so they’re there whenever you come back.
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button component={RouterLink} to="/sign-in" state={{ from: '/saved' }} variant="contained">
              Sign in
            </Button>
            <Button component={RouterLink} to="/sign-up" state={{ from: '/saved' }}>
              Create an account
            </Button>
          </Stack>
        </Box>
      )}

      {user && (
        <Box sx={{ mt: 5 }}>
          {state.status === 'loading' && <Skeleton variant="rounded" height={96} />}
          {state.status === 'error' && (
            <Alert severity="error">Your saved pathways didn’t load: {state.error.message}</Alert>
          )}

          {state.status === 'success' && state.data.length === 0 && (
            <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 5 }}>
              <Typography variant="h3">Nothing saved yet</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: '52ch' }}>
                Check your job, then choose Save pathway on any role you’d consider moving into.
              </Typography>
              <Button component={RouterLink} to="/" variant="contained">
                Check my job
              </Button>
            </Box>
          )}

          {state.status === 'success' && state.data.length > 0 && (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {state.data.map((p) => (
                <Box
                  component="li"
                  key={p.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
                    columnGap: 4,
                    rowGap: 1.5,
                    alignItems: 'center',
                    py: 3,
                    borderTop: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
                  }}
                >
                  <Box>
                    <Typography variant="h3">{p.to.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      From {p.from.title.toLowerCase()}, in the {p.region.name} region. Saved {fmtDate(p.savedAt)}.
                    </Typography>
                    <FormControlLabel
                      sx={{ mt: 0.5 }}
                      control={<Switch size="small" checked={!!p.share} onChange={(e) => share(p.id, e.target.checked)} />}
                      label={
                        <Typography variant="body2">
                          Let people making a similar move find me (they see your first name only)
                        </Typography>
                      }
                    />
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ ml: { xs: -1.25, md: 0 } }}>
                    <Button
                      component={RouterLink}
                      to={`/results?${new URLSearchParams({ occupation: p.from.code, region: p.region.id })}`}
                    >
                      View outlook
                    </Button>
                    <Button
                      component={RouterLink}
                      to={`/network?${new URLSearchParams({ region: p.region.id, from: p.from.code, to: p.to.code })}`}
                    >
                      Find people
                    </Button>
                    <Button color="inherit" onClick={() => remove(p.id)} sx={{ color: 'text.secondary' }}>
                      Remove
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
