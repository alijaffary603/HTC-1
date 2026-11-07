// Shared styles for the fill-in-the-blank sentence forms.

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

// Inline "fill in the blank" field styling for the sentence form.
export const blankSx = {
  '& .MuiInputLabel-root': visuallyHidden,
  '& .MuiInputLabel-root + .MuiInputBase-root': { mt: 0 },
  '& .MuiInputBase-root': { fontSize: 'inherit', fontWeight: 600, color: 'primary.main', pb: 0.25 },
  '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 1, fontWeight: 500 },
  '& .MuiInput-underline:before': { borderBottomWidth: 2, borderBottomColor: 'divider' },
} as const

export const sentenceSx = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  columnGap: 1.25,
  rowGap: 1,
  fontSize: { xs: '1.25rem', sm: '1.5rem' },
  lineHeight: 1.4,
  fontWeight: 500,
} as const
