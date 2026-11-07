import { useRef, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'

interface Props {
  from: string
  to: string
  subject: string
  preheader: string
  date: Date
  html: string
  text: string
}

/** Shows an email the way an inbox would: header lines, then the rendered HTML body. */
export default function EmailPreview({ from, to, subject, preheader, date, html, text }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(480)
  const [plain, setPlain] = useState(false)

  // Open links in a new tab rather than inside the preview frame.
  const doc = html.replace('<head>', '<head><base target="_blank" />')

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h3" component="p" sx={{ fontSize: '1.25rem' }}>
          {subject}
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ mt: 1.5, justifyContent: 'space-between', columnGap: 2, rowGap: 0.25 }}
        >
          <Box>
            <Typography variant="body2">
              <Box component="span" sx={{ fontWeight: 600 }}>
                {from}
              </Box>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To {to}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Inbox preview line: {preheader}
        </Typography>
      </Box>

      {plain ? (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: { xs: 2, sm: 3 },
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            maxHeight: 640,
            overflow: 'auto',
          }}
        >
          {text}
        </Box>
      ) : (
        <Box
          component="iframe"
          ref={frame}
          title={`Email preview: ${subject}`}
          srcDoc={doc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => {
            const h = frame.current?.contentDocument?.documentElement.scrollHeight
            if (h) setHeight(h)
          }}
          sx={{ display: 'block', width: '100%', height, border: 0, bgcolor: '#F1F3EE' }}
        />
      )}

      <Box sx={{ px: { xs: 1, sm: 2 }, py: 1, borderTop: 1, borderColor: 'divider' }}>
        <Button size="small" onClick={() => setPlain((p) => !p)}>
          {plain ? 'Show formatted email' : 'Show plain-text version'}
        </Button>
      </Box>
    </Box>
  )
}
