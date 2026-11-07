import { useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, Link, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { AdvisorPlan, SavedAdvisorPlan, ModelScore } from '../types'
import { askAdvisor } from '../api/advisor'
import { saveAdvisorPlan } from '../api/plans'

export default function AdvisorPanel({ result }: { result: ModelScore }) {
  const [target, setTarget] = useState(result.adjacent_roles[0]?.code ?? result.occupation.code)
  const [experience, setExperience] = useState('')
  const [hours, setHours] = useState(5)
  const [budget, setBudget] = useState(0)
  const [format, setFormat] = useState('Flexible')
  const [question, setQuestion] = useState('Help me choose practical next steps for this transition.')
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [plan, setPlan] = useState<AdvisorPlan | null>(null)
  const [saved, setSaved] = useState<SavedAdvisorPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [notice, setNotice] = useState('')
  const choices = [result.occupation, ...result.adjacent_roles.map(r => ({ code: r.code, title: r.title }))]
    .filter((r, i, all) => all.findIndex(x => x.code === r.code) === i)

  async function submit() {
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await askAdvisor({ occupation: result.occupation.code, region: result.region, target,
        preferences: { experience, hoursPerWeek: hours, budget, format }, question, history: history.slice(-8) })
      setPlan(next); setSaved(null)
      setHistory(h => [...h, { role: 'user', text: question }, { role: 'assistant', text: next.summary }].slice(-8) as typeof history)
      setQuestion('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Your plan could not be generated.') }
    finally { setBusy(false) }
  }

  const links = (ids: string[]) => ids.map(id => {
    const r = plan?.resources.find(x => x.id === id)
    return r && <Typography key={id} variant="body2"><Link href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</Link> · {r.provider}</Typography>
  })

  return <Box component="section" sx={{ mt: 7 }} aria-labelledby="advisor-title">
    <Typography id="advisor-title" variant="h2">Plan my next steps</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Explore a career move with an AI advisor using your regional results and source-linked resources.</Typography>
    <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); void submit() }}>
      <TextField select label="Role to explore" value={target} disabled={busy} onChange={e => { setTarget(e.target.value); setHistory([]); setPlan(null); setSaved(null) }}>
        {choices.map(o => <MenuItem key={o.code} value={o.code}>{o.title}</MenuItem>)}
      </TextField>
      <TextField label="Your experience and skills" placeholder="For example: customer service, scheduling, Excel. Leave out contact details." value={experience} disabled={busy} multiline minRows={2} onChange={e => setExperience(e.target.value)} slotProps={{ htmlInput: { maxLength: 3000 } }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Study hours per week" type="number" value={hours} disabled={busy} onChange={e => setHours(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 80, required: true } }} />
        <TextField label="Training budget (CAD)" type="number" value={budget} disabled={busy} onChange={e => setBudget(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 100000, required: true } }} />
        <TextField select label="Learning preference" value={format} disabled={busy} onChange={e => setFormat(e.target.value)} sx={{ minWidth: 180 }}>
          {['Flexible', 'Online', 'In person', 'Evenings'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
      </Stack>
      <TextField label={plan ? 'Ask a follow-up question' : 'What would you like help with?'} value={question} disabled={busy} multiline minRows={2} onChange={e => setQuestion(e.target.value)} slotProps={{ htmlInput: { maxLength: 3000, required: true } }} />
      <FormControlLabel control={<Checkbox checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />} label="Send my skills, preferences, question and recent conversation to Google Gemini for career guidance." />
      <Box><Button type="submit" variant="contained" disabled={busy || !consent || !question.trim()}>{busy ? 'Preparing your plan…' : plan ? 'Ask and update plan' : 'Build my action plan'}</Button></Box>
      {busy && <LinearProgress aria-label="Preparing action plan" />}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
    </Stack>
    {plan && <Stack spacing={3} sx={{ mt: 4 }} aria-live="polite">
      <Typography variant="h3">Your move to {plan.target.title}</Typography>
      <Typography>{plan.summary}</Typography>
      <Box><Typography variant="h4">Skills you may bring</Typography><Typography variant="body2" color="text.secondary">Suggestions based on your self-report; confirm them against the role.</Typography>
        <Box component="ul">{plan.transferableSkills.map((s, i) => <li key={i}>{s}</li>)}</Box></Box>
      <Box><Typography variant="h4">Skills and requirements to investigate</Typography>{plan.skillGaps.map((g, i) => <Box key={i} sx={{ mt: 2 }}><Typography sx={{ fontWeight: 600 }}>{g.skill}</Typography><Typography>{g.reason}</Typography>{links(g.resourceIds)}</Box>)}</Box>
      <Box><Typography variant="h4">Your action checklist</Typography>{plan.steps.map((s, i) => <Box key={i} sx={{ mt: 2 }}><Typography sx={{ fontWeight: 600 }}>Week {s.week}: {s.title}</Typography><Typography>{s.detail}</Typography>{links(s.resourceIds)}</Box>)}</Box>
      <Box><Typography variant="h4">People and conversations</Typography>
        {plan.mentorIds.length === 0 && <Typography sx={{ mt: 1 }}>No opted-in mentor matches yet. Explore career coaching below, or use this draft to ask someone in the field for an informational conversation.</Typography>}
        {plan.mentors.filter(m => plan.mentorIds.includes(m.id)).map(m => <Typography key={m.id}><Link href={m.url} target="_blank" rel="noopener noreferrer">{m.name}</Link> — {m.reason}</Typography>)}
        <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>{plan.outreachDraft}</Typography>
        <Button onClick={async () => { try { await navigator.clipboard.writeText(plan.outreachDraft); setNotice('Draft copied. You can edit it before sending.') } catch { setError('Copy is unavailable. Select the draft text to copy it.') } }}>Copy introduction draft</Button>
      </Box>
      <Box><Typography variant="h4">Resources to explore</Typography>{plan.resources.filter(r => plan.resourceIds.includes(r.id) || r.kind === 'network').map(r => <Box key={r.id} sx={{ mt: 2 }}>{links([r.id])}<Typography variant="body2">{r.description}</Typography><Typography variant="caption" color="text.secondary">Source checked {r.checkedOn}; confirm current details with the provider.</Typography></Box>)}</Box>
      {plan.questions.length > 0 && <Box><Typography variant="h4">Questions to consider</Typography><Box component="ul">{plan.questions.map((q, i) => <li key={i}>{q}</li>)}</Box></Box>}
      <Alert severity="info">{[...new Set(plan.limitations)].join(' ')}</Alert>
      <Box><Button variant="outlined" disabled={busy || !!saved} onClick={() => { try { setSaved(saveAdvisorPlan(plan)); setNotice('Plan saved on this device. Open Plans to track your steps.') } catch { setError('Your browser could not save this plan. Check available storage.') } }}>{saved ? 'Saved on this device' : 'Save plan and track progress'}</Button></Box>
    </Stack>}
  </Box>
}
