import { createTheme } from '@mui/material/styles'

// Signal design tokens.
// Colour comes from the landing image (field green, sky blue, rock ochre) and
// carries meaning: green = growth / actions, ochre = risk, blue = data.
// Type: IBM Plex Sans Condensed for headings and figures (utility-document feel),
// IBM Plex Sans for reading.

export const DISPLAY = '"IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif'
const TEXT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif'

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2E6B3F', dark: '#22532F', contrastText: '#FFFFFF' },
        secondary: { main: '#A3612A', contrastText: '#FFFFFF' },
        info: { main: '#3B6C99' },
        background: { default: '#F6F7F3', paper: '#FFFFFF' },
        text: { primary: '#1B2A31', secondary: '#4F5E65' },
        divider: '#D9DFD6',
      },
    },
    dark: {
      palette: {
        primary: { main: '#86C995', dark: '#6FB57F', contrastText: '#10201A' },
        secondary: { main: '#E3A66C', contrastText: '#1E140B' },
        info: { main: '#93B9DE' },
        background: { default: '#121A1E', paper: '#182329' },
        text: { primary: '#E4EAE6', secondary: '#A5B2B0' },
        divider: '#2A3A3F',
      },
    },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: TEXT,
    fontSize: 15,
    h1: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      fontSize: 'clamp(2.4rem, 4.6vw, 3.75rem)',
      lineHeight: 1.02,
      letterSpacing: '-0.015em',
    },
    h2: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', lineHeight: 1.1 },
    h3: { fontFamily: DISPLAY, fontWeight: 600, fontSize: '1.375rem', lineHeight: 1.2 },
    h4: { fontFamily: TEXT, fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.35 },
    body1: { fontSize: '1.0625rem', lineHeight: 1.6 },
    body2: { fontSize: '0.9375rem', lineHeight: 1.55 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.45 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0, fontSize: '1rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontVariantNumeric: 'lining-nums' },
        'h1, h2, h3': { textWrap: 'balance' },
        p: { textWrap: 'pretty' },
        '::selection': { background: 'rgba(46, 107, 63, 0.22)' },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: '2px solid var(--mui-palette-primary-main)',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, paddingInline: 18, transition: 'background-color 150ms ease-out' },
        sizeLarge: { paddingBlock: 12, paddingInline: 24, fontSize: '1.0625rem' },
        text: { paddingInline: 10 },
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: 10 } } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontWeight: 500 },
        sizeSmall: { height: 24, fontSize: '0.8125rem' },
      },
    },
    MuiLink: {
      defaultProps: { underline: 'always' },
      styleOverrides: {
        root: { textUnderlineOffset: '0.2em', textDecorationThickness: '1px', fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'var(--mui-palette-divider)', fontVariantNumeric: 'tabular-nums' },
        head: { fontWeight: 600, color: 'var(--mui-palette-text-secondary)', fontSize: '0.875rem' },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 6 } } },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 6 } } },
  },
})
