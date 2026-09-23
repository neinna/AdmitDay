import { TrendPoint } from '@/lib/school-detail-utils'

interface Props {
  points: TrendPoint[]
}

const WIDTH = 88
const HEIGHT = 26
const PAD = 4

// Plain inline SVG, no chart library and no axes (issue #292) -- the values
// themselves are labelled in the sentence next to this. Renders nothing for
// a single-year history: a line needs at least two points.
export default function TrendSparkline({ points }: Props) {
  if (points.length < 2) return null

  const values = points.map((p) => p.pctl)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = (WIDTH - PAD * 2) / (points.length - 1)

  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: HEIGHT - PAD - ((p.pctl - min) / range) * (HEIGHT - PAD * 2),
  }))
  const first = coords[0]
  const last = coords[coords.length - 1]

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-hidden="true">
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <circle cx={first.x} cy={first.y} r={2} fill="currentColor" />
      <circle cx={last.x} cy={last.y} r={2} fill="currentColor" />
    </svg>
  )
}
