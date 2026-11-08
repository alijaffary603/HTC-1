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
import { createAlert, deleteAlert, getDevelopments, listAlerts, updateAlert, USING_MOCKS } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useAsync } from '../hooks/useAsync'
import { OCCUPATIONS, REGIONS, findOccupation, findRegion, matchesOccupation, regionRef } from '../data/reference'
import { blankSx, sentenceSx } from '../components/sentenceStyles'
import EmailPreview from '../components/EmailPreview'
import { buildAlertEmail, monthLabel } from '../email/alertEmail'
import type { JobAlert, Occupation, User } from '../types'

const FROM = 'Signal alerts <alerts@signal.example>'
const WHEN_SENT =
  'Emails go out once a month, after AESO’s new list, when projects in your region change or your outlook moves by 5 points or more.'

// A phrase of the sentence form that wraps as one unit.
const phraseSx = {
  display: 'flex',
  alignItems: 'baseline',
  columnGap: 1.25,
  minWidth: 0,
  '& > span': { whiteSpace: 'nowrap' },
} as const

/** The monthly pipeline runs on the 12th (docs/aws.md) and the emails go out when it finishes. */
function nextListDate(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), 12, 9, 0, 0)
  if (d <= now) d.setMonth(d.getMonth() + 1)
  return d
}

function NewAlertForm({ onCreate }: { onCreate: (a: { occupation: Occupation; regionId: string }) => void }) {
  const [params] = useSearchParams()
  const [occupation, setOccupation] = useState<Occupation | null>(
    findOccupation(params.get('occupation') ?? '') ?? null,
  )
  const [regionId, setRegionId] = useState(findRegion(params.get('region') ?? '')?.id ?? '')
  const [tried, setTried] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (occupation && regionId) onCreate({ occupation, regionId })
  }
  const missing = tried && (!occupation || !regionId)

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Box sx={{ ...sentenceSx, fontSize: { xs: '1.125rem', sm: '1.375rem' } }}>
        <Box sx={{ ...phraseSx, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
          <span>Email me grid updates for</span>
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
                placeholder="your job"
                error={tried && !occupation}
                sx={blankSx}
              />
            )}
          />
        </Box>
        <Box sx={phraseSx}>
          <span>in</span>
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
  const region = alert.region.short ?? alert.region.name
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
          {region} region. {alert.active ? 'Monthly' : 'Paused'}.
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Switch
          checked={alert.active}
          onChange={(e) => onToggle(e.target.checked)}
          slotProps={{ input: { 'aria-label': `Email me grid updates about ${alert.occupation.title} in ${region}` } }}
        />
        <Button color="inherit" size="small" onClick={onDelete} sx={{ color: 'text.secondary' }}>
          Delete
        </Button>
      </Stack>
    </Box>
  )
}

function Preview({ alert, user }: { alert: JobAlert; user: User }) {
  const state = useAsync(() => getDevelopments(alert.region.id), `${alert.id}|${alert.region.id}`)
  // Fixed for the life of this preview so re-renders don't shift the dates.
  const [now] = useState(() => new Date())
  const sendAt = nextListDate(now)
  const region = alert.region.short ?? alert.region.name

  return (
    <Box>
      <Typography variant="h2" sx={{ fontSize: '1.75rem' }}>
        Next email
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {alert.active
          ? `Arrives after AESO’s next list, around ${sendAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, if anything changes.`
          : 'This alert is paused. Turn it on to start getting these emails.'}
      </Typography>

      {state.status === 'loading' && <Skeleton variant="rounded" height={420} />}
      {state.status === 'error' && <Alert severity="error">The preview didn’t load: {state.error.message}</Alert>}
      {state.status === 'success' &&
        (state.data.developments.length === 0 ? (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', p: 3 }}>
            <Typography>
              {state.data.previous
                ? `No projects in the ${region} region changed between AESO’s ${monthLabel(state.data.previous)} and ${monthLabel(state.data.snapshot)} lists, so no email would go out unless the outlook moved.`
                : 'The first email goes out once there are two monthly lists to compare.'}
            </Typography>
          </Box>
        ) : (
          (() => {
            const email = buildAlertEmail({
              user,
              alert,
              developments: state.data.developments,
              snapshot: state.data.snapshot,
              appUrl: window.location.origin,
            })
            return (
              <>
                <EmailPreview
                  from={FROM}
                  to={user.email}
                  date={sendAt}
                  subject={email.subject}
                  preheader={email.preheader}
                  html={email.html}
                  text={email.text}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  {state.data.example
                    ? `Example: these are real projects in the ${region} region from AESO’s ${monthLabel(state.data.snapshot)} list, but which ones count as new or moving ahead is made up for this preview. Real emails list what actually changed since the month before.`
                    : `Based on what changed between AESO’s ${monthLabel(state.data.previous)} and ${monthLabel(state.data.snapshot)} lists.`}
                </Typography>
              </>
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
          Grid alerts
        </Typography>
        <Box sx={{ mt: 5, borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 5 }}>
          <Typography variant="h3">Sign in to set up grid alerts</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: '58ch' }}>
            Each month, after AESO publishes its connection list, we’ll email you the grid projects that changed in
            your region, for the job you choose.
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

  const onCreate = ({ occupation, regionId }: { occupation: Occupation; regionId: string }) =>
    run(async () => {
      const region = regionRef(regionId)!
      const { alert, created } = await createAlert({ occupation, region, frequency: 'monthly' })
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
        Grid alerts
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: '66ch' }}>
        Each month, after AESO publishes its connection list, we email {user.email} the projects that changed in
        your region: new ones, ones moving ahead or delayed, and ones that dropped off. No changes, no email.
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
          {alerts.length > 0 && (
            // one line, like the line under "Next email", so the list and the email start level
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Pick one to preview its next email.
            </Typography>
          )}
          <Box sx={{ mt: 2 }}>
            {state.status === 'loading' && <Skeleton variant="rounded" height={120} />}
            {state.status === 'error' && <Alert severity="error">Your alerts didn’t load: {state.error.message}</Alert>}
            {state.status === 'success' && alerts.length === 0 && (
              <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 3 }}>
                <Typography>No alerts yet.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Choose a job and region above, or use Grid alerts on any outlook page.
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

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 6, maxWidth: '70ch' }}>
        {USING_MOCKS ? `This prototype doesn’t send emails. On the live site: ${WHEN_SENT.charAt(0).toLowerCase()}${WHEN_SENT.slice(1)}` : WHEN_SENT}
      </Typography>

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
