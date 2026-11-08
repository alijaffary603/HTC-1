import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { CAN_DOWNLOAD_RESUME, deleteSavedResume, getSavedResume, getSavedResumeFileUrl } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useAsync } from '../hooks/useAsync'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** The résumé saved to the signed-in person's account, with download and delete. */
export default function SavedResumeSection() {
  const { user } = useAuth()
  const state = useAsync(getSavedResume, `saved-resume|${user?.id ?? ''}`)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  const download = async () => {
    setError(null)
    try {
      window.location.assign(await getSavedResumeFileUrl())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The download didn’t start. Try again.')
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteSavedResume()
      setConfirming(false)
      setDeleted(true)
      state.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your résumé wasn’t deleted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const resume = state.status === 'success' ? state.data : null

  // the account menu links to /saved#resume
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#resume' && state.status !== 'loading') {
      document.getElementById('resume')?.scrollIntoView({ block: 'start' })
    }
  }, [hash, state.status])

  return (
    <Box id="resume" component="section" aria-labelledby="resume-heading" sx={{ mt: { xs: 7, md: 9 }, scrollMarginTop: 88 }}>
      <Typography id="resume-heading" variant="h2" sx={{ fontSize: '1.75rem' }}>
        Your résumé
      </Typography>

      <Box sx={{ mt: 2 }}>
        {state.status === 'loading' && <Skeleton variant="rounded" height={96} />}
        {state.status === 'error' && <Alert severity="error">Your saved résumé didn’t load: {state.error.message}</Alert>}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {state.status === 'success' && !resume && (
          <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 3 }}>
            <Typography>{deleted ? 'Your résumé was deleted.' : 'No résumé saved.'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: '58ch' }}>
              Upload one from the home page with “Save it to my account” ticked, and you won’t have to upload it
              again.
            </Typography>
            <Button component={RouterLink} to="/" variant="outlined">
              Upload a résumé
            </Button>
          </Box>
        )}

        {resume && (
          <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 3 }}>
            <Typography variant="h3" sx={{ wordBreak: 'break-word' }}>
              {resume.fileName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Saved {fmtDate(resume.uploadedAt)}, {fmtSize(resume.size)}.
            </Typography>

            {resume.skills.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Skills we found
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {resume.skills.map((s) => (
                    <Chip key={s.name} label={s.name} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}
            {resume.suggestedOccupations.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Closest jobs
                </Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {resume.suggestedOccupations.map((o) => (
                    <li key={o.code}>
                      <Typography variant="body2">{o.title}</Typography>
                    </li>
                  ))}
                </Box>
              </Box>
            )}

            {confirming ? (
              <Box sx={{ mt: 2.5 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Delete your saved résumé? This removes {CAN_DOWNLOAD_RESUME ? 'the file and ' : ''}the skills we found.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" color="error" onClick={remove} disabled={busy}>
                    {busy ? 'Deleting' : 'Delete résumé'}
                  </Button>
                  <Button onClick={() => setConfirming(false)} disabled={busy}>
                    Keep it
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Stack direction="row" spacing={1} sx={{ mt: 2.5, ml: -1.25 }}>
                {CAN_DOWNLOAD_RESUME && <Button onClick={download}>Download</Button>}
                <Button color="inherit" sx={{ color: 'text.secondary' }} onClick={() => setConfirming(true)}>
                  Delete
                </Button>
              </Stack>
            )}
            {!CAN_DOWNLOAD_RESUME && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                In this preview, only the file name and what we found in it are kept, in this browser. On the live site
                the file itself is stored securely on your account.
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
