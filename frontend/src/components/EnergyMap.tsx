import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, FormControl, InputLabel, Link, MenuItem, Select, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { OCCUPATIONS, REGIONS, TECH_LABEL } from '../data/reference'
import { useAsync } from '../hooks/useAsync'

type Project = { id: string; name: string; region: string; technology: string; planningArea: number; mw: number; date: string; state: string }
type MapData = { snapshot: string; projects: Project[]; estimates: Record<string, Record<string, Record<string, number>>> }
// Representative regional anchors, not project sites or geographic centroids.
const anchors = [[51.045, -114.057], [53.546, -113.494], [49.695, -112.845], [51.465, -112.71], [52.269, -113.811], [55.17, -118.8], [56.727, -111.38]]
type Marker = { map: unknown; addListener: (event: string, callback: () => void) => { remove: () => void } }
type Maps = { Map: new (node: HTMLElement, options: object) => { panTo: (position: object) => void }; marker: { AdvancedMarkerElement: new (options: object) => Marker } }
let mapsPromise: Promise<Maps> | undefined
function loadMaps(key: string): Promise<Maps> {
  if (!mapsPromise) mapsPromise = new Promise<Maps>((resolve, reject) => {
    const host = window as unknown as { google: { maps: Maps & { importLibrary: (name: string) => Promise<unknown> } }; signalMapsReady?: () => void; gm_authFailure?: () => void }
    const script = document.createElement('script')
    const timer = window.setTimeout(() => reject(new Error('Google Maps timed out. Use the region buttons below.')), 20000)
    host.signalMapsReady = () => {
      Promise.all([host.google.maps.importLibrary('maps'), host.google.maps.importLibrary('marker')]).then(() => {
        clearTimeout(timer)
        resolve(host.google.maps)
      }, error => { clearTimeout(timer); reject(error) })
    }
    host.gm_authFailure = () => {
      clearTimeout(timer)
      window.dispatchEvent(new Event('signal-maps-auth-failure'))
      reject(new Error('Google Maps authorization failed. Use the region buttons below.'))
    }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, loading: 'async', libraries: 'marker', callback: 'signalMapsReady', v: 'weekly' })}`
    script.async = true
    script.onerror = () => { clearTimeout(timer); reject(new Error('Google Maps could not load. Use the region buttons below.')) }
    document.head.appendChild(script)
  })
  return mapsPromise
}

function GoogleMap({ onSelect }: { onSelect: (region: string) => void }) {
  const node = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  useEffect(() => {
    if (!key) return
    let active = true
    const onAuthFailure = () => setError('Google Maps authorization failed. Check that Maps JavaScript API is enabled and this website is allowed by the key.')
    window.addEventListener('signal-maps-auth-failure', onAuthFailure)
    const markers: Marker[] = []
    const listeners: { remove: () => void }[] = []
    loadMaps(key).then(maps => {
      if (!active || !node.current) return
      const map = new maps.Map(node.current, { center: { lat: 53.5, lng: -114.5 }, zoom: 5, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID', streetViewControl: false, mapTypeControl: false })
      REGIONS.forEach((r, i) => {
        const marker = new maps.marker.AdvancedMarkerElement({ map, position: { lat: anchors[i][0], lng: anchors[i][1] }, title: `${r.short}: explore regional energy projects` })
        markers.push(marker)
        listeners.push(marker.addListener('click', () => onSelect(r.id)))
      })
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; window.removeEventListener('signal-maps-auth-failure', onAuthFailure); listeners.forEach(l => l.remove()); markers.forEach(m => { m.map = null }) }
  }, [key, onSelect])
  if (!key) return <Alert severity="info">Map view is not configured yet. Explore the same project data using the region buttons below.</Alert>
  if (error) return <Alert severity="warning">{error}</Alert>
  return <Box ref={node} aria-label="Google map of Alberta energy activity by region" sx={{ height: { xs: 320, md: 440 }, borderRadius: 2, bgcolor: 'action.hover' }} />
}

export default function EnergyMap({ occupation, region }: { occupation: string; region: string }) {
  const state = useAsync(async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/energy-map.json`)
    if (!response.ok) throw new Error('Project data could not load.')
    return response.json() as Promise<MapData>
  }, 'energy-map')
  const [selected, setSelected] = useState(region)
  const [technology, setTechnology] = useState('all')
  const [projectKey, setProjectKey] = useState('')
  const projects = state.status === 'success' ? state.data.projects : []
  const filtered = projects.filter(p => p.region === selected && (technology === 'all' || p.technology === technology))
  const project = filtered.find(p => `${p.id}|${p.technology}|${p.date}` === projectKey)
  const techs = [...new Set(projects.filter(p => p.region === selected).map(p => p.technology))].sort()
  const estimates = state.status === 'success' ? state.data.estimates[selected] : undefined
  const roles = useMemo(() => OCCUPATIONS.map(o => ({ ...o, jobs: Object.entries(estimates ?? {}).reduce((n, [tech, counts]) => n + ((project ? tech === project.technology : technology === 'all' || tech === technology) ? counts[o.code] ?? 0 : 0), 0) })).sort((a, b) => b.jobs - a.jobs), [estimates, project, technology])
  const current = roles.find(o => o.code === occupation)
  return <Box component="section" aria-labelledby="energy-map-title" sx={{ mt: 7 }}>
    <Typography id="energy-map-title" variant="h2">Explore energy activity</Typography>
    <Typography color="text.secondary" sx={{ my: 2 }}>Choose a map point to explore developments and related work. Points represent regions, not exact project sites. Your location selects your starting region.</Typography>
    {state.status === 'loading' ? <Typography role="status">Loading energy projects…</Typography> : state.status === 'error' ? <Alert severity="error" action={<Button onClick={state.reload}>Retry</Button>}>{state.error.message}</Alert> : <>
      <GoogleMap onSelect={setSelected} />
      <Stack direction="row" sx={{ my: 2, gap: 1, flexWrap: 'wrap' }} aria-label="Energy activity regions">
        {REGIONS.map(r => <Button key={r.id} variant={r.id === selected ? 'contained' : 'outlined'} aria-pressed={r.id === selected} onClick={() => setSelected(r.id)}>{r.short}</Button>)}
      </Stack>
      <FormControl fullWidth sx={{ my: 2 }}><InputLabel id="energy-tech-label">Development type</InputLabel><Select labelId="energy-tech-label" label="Development type" value={technology} onChange={e => { setTechnology(e.target.value); setProjectKey('') }}><MenuItem value="all">All development types</MenuItem>{[...new Set([...techs, ...(technology !== 'all' ? [technology] : [])])].map(t => <MenuItem key={t} value={t}>{TECH_LABEL[t] ?? t}</MenuItem>)}</Select></FormControl>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Box><Typography variant="h3">{filtered.length} developments in {REGIONS.find(r => r.id === selected)?.short}</Typography><Box sx={{ maxHeight: 340, overflowY: 'auto', mt: 2 }}>
          {!filtered.length && <Typography>No developments match this filter.</Typography>}
          {filtered.map((p, i) => <Button key={`${p.id}|${p.technology}|${p.date}|${i}`} fullWidth aria-pressed={project === p} onClick={() => setProjectKey(`${p.id}|${p.technology}|${p.date}`)} sx={{ display: 'block', textAlign: 'left', borderBottom: 1, borderColor: 'divider', p: 1.5 }}><strong>{p.name}</strong><Typography variant="body2" color="text.secondary">{p.id} · {TECH_LABEL[p.technology] ?? p.technology} · {p.mw.toLocaleString()} MW</Typography></Button>)}
        </Box></Box>
        <Box aria-live="polite">
          {project && <><Typography variant="h3">{project.name}</Typography><Typography sx={{ my: 1 }}>Planning area {project.planningArea} · Stage: {project.state.replaceAll('_', ' ')} · Modelled in-service month: {project.date}</Typography><Button onClick={() => setProjectKey('')}>Show all filtered activity</Button></>}
          <Typography variant="h3" sx={{ mt: 2 }}>Related occupations</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>Ranked by estimated annual demand across {project ? (TECH_LABEL[project.technology] ?? project.technology) : 'the filtered technologies'} in this region, including supply-chain and wider economic effects. These are regional scenarios, not jobs attributed to this individual development or vacancies.</Typography>
          <Typography sx={{ my: 2 }}>Your occupation: <strong>{current?.title}</strong> — {current ? current.jobs.toFixed(1) : '0.0'} estimated jobs/year.</Typography>
          <Box component="ol" sx={{ pl: 2.5 }}>{roles.filter(r => r.jobs > 0).slice(0, 5).map(r => <li key={r.code}><Link component={RouterLink} to={`/results?${new URLSearchParams({ occupation: r.code, region: selected })}`}>{r.title}</Link> · {r.jobs.toFixed(1)}/year</li>)}</Box>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>Snapshot: {state.data.snapshot}. AESO connection project exports; Statistics Canada historical occupation-by-industry mix applied to modelled regional sector demand. Projects may be delayed or cancelled. Rankings are not probabilities of hiring.</Typography>
      <Link href="https://www.aeso.ca/grid/transmission-projects/connection-project-reporting/" target="_blank" rel="noopener">View AESO source</Link>
    </>}
  </Box>
}
