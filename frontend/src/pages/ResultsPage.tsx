import { useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Link,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { createAlert, getScore, listAlerts, savePathway } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { useAuth, useSignInRedirect } from '../auth/useAuth'
import RangeBar from '../components/RangeBar'
import { DISPLAY } from '../theme'
import type { AdjacentRole, Driver, Occupation, ScoreDetail, ScoreResult } from '../types'

const TYPE_LABEL: Record<Driver['type'], string> = {
  solar: 'Solar farm',
  wind: 'Wind farm',
  storage: 'Battery storage',
  gas: 'Gas plant',
  data_centre: 'Data centre',
  industrial: 'Industrial site',
  grid: 'Grid connection',
  other: 'Other generation',
}
const STAGE_LABEL: Record<Driver['stage'], string> = {
  early_study: 'Early study',
  approved: 'Approved',
  under_construction: 'Under construction',
  cluster: 'Cluster study',
  early: 'Early stages',
  mid: 'Mid stages',
  late: 'Late stages',
  isd_review: 'Date under review',
  on_hold: 'On hold',
}

const NBSP = ' '
const rangeText = (r: { low: number; high: number }) => `${r.low}–${r.high}`

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: { xs: 7, md: 10 } }}>
      <Typography id={id} variant="h2">
        {title}
      </Typography>
      {intro && (
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: '62ch' }}>
          {intro}
        </Typography>
      )}
      <Box sx={{ mt: 3 }}>{children}</Box>
    </Box>
  )
}

function OutlookRow({
  name,
  explainer,
  detail,
  color,
}: {
  name: string
  explainer: string
  detail: ScoreDetail
  color: 'primary' | 'secondary'
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr auto', md: '13rem 1fr 7rem' },
        columnGap: { xs: 2, md: 4 },
        rowGap: 1.5,
        alignItems: 'start',
        p: { xs: 2.5, md: 3.5 },
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Box>
        <Typography variant="h3" sx={{ color: `${color}.main` }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {explainer}
        </Typography>
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, gridRow: { xs: 2, md: 'auto' } }}>
        <Typography sx={{ fontWeight: 500, mb: 2 }}>{detail.summary}</Typography>
        <RangeBar range={detail.range} color={color} scale />
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: '2rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {rangeText(detail.range)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          out of 100
        </Typography>
      </Box>
    </Box>
  )
}

function RoleRow({
  role,
  peopleUrl,
  saved,
  onSave,
  alertOn,
  onAlert,
}: {
  role: AdjacentRole
  peopleUrl: string
  saved: boolean
  onSave: () => void
  alertOn: boolean
  onAlert: () => void
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '5fr 6fr auto' },
        columnGap: 5,
        rowGap: 2.5,
        py: { xs: 3, md: 4 },
        borderTop: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
      }}
    >
      <Box>
        <Typography variant="h3">{role.occupation.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          {Math.round(role.similarity * 100)}% overlap in the industries both jobs work in. Tailwind{' '}
          {rangeText(role.tailwind)}.
        </Typography>
        <Box sx={{ maxWidth: 280 }}>
          <RangeBar range={role.tailwind} height={6} />
        </Box>
      </Box>

      <Box>
        <Typography variant="h4" sx={{ mb: 1.25 }}>
          Skills to build
        </Typography>
        {role.missingSkills.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            We don’t have a skills list for this role yet.
          </Typography>
        )}
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {role.missingSkills.map((gap) => (
            <Box component="li" key={gap.skill}>
              <Typography sx={{ fontWeight: 500 }}>
                {gap.skill}
                {gap.importance === 'core' && (
                  <Typography component="span" variant="body2" color="secondary" sx={{ ml: 1, fontWeight: 500 }}>
                    needed
                  </Typography>
                )}
              </Typography>
              {gap.resources.map((r) => (
                <Typography key={r.title} variant="body2" color="text.secondary">
                  <Link href={r.url} target="_blank" rel="noopener">
                    {r.title}
                  </Link>
                  {` from ${r.provider}`}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>
      </Box>

      <Stack
        direction={{ xs: 'row', md: 'column' }}
        spacing={1}
        sx={{ alignItems: { xs: 'center', md: 'stretch' }, minWidth: { md: 150 } }}
      >
        <Button variant={saved ? 'text' : 'outlined'} onClick={onSave} disabled={saved}>
          {saved ? 'Saved' : 'Save pathway'}
        </Button>
        <Button component={RouterLink} to={peopleUrl}>
          Find people
        </Button>
        {alertOn ? (
          <Button component={RouterLink} to="/alerts">
            Alerts on
          </Button>
        ) : (
          <Button onClick={onAlert}>Job alerts</Button>
        )}
      </Stack>
    </Box>
  )
}

function ProjectsTable({ drivers }: { drivers: Driver[] }) {
  return (
    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper' }}>
      <Table sx={{ minWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell>Project</TableCell>
            <TableCell align="right">Size</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell align="right">Expected</TableCell>
            <TableCell sx={{ width: '32%' }}>Likely to be built</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {drivers.map((d, i) => (
            <TableRow key={i} sx={{ '&:last-of-type td': { borderBottom: 0 } }}>
              <TableCell sx={{ fontWeight: 500 }}>
                {d.name ?? TYPE_LABEL[d.type]}
                {d.name && (
                  <Typography variant="body2" color="text.secondary">
                    {TYPE_LABEL[d.type]}
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">{`${d.mw.toLocaleString()}${NBSP}MW`}</TableCell>
              <TableCell>{STAGE_LABEL[d.stage]}</TableCell>
              <TableCell align="right">{d.inServiceYear}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <LinearProgress
                    variant="determinate"
                    value={d.probability * 100}
                    color="info"
                    sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                    aria-hidden
                  />
                  <Box component="span" sx={{ minWidth: '3ch', textAlign: 'right' }}>
                    {Math.round(d.probability * 100)}%
                  </Box>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function Results({ data, town }: { data: ScoreResult; town: string | null }) {
  const [toast, setToast] = useState<{ message: string; to: string; label: string } | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const { user } = useAuth()
  const askToSignIn = useSignInRedirect()
  const alerts = useAsync(() => (user ? listAlerts() : Promise.resolve([])), `alerts|${user?.id ?? ''}`)
  const hasAlert = (code: string) =>
    alerts.status === 'success' && alerts.data.some((a) => a.occupation.code === code && a.region.id === data.region.id)

  const onAlert = async (occupation: Occupation) => {
    const job = occupation.title.charAt(0).toLowerCase() + occupation.title.slice(1)
    if (!user) {
      askToSignIn(`Sign in to get emails about new postings for ${job}. You’ll come back to this page.`)
      return
    }
    await createAlert({ occupation, region: data.region, frequency: 'weekly' })
    alerts.reload()
    setToast({
      message: `We’ll email you about ${job} in the ${data.region.name} region when there’s something new.`,
      to: '/alerts',
      label: 'Preview email',
    })
  }

  const onSave = async (role: AdjacentRole) => {
    if (!user) {
      askToSignIn(`Sign in to save the move to ${role.occupation.title.toLowerCase()}. You’ll come back to this page.`)
      return
    }
    await savePathway({ from: data.occupation, to: role.occupation, region: data.region })
    setSaved((s) => new Set(s).add(role.occupation.code))
    setToast({ message: `Saved the move to ${role.occupation.title.toLowerCase()}.`, to: '/saved', label: 'View saved' })
  }

  const where =
    town && town !== data.region.name ? `${town}, in the ${data.region.name} region` : `The ${data.region.name} region`

  return (
    <Box sx={{ maxWidth: 1040 }}>
      <Link component={RouterLink} to="/" variant="body2">
        Change job or town
      </Link>
      <Typography variant="h1" sx={{ mt: 2, fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
        {data.occupation.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>
        {where}. Outlook for the next {data.horizonYears} years, with {data.confidence} confidence.
      </Typography>
      <Box sx={{ mt: 2, ml: -1.25 }}>
        {hasAlert(data.occupation.code) ? (
          <Button component={RouterLink} to="/alerts">
            You get emails about new postings for this job
          </Button>
        ) : (
          <Button onClick={() => onAlert(data.occupation)}>Email me new postings for this job</Button>
        )}
      </Box>

      <Box sx={{ mt: 4, border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper' }}>
        <OutlookRow
          name="Tailwind"
          explainer="Growth near you that needs people in your role"
          detail={data.tailwind}
          color="primary"
        />
        <OutlookRow
          name="Exposure"
          explainer="Parts of your industry here that are shrinking or changing"
          detail={data.exposure}
          color="secondary"
        />
        {data.jobTrend && (
          <OutlookRow
            name="Job trend"
            explainer={`How this kind of job has done here, ${data.jobTrend.period}`}
            detail={{
              range: { low: data.jobTrend.score, base: data.jobTrend.score, high: data.jobTrend.score },
              summary: data.jobTrend.summary,
            }}
            color="primary"
          />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        The shaded band runs from the low to the high scenario. The mark is the base case.
        {data.jobTrend && ` Job trend is based on ${data.jobTrend.basedOnGroup.toLowerCase()}.`}
      </Typography>
      {data.caveats && data.caveats.length > 0 && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
            {data.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </Stack>
        </Alert>
      )}

      <Section
        id="moves"
        title="Roles you could move into"
        intro="Growing roles close to yours, and the skills you’d need to get there."
      >
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {data.adjacentRoles.map((r) => (
            <RoleRow
              key={r.occupation.code}
              role={r}
              saved={saved.has(r.occupation.code)}
              onSave={() => onSave(r)}
              alertOn={hasAlert(r.occupation.code)}
              onAlert={() => onAlert(r.occupation)}
              peopleUrl={`/network?${new URLSearchParams({ region: data.region.id, from: data.occupation.code, to: r.occupation.code })}`}
            />
          ))}
        </Box>
      </Section>

      <Section
        id="projects"
        title={`Grid projects in the ${data.region.name} region`}
        intro="These planned projects drive the estimate above. Each one counts in proportion to how likely it is to be built."
      >
        <ProjectsTable drivers={data.drivers} />
      </Section>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 6, maxWidth: '62ch' }}>
        This is an early regional signal from planned grid projects, not a promise of jobs. Projects get delayed and
        cancelled, so check back as the list changes.
      </Typography>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast?.message}
        action={
          toast && (
            <Button color="inherit" size="small" component={RouterLink} to={toast.to}>
              {toast.label}
            </Button>
          )
        }
      />
    </Box>
  )
}

export default function ResultsPage() {
  const [params] = useSearchParams()
  const occupation = params.get('occupation') ?? ''
  const region = params.get('region') ?? ''
  const town = params.get('town')
  const state = useAsync(() => getScore(occupation, region), `${occupation}|${region}`)

  if (!occupation || !region) {
    return (
      <Alert
        severity="info"
        action={
          <Button component={RouterLink} to="/" color="inherit">
            Choose job and town
          </Button>
        }
      >
        Choose your job and town to see an outlook.
      </Alert>
    )
  }

  if (state.status === 'loading') {
    return (
      <Box sx={{ maxWidth: 1040 }} aria-busy="true">
        <Skeleton variant="text" width={160} />
        <Skeleton variant="text" sx={{ fontSize: '3rem', width: '60%' }} />
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="rounded" height={260} sx={{ mt: 4 }} />
      </Box>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={state.reload}>
            Try again
          </Button>
        }
      >
        The outlook didn’t load: {state.error.message}
      </Alert>
    )
  }

  return <Results data={state.data} town={town} />
}
