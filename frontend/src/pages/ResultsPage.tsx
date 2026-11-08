import { useState, type ReactNode } from 'react'
import { Alert, Box, Button, Link, Skeleton, Snackbar, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { createAlert, getScore, listAlerts, savePathway } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { useAuth, useSignInRedirect } from '../auth/useAuth'
import RangeBar from '../components/RangeBar'
import AdvisorPanel from '../components/AdvisorPanel'
import EnergyMap from '../components/EnergyMap'
import { DISPLAY } from '../theme'
import { HORIZON, SNAPSHOT, TECH_LABEL, findRegion, regionRef } from '../data/reference'
import type { ModelScore, Occupation } from '../types'

// Shows gridskills.api.score() following docs/using_the_scores.md:
// lead with score and range, show caveats, "demand from energy projects",
// job trend in the past tense, exposure as description, "your region".

type Role = ModelScore['adjacent_roles'][number]

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-CA')
const fmtPct = (n: number) => `${Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n)}%`
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** Rounds job counts to a sensible precision for display */
const fmtJobs = (n: number) => (n >= 1000 ? fmtInt(Math.round(n / 100) * 100) : n >= 100 ? fmtInt(Math.round(n / 10) * 10) : n >= 10 ? fmtInt(n) : n.toFixed(1))
const level = (score: number) => (score >= 67 ? 'high' : score >= 34 ? 'middle' : 'low')

const SNAPSHOT_LABEL = new Date(`${SNAPSHOT}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
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

function ScoreRow({
  name,
  question,
  summary,
  detail,
  score,
  range,
  color,
}: {
  name: string
  question: string
  summary: string
  detail: ReactNode
  score: number
  range?: [number, number]
  color: 'primary' | 'secondary' | 'info'
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr auto', md: '13rem 1fr 7.5rem' },
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
          {question}
        </Typography>
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, gridRow: { xs: 2, md: 'auto' } }}>
        <Typography sx={{ fontWeight: 500, mb: 2 }}>{summary}</Typography>
        <RangeBar range={{ low: range?.[0] ?? score, base: score, high: range?.[1] ?? score }} color={color} scale />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: '62ch' }}>
          {detail}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: '2.25rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {range ? `likely ${range[0]}–${range[1]}` : 'out of 100'}
        </Typography>
      </Box>
    </Box>
  )
}

function tailwindSummary(score: number) {
  return {
    high: 'Energy projects could add more demand for this job here than for most jobs in Alberta.',
    middle: 'Energy projects could add some demand for this job here.',
    low: 'Energy projects won’t change much for this job here. That says nothing about its outlook overall.',
  }[level(score)]
}

function trendSummary(t: ModelScore['job_trend']) {
  const verb = t.growth_pct_per_year >= 0 ? 'grew' : 'shrank'
  const pace = { high: 'faster than most jobs in Alberta', middle: 'at about a typical pace', low: 'slower than most jobs in Alberta' }[level(t.score)]
  return `This kind of job ${verb} about ${fmtPct(Math.abs(t.growth_pct_per_year))} a year here, ${pace}.`
}

function exposureSummary(score: number) {
  return {
    high: 'This job leans more than most on industries that are shrinking or tied to oil and gas.',
    middle: 'This job leans on shrinking or resource industries about as much as a typical job.',
    low: 'This job leans less than most on shrinking or resource industries.',
  }[level(score)]
}

function RoleRow({
  role,
  peopleUrl,
  saved,
  onSave,
  alertOn,
  onAlert,
}: {
  role: Role
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
        gridTemplateColumns: { xs: '1fr', md: '1fr 16rem auto' },
        columnGap: 5,
        rowGap: 2,
        alignItems: 'center',
        py: { xs: 3, md: 3.5 },
        borderTop: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
      }}
    >
      <Box>
        <Typography variant="h3">{role.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {role.closeness >= 0.99
            ? 'Hires from the same industries as your job.'
            : `Shares about ${Math.round(role.closeness * 100)}% of its industries with your job.`}{' '}
          <Link href="https://alis.alberta.ca/occinfo/" target="_blank" rel="noopener">
            Learn about this job on ALIS
          </Link>
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Tailwind <strong>{role.tailwind}</strong> out of 100
        </Typography>
        <RangeBar range={{ low: role.tailwind, base: role.tailwind, high: role.tailwind }} height={6} />
      </Box>
      <Stack direction={{ xs: 'row', md: 'column' }} spacing={1} sx={{ alignItems: { xs: 'center', md: 'stretch' }, minWidth: { md: 150 }, flexWrap: 'wrap' }}>
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
          <Button onClick={onAlert}>Grid alerts</Button>
        )}
      </Stack>
    </Box>
  )
}

function Drivers({ data }: { data: ModelScore }) {
  const region = findRegion(data.region)
  const techs = data.tailwind.top_technologies
  const jobs = data.tailwind.added_jobs_per_year
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 8, rowGap: 4 }}>
      <Box>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Where the demand for this job comes from
        </Typography>
        {techs.length === 0 ? (
          <Typography color="text.secondary">No planned energy projects in this region add demand for this job.</Typography>
        ) : (
          <Stack spacing={1.75}>
            {techs.map((t) => (
              <Box key={t.technology}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {TECH_LABEL[t.technology] ?? t.technology}
                  </Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(t.share * 100)}%
                  </Typography>
                </Stack>
                <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover' }}>
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'info.main', width: `${Math.max(t.share * 100, 1)}%` }} />
                </Box>
              </Box>
            ))}
          </Stack>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
          About {fmtJobs(jobs.base)} added jobs a year for this job here (likely {fmtJobs(jobs.low)} to {fmtJobs(jobs.high)}),
          around {fmtPct(data.tailwind.percent_of_workforce)} of the {fmtInt(data.tailwind.workforce)} people who do it.
        </Typography>
      </Box>
      {region?.jobsPerYear && (
        <Box>
          <Typography variant="h4" sx={{ mb: 2 }}>
            Across the {region.short} region
          </Typography>
          <Typography sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: '2rem', lineHeight: 1.1 }}>
            {fmtJobs(region.jobsPerYear.base)} jobs a year
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: '44ch' }}>
            from energy projects expected {HORIZON[0]}–{HORIZON[1]}, in every kind of work (likely {fmtJobs(region.jobsPerYear.low)} to{' '}
            {fmtJobs(region.jobsPerYear.high)}).
            {region.topTechnologies[0] && ` Most of it comes from ${lower(TECH_LABEL[region.topTechnologies[0].technology] ?? region.topTechnologies[0].technology)}.`}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

function Results({ data, town }: { data: ModelScore; town: string | null }) {
  const [toast, setToast] = useState<{ message: string; to: string; label: string } | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const region = regionRef(data.region)!
  const { user } = useAuth()
  const askToSignIn = useSignInRedirect()
  const alerts = useAsync(() => (user ? listAlerts() : Promise.resolve([])), `alerts|${user?.id ?? ''}`)
  const hasAlert = (code: string) =>
    alerts.status === 'success' && alerts.data.some((a) => a.occupation.code === code && a.region.id === region.id)

  const onAlert = async (occupation: Occupation) => {
    const job = lower(occupation.title)
    if (!user) {
      askToSignIn(`Sign in to get monthly grid updates for ${job}. You’ll come back to this page.`)
      return
    }
    await createAlert({ occupation, region, frequency: 'monthly' })
    alerts.reload()
    setToast({ message: `Each month we’ll email you what changed on AESO’s list in the ${region.short} region.`, to: '/alerts', label: 'Preview email' })
  }

  const onSave = async (role: Role) => {
    if (!user) {
      askToSignIn(`Sign in to save the move to ${lower(role.title)}. You’ll come back to this page.`)
      return
    }
    await savePathway({ from: data.occupation, to: { code: role.code, title: role.title }, region })
    setSaved((s) => new Set(s).add(role.code))
    setToast({ message: `Saved the move to ${lower(role.title)}.`, to: '/saved', label: 'View saved' })
  }

  const t = data.tailwind
  const trend = data.job_trend
  const ex = data.exposure
  const where =
    town && town !== region.id && town !== region.short ? `${town} is in the ${region.name} region.` : `The ${region.name} region.`

  return (
    <Box sx={{ maxWidth: 1040 }}>
      <Link component={RouterLink} to="/" variant="body2">
        Change job or town
      </Link>
      <Typography variant="h1" sx={{ mt: 2, fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
        {data.occupation.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: '70ch' }}>
        {where} About {fmtInt(t.workforce)} people do this job in your region.
      </Typography>
      <Box sx={{ mt: 2, ml: -1.25 }}>
        {hasAlert(data.occupation.code) ? (
          <Button component={RouterLink} to="/alerts">
            You get monthly grid updates for this job
          </Button>
        ) : (
          <Button onClick={() => onAlert(data.occupation)}>Email me grid updates for this job</Button>
        )}
      </Box>

      <Box sx={{ mt: 3, border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper' }}>
        <ScoreRow
          name="Tailwind"
          question="Could planned energy projects add demand for this job here?"
          summary={tailwindSummary(t.score)}
          score={t.score}
          range={t.range}
          color="primary"
          detail={`Covers energy projects expected ${HORIZON[0]}–${HORIZON[1]}. The range runs from the low to the high scenario.`}
        />
        <ScoreRow
          name="Job trend"
          question="How has this kind of job done lately?"
          summary={trendSummary(trend)}
          score={trend.score}
          color="info"
          detail={`From ${trend.period.replace(/-/g, '–')}, for ${trend.based_on_group.replace(/\s*\[.*\]$/, '')}. Across Alberta this group grew ${fmtPct(trend.occupation_growth_pct_per_year_alberta)} a year, and all jobs in this region grew ${fmtPct(trend.region_employment_growth_pct_per_year)} a year.`}
        />
        <ScoreRow
          name="Exposure"
          question="Does this job lean on shrinking or resource industries?"
          summary={exposureSummary(ex.score)}
          score={ex.score}
          color="secondary"
          detail={`${fmtPct(ex.share_in_mining_oil_gas * 100)} of this job’s work is in mining, oil and gas, and its industries grew about ${fmtPct(ex.sector_growth_pct_per_year)} a year in Alberta. This score is the same in every region.`}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: '75ch' }}>
        Each score ranks this job and region against every other one in Alberta, from 0 to 100. Read them side by side;
        they answer different questions.
      </Typography>

      {data.caveats.length > 0 && (
        <Alert severity="info" variant="outlined" sx={{ mt: 3, '& .MuiAlert-message': { width: '100%' } }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Keep in mind</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {data.caveats.map((c) => (
              <li key={c}>
                <Typography variant="body2">{c}</Typography>
              </li>
            ))}
          </Box>
        </Alert>
      )}

      <EnergyMap key={`map|${data.occupation.code}|${data.region}`} occupation={data.occupation.code} region={data.region} />

      <AdvisorPanel key={`${data.occupation.code}|${data.region}`} result={data} />
      <Section
        id="moves"
        title="Roles you could move into"
        intro="Nearby jobs with a stronger tailwind here. Treat these as a starting point: they’re matched on shared industries, not skills, until resume matching is in."
      >
        {data.adjacent_roles.length === 0 ? (
          <Typography color="text.secondary">No similar job in this region has a stronger tailwind than this one.</Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {data.adjacent_roles.map((r) => (
              <RoleRow
                key={r.code}
                role={r}
                saved={saved.has(r.code)}
                onSave={() => onSave(r)}
                alertOn={hasAlert(r.code)}
                onAlert={() => onAlert({ code: r.code, title: r.title })}
                peopleUrl={`/network?${new URLSearchParams({ region: region.id, from: data.occupation.code, to: r.code })}`}
              />
            ))}
          </Box>
        )}
      </Section>

      <Section id="drivers" title="What’s behind the tailwind">
        <Drivers data={data} />
      </Section>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 8, maxWidth: '70ch' }}>
        Based on AESO’s connection project list from {SNAPSHOT_LABEL} and Statistics Canada employment data. This is an
        early regional signal from planned projects, not a promise of jobs. Projects get delayed and cancelled, so check
        back as the list changes.
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
        <Skeleton variant="rounded" height={360} sx={{ mt: 4 }} />
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
