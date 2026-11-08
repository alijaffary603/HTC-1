
import { useEffect, useState } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import { NavLink, Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { USING_MOCKS } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { theme } from '../theme'

// Responsive margins shared by the header, pages, and footer.
const PAGE_GUTTERS = {
  xs: 2,
  sm: 3,
  md: 'clamp(32px, 4vw, 96px)',
}

const NAV = [
  { to: '/plans', label: 'Plans' },
  { to: '/saved', label: 'Saved' },
  { to: '/network', label: 'People' },
]

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  if (!resolved) return null
  const next = resolved === 'dark' ? 'light' : 'dark'

  return (
    <Tooltip title={`Switch to ${next} mode`}>
      <IconButton
        color="inherit"
        onClick={() => setMode(next)}
        aria-label={`Switch to ${next} mode`}
      >
        {resolved === 'dark' ? (
          <LightModeIcon fontSize="small" />
        ) : (
          <DarkModeIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  if (!user) return null

  const close = () => setAnchor(null)

  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`Account menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        sx={{ ml: 0.5, p: 0.5 }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: '0.9375rem',
            fontWeight: 600,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          {user.name.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 220,
              border: 1,
              borderColor: 'divider',
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontWeight: 600 }}>
            {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>

        <Divider />

        <MenuItem
          component={RouterLink}
          to="/saved"
          onClick={close}
        >
          Saved pathways
        </MenuItem>

        <MenuItem
          component={RouterLink}
          to="/alerts"
          onClick={close}
        >
          Job alerts
        </MenuItem>

        <MenuItem
          component={RouterLink}
          to="/saved#resume"
          onClick={close}
        >
          Your résumé
        </MenuItem>

        <MenuItem
          onClick={async () => {
            close()
            await signOut()
            navigate('/')
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}

function useScrolledPast(threshold: number) {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return past
}

export default function Layout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const scrolled = useScrolledPast(24)
  const overHero = isHome && !scrolled
  const { user } = useAuth()
  const onAuthPage =
    pathname === '/sign-in' || pathname === '/sign-up'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* NAVIGATION BAR */}
      <AppBar
        position={isHome ? 'fixed' : 'sticky'}
        color="inherit"
        elevation={0}
        sx={{
          transition:
            'background-color 200ms ease-out, color 200ms ease-out, border-color 200ms ease-out',
          borderBottom: 1,
          borderColor: overHero ? 'transparent' : 'divider',
          bgcolor: overHero ? 'transparent' : 'background.default',
          color: overHero ? '#fff' : 'text.primary',
        }}
      >
        <Container
          maxWidth={false}
          disableGutters
          sx={{
            px: PAGE_GUTTERS,
            width: '100%',
          }}
        >
          <Toolbar
            disableGutters
            sx={{
              gap: { xs: 0, sm: 0.5 },
              width: '100%',
              minWidth: 0,
            }}
          >
            <Box
              component={NavLink}
              to="/"
              aria-label="Signal home"
              sx={{
                mr: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                py: 1,
                flexShrink: 0,
              }}
            >
              <Box
                component="img"
                src={`${import.meta.env.BASE_URL}Signal_Logo_Vector_Whole_Transparent.png`}
                alt="Signal"
                width={122}
                height={32}
                sx={{
                  width: 'clamp(64px, 21vw, 122px)',
                  height: 'auto',
                  display: 'block',
                  filter: overHero ? 'invert(1)' : 'none',
                  ...theme.applyStyles('dark', {
                    filter: 'invert(1)',
                  }),
                }}
              />
            </Box>

            {NAV.map((n) => (
              <Button
                key={n.to}
                component={NavLink}
                to={n.to}
                color="inherit"
                sx={{
                  fontWeight: 500,
                  px: { xs: 0.5, sm: 1.25 },
                  flexShrink: 0,
                  fontSize: {
                    xs: '0.75rem',
                    sm: '0.9375rem',
                  },
                  minWidth: 0,
                  borderRadius: 0,
                  borderBottom: '2px solid transparent',
                  '&.active': {
                    borderBottomColor: overHero
                      ? '#fff'
                      : 'primary.main',
                  },
                }}
              >
                {n.label}
              </Button>
            ))}

            <ThemeToggle />

            {user ? (
              <AccountMenu />
            ) : (
              !onAuthPage && (
                <Button
                  component={RouterLink}
                  to="/sign-in"
                  variant="outlined"
                  size="small"
                  color="inherit"
                  sx={{
                    ml: 0.5,
                    px: { xs: 1.25, sm: 1.75 },
                    fontSize: {
                      xs: '0.8125rem',
                      sm: '0.9375rem',
                    },
                    whiteSpace: 'nowrap',
                    borderColor: overHero
                      ? 'rgba(255,255,255,0.7)'
                      : 'divider',
                    '&:hover': {
                      borderColor: overHero
                        ? '#fff'
                        : 'text.primary',
                      bgcolor: 'transparent',
                    },
                  }}
                >
                  Sign in
                </Button>
              )
            )}
          </Toolbar>
        </Container>
      </AppBar>

      {/* MAIN PAGE CONTENT */}
      {isHome ? (
        <Box
          sx={{
            flexGrow: 1,
            width: '100%',
            minWidth: 0,
          }}
        >
          <Outlet />
        </Box>
      ) : (
        <Container
          maxWidth={false}
          disableGutters
          sx={{
            px: PAGE_GUTTERS,
            py: { xs: 4, md: 6 },
            flexGrow: 1,
            width: '100%',
            minWidth: 0,
          }}
        >
          <Outlet />
        </Container>
      )}

      {/* FOOTER */}
      <Box
        component="footer"
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          width: '100%',
        }}
      >
        <Container
          maxWidth={false}
          disableGutters
          sx={{
            px: PAGE_GUTTERS,
            py: 4,
            width: '100%',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 1, md: 4 }}
            sx={{
              justifyContent: 'space-between',
              alignItems: {
                xs: 'flex-start',
                md: 'center',
              },
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 560 }}
            >
              Signal was built at HTC-2026. Estimates come
              from the AESO connection project list and
              Statistics Canada tables.
              {USING_MOCKS &&
                ' Accounts, postings and the People page use sample data; regional scores use the model.'}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              <Link
                href="https://www.aeso.ca/grid/transmission-projects/connection-project-reporting/"
                target="_blank"
                rel="noopener"
                color="inherit"
              >
                AESO project list
              </Link>
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
