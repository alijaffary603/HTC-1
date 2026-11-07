import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { extractSkills } from '../api/client'
import { OCCUPATIONS, TOWNS, findOccupation, findRegion, findTown } from '../mocks/reference'
import type { Occupation, SkillsResult, Town } from '../types'
import { blankSx, sentenceSx } from './sentenceStyles'

const EXAMPLES = [
  { label: 'a teacher in Edmonton', occupation: '41221', town: 'Edmonton' },
  { label: 'a retail manager in Lethbridge', occupation: '60020', town: 'Lethbridge' },
  { label: 'an accountant in Calgary', occupation: '11100', town: 'Calgary' },
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
    setParsing(true)
    try {
      const result = await extractSkills(file)
      setSkills(result)
      // the résumé matcher can suggest jobs that aren't in the dropdown list; keep them anyway
      const top = result.suggestedOccupations[0]
      if (top) setOccupation(findOccupation(top.code) ?? { code: top.code, title: top.title })
    } catch (err) {
      setError(err instanceof Error ? `We couldn’t read that file: ${err.message}` : "We couldn’t read that file.")
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

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
            value={occupation ? (findOccupation(occupation.code) ?? occupation) : null}
            onChange={(_, v) => setOccupation(v)}
            getOptionLabel={(o) => o.title}
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
          <Box>
            <Button component="label" variant="outlined" disabled={parsing}>
              {fileName ? 'Choose a different file' : 'Choose your resume'}
              <input hidden type="file" accept=".pdf,.doc,.docx,.txt" onChange={onFile} />
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {fileName ?? 'PDF, Word or plain text. We only read it to find your skills.'}
            </Typography>
          </Box>
          {parsing && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Reading your resume</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {skills && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                We found {skills.skills.map((s) => s.name.toLowerCase()).join(', ')}. Which job is closest to yours?
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {skills.suggestedOccupations.map((o) => {
                  const selected = occupation?.code === o.code
                  return (
                    <Chip
                      key={o.code}
                      label={o.title}
                      color={selected ? 'primary' : 'default'}
                      variant={selected ? 'filled' : 'outlined'}
                      onClick={() => setOccupation(findOccupation(o.code) ?? { code: o.code, title: o.title })}
                      aria-pressed={selected}
                    />
                  )
                })}
              </Stack>
            </Box>
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
              : 'Upload your resume and pick the closest job to continue.'
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
          {mode === 'pick' ? 'Use my resume instead' : 'Pick my job instead'}
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
