import { Box, Stack, Typography } from '@mui/material'
import type { Range } from '../types'

interface Props {
  range: Range
  color?: 'primary' | 'secondary' | 'info'
  /** Show 0 / 50 / 100 under the track */
  scale?: boolean
  height?: number
}

/** 0-100 track: shaded band from the low to the high scenario, a mark at the base case. */
export default function RangeBar({ range, color = 'primary', scale, height = 8 }: Props) {
  const { low, base, high } = range
  return (
    <Box>
      <Box
        role="img"
        aria-label={`Low ${low}, base ${base}, high ${high}, on a scale of 0 to 100`}
        sx={{ position: 'relative', height, borderRadius: height / 2, bgcolor: 'action.hover' }}
      >
        <Box
          sx={{
            display: high > low ? 'block' : 'none',
            position: 'absolute',
            left: `${low}%`,
            width: `${high - low}%`,
            top: 0,
            bottom: 0,
            borderRadius: height / 2,
            bgcolor: `${color}.main`,
            opacity: 0.32,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: `calc(${base}% - 1.5px)`,
            top: -4,
            bottom: -4,
            width: 3,
            borderRadius: 2,
            bgcolor: `${color}.main`,
          }}
        />
      </Box>
      {scale && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }} aria-hidden>
          {[0, 50, 100].map((n) => (
            <Typography key={n} variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {n}
            </Typography>
          ))}
        </Stack>
      )}
    </Box>
  )
}
