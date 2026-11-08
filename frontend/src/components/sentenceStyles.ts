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
  // The searchable fields (job, town) line up with the words by their top edge, and MUI's
  // input puts its text 4px lower with a taller line. Match the words' line height and
  // move the padding below the text, so the baselines meet and the underline stays put.
  '& .MuiInputBase-root.MuiInput-root .MuiInputBase-input.MuiAutocomplete-input': {
    pt: 0,
    pb: 'calc(8px + 0.0375em)',
    lineHeight: 1.4,
    height: '1.4em',
  },
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
