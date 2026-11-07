import { useState, type FormEvent } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { createAlert, deleteAlert, getPostings, getScore, listAlerts, updateAlert, USING_MOCKS } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useAsync } from '../hooks/useAsync'
import { OCCUPATIONS, REGIONS, findOccupation, findRegion, matchesOccupation, regionRef } from '../data/reference'
import { blankSx, sentenceSx } from '../components/sentenceStyles'
import EmailPreview from '../components/EmailPreview'
import { buildAlertEmail, frequencyLabel, windowDays } from '../email/alertEmail'
import type { AlertFrequency, JobAlert, Occupation, User } from '../types'

const FROM = 'Signal alerts <alerts@signal.example>'

// A phrase of the sentence form that wraps as one unit.
const phraseSx = {
  display: 'flex',
  alignItems: 'baseline',
  columnGap: 1.25,
  minWidth: 0,
  '& > span': { whiteSpace: 'nowrap' },
} as const

function nextSendDate(frequency: AlertFrequency, now: Date) {
  const d = new Date(now)
  d.setHours(8, 0, 0, 0)
  if (frequency === 'daily') {
    if (d <= now) d.setDate(d.getDate() + 1)
  } else {
    const daysToMonday = (8 - d.getDay()) % 7 || 7
    d.setDate(d.getDate() + daysToMonday)
  }
  return d
}

function NewAlertForm({
  onCreate,
}: {
  onCreate: (a: { occupation: Occupation; regionId: string; frequency: AlertFrequency }) => void
}) {
  const [params] = useSearchParams()
  const [occupation, setOccupation] = useState<Occupation | null>(
    findOccupation(params.get('occupation') ?? '') ?? null,
  )
  const [regionId, setRegionId] = useState(findRegion(params.get('region') ?? '')?.id ?? '')
  const [frequency, setFrequency] = useState<AlertFrequency>('weekly')
  const [tried, setTried] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (occupation && regionId) onCreate({ occupation, regionId, frequency })
  }
  const missing = tried && (!occupation || !regionId)

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Box sx={{ ...sentenceSx, fontSize: { xs: '1.125rem', sm: '1.375rem' } }}>
        <Box sx={{ ...phraseSx, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
          <span>Email me new</span>
          <Autocomplete
            options={OCCUPATIONS}
            value={occupation ? (findOccupation(occupation.code) ?? null) : null}
            onChange={(_, v) => setOccupation(v)}
            getOptionLabel={(o) => o.title}
            filterOptions={(opts, { inputValue }) => opts.filter((o) => matchesOccupation(o, inputValue))}
            isOptionEqualToValue={(a, b) => a.code === b.code}
            sx={{ flex: { xs: '1 1 auto', sm: '0 0 320px' }, minWidth: 0 }}
            renderInput={(p) => (
              <TextField
                {...p}
                slotProps={{ ...p.slotProps, inputLabel: { ...p.slotProps.inputLabel, shrink: true } }}
                variant="standard"
                label="Job"
                placeholder="job"
                error={tried && !occupation}
                sx={blankSx}
              />
            )}
          />
        </Box>
        <Box sx={phraseSx}>
          <span>postings in</span>
          <TextField
            select
            variant="standard"
            label="Region"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            error={tried && !regionId}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: (v) =>
                  v ? (
                    findRegion(String(v))?.short
                  ) : (
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      your region
                    </Box>
                  ),
              },
            }}
            sx={{ ...blankSx, minWidth: 160 }}
          >
            {REGIONS.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.short}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <TextField
          select
          variant="standard"
          label="How often"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as AlertFrequency)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={blankSx}
        >
          <MenuItem value="daily">every morning</MenuItem>
          <MenuItem value="weekly">every Monday</MenuItem>
        </TextField>
      </Box>
      <Typography variant="body2" color={missing ? 'error' : 'text.secondary'} sx={{ mt: 1.5, minHeight: '1.55em' }}>
        {missing ? (!occupation ? 'Choose a job for this alert.' : 'Choose a region for this alert.') : ''}
      </Typography>
      <Button type="submit" variant="contained" sx={{ mt: 1.5 }}>
        Create alert
      </Button>
    </Box>
  )
}

function AlertRow({
  alert,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  alert: JobAlert
  selected: boolean
  onSelect: () => void
  onToggle: (active: boolean) => void
  onDelete: () => void
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        columnGap: 1,
        py: 2,
        pl: 2,
        pr: 1,
        borderTop: 1,
        borderColor: 'divider',
        borderLeft: 3,
        borderLeftColor: selected ? 'primary.main' : 'transparent',
        bgcolor: selected ? 'action.hover' : 'transparent',
        '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onSelect}
        aria-current={selected}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
        }}
      >
        <Typography variant="h4">{alert.occupation.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {alert.region.short} region. {alert.active ? frequencyLabel(alert.frequency) : 'Paused'}.
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Switch
          checked={alert.active}
          onChange={(e) => onToggle(e.target.checked)}
          slotProps={{ input: { 'aria-label': `Email me about ${alert.occupation.title} in ${alert.region.short}` } }}
        />
        <Button color="inherit" size="small" onClick={onDelete} sx={{ color: 'text.secondary' }}>
          Delete
        </Button>
      </Stack>
    </Box>
  )
}

function Preview({ alert, user }: { alert: JobAlert; user: User }) {
  const days = windowDays(alert.frequency)
  const state = useAsync(
    () =>
      Promise.all([
        getPostings(alert.occupation.code, alert.region.id, days),
        getScore(alert.occupation.code, alert.region.id),
      ]),
    `${alert.id}|${alert.frequency}`,
  )
  // Fixed for the life of this preview so re-renders don't shift the dates.
  const [now] = useState(() => new Date())
  const sendAt = nextSendDate(alert.frequency, now)

  return (
    <Box>
      <Typography variant="h3">Next email</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {alert.active
          ? `Arrives ${sendAt.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })} if there are new postings.`
          : 'This alert is paused. Turn it on to start getting these emails.'}
      </Typography>

      {state.status === 'loading' && <Skeleton variant="rounded" height={420} />}
      {state.status === 'error' && <Alert severity="error">The preview didn’t load: {state.error.message}</Alert>}
      {state.status === 'success' &&
        (state.data[0].length === 0 ? (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', p: 3 }}>
            <Typography>
              No new postings {alert.frequency === 'daily' ? 'since yesterday' : 'this week'}, so this email wouldn’t be
              sent.
            </Typography>
          </Box>
        ) : (
          (() => {
            const email = buildAlertEmail({
              user,
              alert,
              postings: state.data[0],
              tailwind: { low: state.data[1].tailwind.range[0], base: state.data[1].tailwind.score, high: state.data[1].tailwind.range[1] },
              appUrl: window.location.origin,
              now,
            })
            return (
              <EmailPreview
                from={FROM}
                to={user.email}
                date={sendAt}
                subject={email.subject}
                preheader={email.preheader}
                html={email.html}
                text={email.text}
              />
            )
          })()
        ))}
    </Box>
  )
}

export default function AlertsPage() {
  const { user } = useAuth()
  const location = useLocation()
  const state = useAsync(() => (user ? listAlerts() : Promise.resolve([])), `alerts|${user?.id ?? ''}`)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; undo?: JobAlert } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!user) {
    return (
      <Box sx={{ maxWidth: 880 }}>
        <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          Job alerts
        </Typography>
        <Box sx={{ mt: 5, borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 5 }}>
          <Typography variant="h3">Sign in to set up job alerts</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: '52ch' }}>
            We’ll email you new postings for the jobs you choose, every morning or every Monday.
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button
              component={RouterLink}
              to="/sign-in"
              state={{ from: location.pathname + location.search }}
              variant="contained"
            >
              Sign in
            </Button>
            <Button component={RouterLink} to="/sign-up" state={{ from: location.pathname + location.search }}>
              Create an account
            </Button>
          </Stack>
        </Box>
      </Box>
    )
  }

  const alerts = state.status === 'success' ? state.data : []
  const selected = alerts.find((a) => a.id === selectedId) ?? alerts[0]

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.')
    }
  }

  const onCreate = ({
    occupation,
    regionId,
    frequency,
  }: {
    occupation: Occupation
    regionId: string
    frequency: AlertFrequency
  }) =>
    run(async () => {
      const region = regionRef(regionId)!
      const { alert, created } = await createAlert({ occupation, region, frequency })
      setSelectedId(alert.id)
      setToast({ message: created ? 'Alert created.' : 'You already have an alert for this job and region.' })
      state.reload()
    })

  const onToggle = (a: JobAlert, active: boolean) =>
    run(async () => {
      await updateAlert(a.id, { active })
      setToast({
        message: active ? 'Alert turned on.' : 'Alert paused. You won’t get these emails until you turn it back on.',
      })
      state.reload()
    })

  const onDelete = (a: JobAlert) =>
    run(async () => {
      await deleteAlert(a.id)
      setToast({ message: 'Alert deleted.', undo: a })
      state.reload()
    })

  const onUndo = (a: JobAlert) =>
    run(async () => {
      const { alert } = await createAlert({ occupation: a.occupation, region: a.region, frequency: a.frequency })
      if (!a.active) await updateAlert(alert.id, { active: false })
      setSelectedId(alert.id)
      setToast(null)
      state.reload()
    })

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
        Job alerts
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: '62ch' }}>
        We’ll email new postings to {user.email}. Each email only goes out when there’s something new.
      </Typography>

      <Box sx={{ mt: 5, maxWidth: 1000 }}>
        <NewAlertForm onCreate={onCreate} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          mt: { xs: 6, md: 8 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' },
          columnGap: 6,
          rowGap: 5,
          alignItems: 'start',
        }}
      >
        <Box>
          <Typography variant="h2" sx={{ fontSize: '1.75rem' }}>
            Your alerts
          </Typography>
          <Box sx={{ mt: 2 }}>
            {state.status === 'loading' && <Skeleton variant="rounded" height={120} />}
            {state.status === 'error' && <Alert severity="error">Your alerts didn’t load: {state.error.message}</Alert>}
            {state.status === 'success' && alerts.length === 0 && (
              <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 3 }}>
                <Typography>No alerts yet.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Choose a job and region above, or use Job alerts on any outlook page.
                </Typography>
              </Box>
            )}
            {alerts.length > 0 && (
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {alerts.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    selected={a.id === selected?.id}
                    onSelect={() => setSelectedId(a.id)}
                    onToggle={(active) => onToggle(a, active)}
                    onDelete={() => onDelete(a)}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {selected && <Preview key={selected.id} alert={selected} user={user} />}
      </Box>

      {USING_MOCKS && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 6, maxWidth: '70ch' }}>
          This prototype shows sample postings from fictional employers and doesn’t send real emails yet. The email
          above is the exact template the backend will send.
        </Typography>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast?.message}
        action={
          toast?.undo ? (
            <Button color="inherit" size="small" onClick={() => onUndo(toast.undo!)}>
              Undo
            </Button>
          ) : undefined
        }
      />
    </Box>
  )
}
