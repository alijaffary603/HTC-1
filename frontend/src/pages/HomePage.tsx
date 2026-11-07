import { useEffect, useRef } from 'react'
import { Box, Container, Typography } from '@mui/material'
import { keyframes } from '@emotion/react'
import OutlookForm from '../components/OutlookForm'
import { DISPLAY } from '../theme'
import hero1200 from '../assets/hero-1200.jpg'
import hero2400 from '../assets/hero-2400.jpg'

// The page’s one motion moment: the landscape settles in, the panel follows,
// and the image drifts slower than the page while scrolling.
const settle = keyframes`
  from { scale: 1.06; opacity: 0; }
  to   { scale: 1; opacity: 1; }
`
const rise = keyframes`
  from { translate: 0 20px; opacity: 0; }
  to   { translate: 0 0; opacity: 1; }
`

const STEPS = [
  {
    title: 'The project',
    body: 'A 220 MW solar farm near Lethbridge is under construction. Most projects at that stage get finished, so we count it as 90% likely. A project still in early study might count for a quarter of that.',
  },
  {
    title: 'Jobs to build and run it',
    body: 'Construction needs crews for a year or two. Running it needs a small permanent team. We apply published jobs-per-megawatt figures and keep both the low and high estimates.',
  },
  {
    title: 'Jobs it creates elsewhere',
    body: "Those workers rent homes, buy groceries and send their kids to school. Alberta’s economic multipliers spread that spending into housing, retail, health care and education.",
  },
  {
    title: 'Which occupations',
    body: 'Statistics Canada tables show which jobs each industry employs, so growth in an industry becomes demand for teachers, accountants, electricians and everyone else.',
  },
  {
    title: 'Compared with today',
    body: 'We compare that new demand with how many people already do your job in your region. More demand than people means a stronger tailwind for you.',
  },
]

const LIMITS = [
  {
    lead: "It’s a regional signal, not a job offer.",
    body: "Planned projects point to where work is likely to grow. They don’t guarantee a vacancy near you.",
  },
  {
    lead: 'Many projects never get built.',
    body: "More than 20,000 MW of data centres have asked to connect to Alberta’s grid, far more than it can take soon. We weight every project by how far along it is.",
  },
  {
    lead: 'Results are for your region, not your town.',
    body: "The data holds up at the level of Alberta’s economic regions, so every town shares its region’s outlook.",
  },
  {
    lead: 'Every number is a range.',
    body: "You’ll see a low, base and high estimate. A wide range means we’re less sure.",
  },
]

/** Writes scroll progress through the hero (0 to 1) into the --p CSS variable. */
function useHeroScroll() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      el.style.setProperty('--p', Math.min(Math.max(window.scrollY / el.offsetHeight, 0), 1).toFixed(4))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

const twoColumn = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '4fr 7fr' },
  columnGap: { md: 10 },
  rowGap: 4,
} as const

export default function HomePage() {
  const heroRef = useHeroScroll()

  return (
    <>
      <Box
        ref={heroRef}
        component="section"
        sx={{
          position: 'relative',
          minHeight: { xs: '100svh', md: '94svh' },
          display: 'flex',
          alignItems: 'flex-end',
          overflow: 'hidden',
          bgcolor: '#4f7fb4',
        }}
      >
        <Box
          aria-hidden
          sx={{ position: 'absolute', inset: 0, transform: 'translate3d(0, calc(var(--p, 0) * 18%), 0)', willChange: 'transform' }}
        >
          <Box
            component="img"
            src={hero2400}
            srcSet={`${hero1200} 1200w, ${hero2400} 2400w`}
            sizes="100vw"
            alt=""
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: { xs: '62% 40%', md: 'center 40%' },
              animation: `${settle} 1.4s cubic-bezier(.2,.7,.2,1) both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        </Box>
        {/* Keeps the white navigation readable against the sky */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 160,
            background: 'linear-gradient(180deg, rgba(14,36,56,0.5), rgba(14,36,56,0))',
          }}
        />

        <Container maxWidth="lg" sx={{ position: 'relative', pt: 12, pb: { xs: 2, sm: 6, md: 9 } }}>
          <Box
            sx={{
              maxWidth: 680,
              bgcolor: 'background.paper',
              borderRadius: '10px',
              p: { xs: 3, sm: 5 },
              boxShadow: '0 30px 60px -24px rgba(12, 34, 24, 0.5)',
              animation: `${rise} 700ms cubic-bezier(.2,.7,.2,1) 300ms both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            <Typography variant="h1">See the jobs coming before they’re posted</Typography>
            <Typography color="text.secondary" sx={{ mt: 2.5, maxWidth: '54ch' }}>
              Power projects are planned years before anyone hires for them. GridSkills reads Alberta’s grid connection
              list to estimate which regions will grow, and what that means for your work.
            </Typography>
            <Box sx={{ mt: 4 }}>
              <OutlookForm />
            </Box>
          </Box>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="method" sx={{ py: { xs: 8, md: 14 } }}>
        <Container maxWidth="lg" sx={twoColumn}>
          <Box sx={{ position: { md: 'sticky' }, top: { md: 104 }, alignSelf: 'start' }}>
            <Typography id="method" variant="h2">
              How a power project reaches your job
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, maxWidth: '40ch' }}>
              Here’s one project followed from the grid’s waiting list to the jobs it creates. Your results add up every
              project in your region the same way.
            </Typography>
          </Box>
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {STEPS.map((s, i) => (
              <Box
                component="li"
                key={s.title}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '2.25rem 1fr', sm: '3.5rem 1fr' },
                  py: { xs: 3, md: 3.5 },
                  borderTop: 1,
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 1, borderBottomColor: 'divider' },
                }}
              >
                <Typography
                  aria-hidden
                  sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: '1.75rem', lineHeight: 1.1, color: 'primary.main' }}
                >
                  {i + 1}
                </Typography>
                <Box>
                  <Typography variant="h3">{s.title}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, maxWidth: '62ch' }}>
                    {s.body}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Box
        component="section"
        aria-labelledby="limits"
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: 'color-mix(in srgb, var(--mui-palette-primary-main) 8%, var(--mui-palette-background-default))',
        }}
      >
        <Container maxWidth="lg" sx={twoColumn}>
          <Typography id="limits" variant="h2">
            What this can’t tell you
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 5, rowGap: 4 }}>
            {LIMITS.map((l) => (
              <Box key={l.lead} sx={{ borderTop: 2, borderColor: 'text.primary', pt: 2 }}>
                <Typography variant="h4">{l.lead}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {l.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>
    </>
  )
}
