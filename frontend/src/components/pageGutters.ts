// Side margins shared by the header, every page and the footer, so text lines up
// down the whole page. Use with <Container maxWidth={false} disableGutters sx={{ px: PAGE_GUTTERS }}>.
export const PAGE_GUTTERS = {
  xs: 2,
  sm: 3,
  md: 'clamp(32px, 4vw, 96px)',
}
