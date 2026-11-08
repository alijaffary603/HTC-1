import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { extractSkills, getSavedResume, saveResume, USING_MOCKS } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useAsync } from '../hooks/useAsync'
import { OCCUPATIONS, TOWNS, findOccupation, findRegion, findTown, matchesOccupation } from '../data/reference'
import type { Occupation, SkillsResult, Town } from '../types'
import { blankSx, sentenceSx } from './sentenceStyles'

const EXAMPLES = [
  { label: 'a teacher in Edmonton', occupation: '4122', town: 'Edmonton' },
  { label: 'a retail manager in Lethbridge', occupation: '6002', town: 'Lethbridge' },
  { label: 'an accountant in Calgary', occupation: '1110', town: 'Calgary' },
]

// Each half of the sentence wraps as a unit: "I work as [job]" / "in [town]".
const halfSx = {
  display: 'flex',
  alignItems: 'baseline',
  columnGap: 1.25,
  flex: { xs: '1 1 100%', sm: '1 1 auto' },
  minWidth: 0,
  '& > span': { whiteSpace: 'nowrap' },
} as const

/** "I work as [job] in [town]." The main way into the app. */
export default function OutlookForm() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'pick' | 'resume'>('pick')
  const [occupation, setOccupation] = useState<Occupation | null>(null)
  const [town, setTown] = useState<Town | null>(null)
  const [tried, setTried] = useState(false)

  const [fileName, setFileName] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillsResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Signed-in people can keep their résumé on their account (one per account).
  const { user } = useAuth()
  const [saveToAccount, setSaveToAccount] = useState(true)
  const [justSaved, setJustSaved] = useState(false)
  const saved = useAsync(
    () => (user && mode === 'resume' ? getSavedResume() : Promise.resolve(null)),
    `resume|${user?.id ?? ''}|${mode}`,
  )
  const savedResume = saved.status === 'success' ? saved.data : null
  const saving = !!user && saveToAccount

  const region = town ? findRegion(town.regionId) : undefined

  const go = (occCode: string, t: Town) =>
    navigate(`/results?${new URLSearchParams({ occupation: occCode, region: t.regionId, town: t.name })}`)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (occupation && town) go(occupation.code, town)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSkills(null)
    setError(null)
    setJustSaved(false)
    setParsing(true)
    try {
      const result = saving ? await saveResume(file) : await extractSkills(file)
      applyResult(result)
      if (saving) {
        setJustSaved(true)
        saved.reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t read that file. Try a PDF or Word file.')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  const applyResult = (result: SkillsResult) => {
    setSkills(result)
    const top = result.suggestedOccupations[0]
    if (top) setOccupation(findOccupation(top.code) ?? null)
  }

  const uploadNote = USING_MOCKS
    ? saving
      ? 'PDF, Word (.docx) or plain text. It’s read on this device, and what we find is saved to your account in this browser.'
      : 'PDF, Word (.docx) or plain text. It’s read on this device and never uploaded.'
    : saving
      ? 'PDF, Word (.docx) or plain text. Google’s Gemini reads it to find your skills, and we save it to your account so you don’t have to upload it again. You can delete it any time from Saved.'
      : 'PDF, Word (.docx) or plain text. Google’s Gemini reads it to find your skills. We don’t keep it.'

  const townField = (
    <Autocomplete
      options={TOWNS}
      value={town}
      onChange={(_, v) => setTown(v)}
      getOptionLabel={(t) => t.name}
      isOptionEqualToValue={(a, b) => a.name === b.name}
      sx={{ flex: '1 1 160px', minWidth: 0, maxWidth: { sm: 240 } }}
      renderInput={(params) => (
        <TextField
          {...params}
          slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps.inputLabel, shrink: true } }}
          variant="standard"
          label="Your town or city"
          placeholder="your town"
          error={tried && !town}
          sx={blankSx}
        />
      )}
    />
  )

  const missing = tried && (!occupation || !town)

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      {mode === 'pick' ? (
        <Box sx={sentenceSx}>
          <Box sx={halfSx}>
          <span>I work as</span>
          <Autocomplete
            options={OCCUPATIONS}
            value={occupation ? (findOccupation(occupation.code) ?? null) : null}
            onChange={(_, v) => setOccupation(v)}
            getOptionLabel={(o) => o.title}
            filterOptions={(opts, { inputValue }) => opts.filter((o) => matchesOccupation(o, inputValue))}
            isOptionEqualToValue={(a, b) => a.code === b.code}
            sx={{ flex: '1 1 220px', minWidth: 0 }}
            renderInput={(params) => (
              <TextField
                {...params}
                slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps.inputLabel, shrink: true } }}
                variant="standard"
                label="Your current job"
                placeholder="your job"
                error={tried && !occupation}
                sx={blankSx}
              />
            )}
          />
          </Box>
          <Box sx={halfSx}>
            <span>in</span>
            {townField}
          </Box>
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {savedResume && !skills && !parsing && (
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '6px', px: 2, py: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>Use your saved résumé</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.25 }}>
                {savedResume.fileName}, saved{' '}
                {new Date(savedResume.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.
                Uploading a new one replaces it.
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setFileName(savedResume.fileName)
                  setError(null)
                  setJustSaved(false)
                  applyResult(savedResume)
                }}
              >
                Use saved résumé
              </Button>
            </Box>
          )}
          <Box>
            <Button component="label" variant="outlined" disabled={parsing}>
              {fileName || savedResume ? 'Upload a different résumé' : 'Choose your résumé'}
              <input hidden type="file" accept=".pdf,.docx,.txt,application/pdf" onChange={onFile} />
            </Button>
            {fileName && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {fileName}
              </Typography>
            )}
            {user ? (
              <FormControlLabel
                sx={{ display: 'flex', mt: 1, mr: 0 }}
                control={
                  <Checkbox size="small" checked={saveToAccount} disabled={parsing} onChange={(e) => setSaveToAccount(e.target.checked)} />
                }
                label={<Typography variant="body2">Save it to my account so I don’t have to upload it again</Typography>}
              />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <Link component={RouterLink} to="/sign-in" state={{ from: '/' }} color="text.primary">
                  Sign in
                </Link>{' '}
                to keep your résumé for next time.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {uploadNote}
            </Typography>
          </Box>
          {parsing && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Reading your résumé</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {justSaved && (
            <Alert severity="success">
              Saved to your account. You can see or delete it on the{' '}
              <Link component={RouterLink} to="/saved" color="inherit">
                Saved page
              </Link>
              .
            </Alert>
          )}
          {skills && skills.suggestedOccupations.length === 0 && (
            <Alert severity="info">
              We read your résumé but couldn’t match it to a job.{' '}
              <Link component="button" type="button" onClick={() => setMode('pick')} sx={{ font: 'inherit', verticalAlign: 'baseline' }}>
                Pick your job instead
              </Link>
              .
            </Alert>
          )}
          {skills && skills.suggestedOccupations.length > 0 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Skills we found
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {skills.skills.map((sk) => (
                    <Chip key={sk.name} label={sk.name} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
              <Box role="radiogroup" aria-label="Closest jobs to your résumé">
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Closest jobs. Pick the one that fits you best:
                </Typography>
                <Stack spacing={1}>
                  {skills.suggestedOccupations.map((o) => {
                    const selected = occupation?.code === o.code
                    return (
                      <Box
                        key={o.code}
                        component="button"
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setOccupation(findOccupation(o.code) ?? null)}
                        sx={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'block',
                          px: 2,
                          py: 1.25,
                          border: 1,
                          borderRadius: '6px',
                          borderColor: selected ? 'primary.main' : 'divider',
                          bgcolor: selected ? 'action.selected' : 'transparent',
                          boxShadow: selected ? 'inset 0 0 0 1px var(--mui-palette-primary-main)' : 'none',
                          '&:hover': { borderColor: 'text.secondary' },
                          '&:focus-visible': { outline: '2px solid var(--mui-palette-primary-main)', outlineOffset: 2 },
                        }}
                      >
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9875rem' }}>{o.title}</Typography>
                        {o.because && o.because.length > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            Matched on {o.because.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            </Stack>
          )}
          <Box sx={sentenceSx}>
            <Box sx={halfSx}>
              <span>I live in</span>
              {townField}
            </Box>
          </Box>
        </Stack>
      )}

      <Typography variant="body2" color={missing ? 'error' : 'text.secondary'} sx={{ mt: 1.5, minHeight: '1.55em' }}>
        {missing
          ? !occupation
            ? mode === 'pick'
              ? 'Choose your job to continue.'
              : 'Upload your résumé and pick the closest job to continue.'
            : 'Choose your town to continue.'
          : region
            ? `Results cover the ${region.name} region.`
            : ''}
      </Typography>

      <Stack direction="row" sx={{ mt: 2, flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
        <Button type="submit" variant="contained" size="large">
          Show my outlook
        </Button>
        <Button
          type="button"
          onClick={() => {
            setMode(mode === 'pick' ? 'resume' : 'pick')
            setTried(false)
          }}
        >
          {mode === 'pick' ? 'Use my résumé instead' : 'Pick my job instead'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Or see an example:{' '}
        {EXAMPLES.map((ex, i) => (
          <span key={ex.label}>
            <Link
              component="button"
              type="button"
              onClick={() => go(ex.occupation, findTown(ex.town)!)}
              sx={{ font: 'inherit', verticalAlign: 'baseline', color: 'text.primary' }}
            >
              {ex.label}
            </Link>
            {i < EXAMPLES.length - 2 ? ', ' : i === EXAMPLES.length - 2 ? ' or ' : '.'}
          </span>
        ))}
      </Typography>
    </Box>
  )
}
