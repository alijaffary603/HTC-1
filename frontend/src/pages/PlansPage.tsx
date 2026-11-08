import { useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, Link, LinearProgress, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { deleteAdvisorPlan, listAdvisorPlans, toggleAdvisorStep } from '../api/plans'

export default function PlansPage() {
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  let plans: ReturnType<typeof listAdvisorPlans> = []
  try { plans = listAdvisorPlans() } catch { /* show storage recovery below */ }
  function update(action: () => void) {
    try { action(); setVersion(version + 1); setError('') } catch { setError('Your browser could not update saved plans. Check available storage.') }
  }
  return <Box sx={{ maxWidth: 880 }}>
    <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Your action plans</Typography>
    <Typography color="text.secondary" sx={{ mt: 1.5 }}>Plans and progress are saved in this browser on this device. They are not synced to an account.</Typography>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {plans.length === 0 && <Box sx={{ mt: 4 }}><Typography>No plans saved here yet. Open your results to plan a career move.</Typography><Button component={RouterLink} to="/" sx={{ ml: -1.25 }}>Explore my options</Button></Box>}
    <Stack spacing={5} sx={{ mt: 4 }}>{plans.map(p => <Box key={p.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
      <Typography variant="h2">{p.plan.current.title} → {p.plan.target.title}</Typography>
      <Typography color="text.secondary">{p.plan.region} · Saved {new Date(p.savedAt).toLocaleDateString()}</Typography>
      <Typography sx={{ mt: 2 }}>{p.plan.summary}</Typography>
      <LinearProgress variant="determinate" value={100 * p.completedSteps.length / Math.max(p.plan.steps.length, 1)} sx={{ my: 2 }} aria-label="Plan completion" />
      <Typography variant="body2">{p.completedSteps.length} of {p.plan.steps.length} steps complete</Typography>
      {p.plan.steps.map((s, i) => <Box key={i} sx={{ mt: 2 }}>
        <FormControlLabel control={<Checkbox checked={p.completedSteps.includes(i)} onChange={() => update(() => toggleAdvisorStep(p.id, i))} />} label={`Week ${s.week}: ${s.title}`} />
        <Typography sx={{ ml: 4 }}>{s.detail}</Typography>
        {s.resourceIds.map(id => { const r = p.plan.resources.find(x => x.id === id); return r && <Typography key={id} sx={{ ml: 4 }}><Link href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</Link></Typography> })}
      </Box>)}
      <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>{p.plan.outreachDraft}</Typography>
      <Alert severity="info" sx={{ mt: 2 }}>{p.plan.limitations[0]}</Alert>
      <Button color="inherit" onClick={() => update(() => deleteAdvisorPlan(p.id))} sx={{ mt: 2, ml: -1.25 }}>Remove plan</Button>
    </Box>)}</Stack>
  </Box>
}
