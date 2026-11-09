import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Reading } from '../types'

const STORE_KEY = 'last-reading'
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
// Points either side of the ideal line that still count as on pace.
const TOLERANCE = 3
// Points ahead of the ideal line where "slow down" turns red.
const HOT = 12

// Change the tag when Reading's fields change: an older value is then declined.
const reading = atom({ plugin: 'usage-pace', key: 'reading' } as const, null, {
  shape: 'reading-1',
})
const now = atom({ plugin: 'usage-pace', key: 'now' } as const, 0)

type Mood = 'under' | 'on' | 'ahead' | 'hot' | 'full'

type Pace = {
  used: number
  expected: number
  delta: number
  mood: Mood
  resetsIn: number
}

type Run = { text: string; color?: string; dim?: boolean; bold?: boolean }

const MOODS: Record<Mood, { color: string }> = {
  under: { color: 'suggestion' },
  on: { color: 'success' },
  ahead: { color: 'warning' },
  hot: { color: 'error' },
  full: { color: 'error' },
}

function clamp(n: number, low: number, high: number) {
  return Math.min(high, Math.max(low, n))
}

function toReading(limits: SessionRateLimit[], at: number): Reading | null {
  const week =
    limits.find(limit => limit.kind === 'seven_day') ??
    limits.find(limit => limit.kind.startsWith('seven_day'))
  const resetsAt = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  if (!week || Number.isNaN(resetsAt)) {
    return null
  }
  const fiveHour = limits.find(limit => limit.kind === 'five_hour')

  return {
    weekUsed: week.percentUsed,
    weekResetsAt: resetsAt,
    ...(fiveHour ? { fiveHourUsed: fiveHour.percentUsed } : {}),
    measuredAt: at,
  }
}

function asReading(value: unknown): Reading | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const { weekUsed, weekResetsAt, measuredAt } = value as Partial<Reading>
  const isReading =
    typeof weekUsed === 'number' &&
    typeof weekResetsAt === 'number' &&
    typeof measuredAt === 'number'

  return isReading ? (value as Reading) : null
}

function newer(a: Reading | null, b: Reading | null) {
  if (!a || !b) {
    return a ?? b
  }

  return b.measuredAt > a.measuredAt ? b : a
}

function paceOf(last: Reading, t: number): Pace | null {
  const resetsIn = last.weekResetsAt - t
  if (resetsIn <= 0) {
    return null
  }
  const elapsed = clamp(WEEK - resetsIn, 0, WEEK)
  const used = last.weekUsed
  const expected = (elapsed / WEEK) * 100
  const delta = used - expected
  const mood: Mood =
    used >= 100
      ? 'full'
      : delta > HOT
        ? 'hot'
        : delta > TOLERANCE
          ? 'ahead'
          : delta < -TOLERANCE
            ? 'under'
            : 'on'

  return { used, expected, delta, mood, resetsIn }
}

function pct(n: number) {
  const rounded = n < 10 ? Math.round(n * 10) / 10 : Math.round(n)

  return `${String(rounded).replace('.', ',')} %`
}

function duration(ms: number) {
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  if (days > 0) {
    return hours > 0 ? `${days} j ${hours} h` : `${days} j`
  }
  if (hours > 0) {
    return `${hours} h`
  }

  return `${Math.max(1, Math.round(ms / MINUTE))} min`
}

function verdict(pace: Pace) {
  const gap = `${Math.round(Math.abs(pace.delta))} %`
  switch (pace.mood) {
    case 'full':
      return '■ limite atteinte'
    case 'hot':
      return `▲ ${gap} d'avance · ralentis`
    case 'ahead':
      return `▲ ${gap} d'avance · ralentis un peu`
    case 'under':
      return `▼ ${gap} de marge · tu peux en utiliser plus`
    case 'on':
      return '● pile dans le rythme'
  }
}

function widthOf(runs: Run[]) {
  return runs.reduce((n, run) => n + [...run.text].length, 0)
}

// The bar, as text: filled cells thick in the mood's color, the rest thin,
// the ideal line as ┃.
function barRuns(pace: Pace, cells: number): Run[] {
  const filled = Math.round((Math.min(pace.used, 100) / 100) * cells)
  const marker = Math.min(cells - 1, Math.floor((pace.expected / 100) * cells))
  const runs: (Run & { kind: string })[] = []
  for (let i = 0; i < cells; i++) {
    const kind = i === marker ? 'marker' : i < filled ? 'fill' : 'track'
    const char = kind === 'marker' ? '┃' : kind === 'fill' ? '━' : '─'
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) {
      last.text += char
    } else {
      const color =
        kind === 'marker' ? 'text' : kind === 'fill' ? MOODS[pace.mood].color : 'subtle'
      runs.push({ kind, text: char, color, bold: kind === 'marker' })
    }
  }

  return runs
}

// The band's rows: the bar with its figures, then the verdict with the
// details that fit beside it.
function rowsOf(last: Reading | null, t: number, columns: number): Run[][] {
  const label: Run = { text: 'SEMAINE', dim: true, bold: true }
  if (!last) {
    return [[label, { text: '  en attente de la première mesure…', dim: true }]]
  }
  const pace = paceOf(last, t)
  if (!pace) {
    const since = duration(t - last.weekResetsAt)
    return [[label, { text: `  nouvelle semaine depuis ${since} · en attente de mesure`, dim: true }]]
  }
  const { color } = MOODS[pace.mood]

  const figures: Run[] = [
    { text: '  ' },
    { text: pct(pace.used), bold: true },
    { text: ' utilisé', dim: true },
  ]
  const cells = clamp(columns - widthOf([label, ...figures]) - 2, 10, 32)
  const top: Run[] = [label, { text: '  ' }, ...barRuns(pace, cells), ...figures]

  const head: Run = { text: verdict(pace), color }
  const reset: Run = { text: `    reset dans ${duration(pace.resetsIn)}`, dim: true }
  const bottom = widthOf([head, reset]) <= columns ? [head, reset] : [head]

  return [top, bottom]
}

function style(run: Run) {
  return {
    ...(run.color ? { color: run.color } : {}),
    ...(run.dim ? { dimColor: true } : {}),
    ...(run.bold ? { weight: 'semibold' as const } : {}),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const startAt = await $.clock.now()
    const live = toReading((await $.session.usage()).rateLimits, startAt)
    const kept = asReading(await $.store.get(STORE_KEY))
    await update($, reading, previous => newer(previous, newer(kept, live)))
    await update($, now, () => startAt)

    // The ideal line moves with time, and another session may have measured.
    $.clock.every(5 * MINUTE, () => {
      void (async () => {
        const t = await $.clock.now()
        const stored = asReading(await $.store.get(STORE_KEY))
        await update($, reading, previous => newer(previous, stored))
        await update($, now, () => t)
      })()
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const at = await $.clock.now()
      const live = toReading(e.rateLimits, at)
      if (live) {
        await update($, reading, () => live)
        await update($, now, () => at)
        await $.store.set(STORE_KEY, live)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }
    // Before session.start has filled the state, the last stored reading
    // still draws the band at once.
    const stored = () => $.store.get(STORE_KEY).catch(() => null)
    const last = (await read($, reading)) ?? asReading(await stored())
    const t = (await read($, now)) || Date.now()

    const { Box, Text } = $.ui.resolve(e)
    const size = e.surface === 'desktop' ? ({ size: 'footnote', tabular: true } as const) : {}

    return (
      <Box flexDirection="column">
        {rowsOf(last, t, e.props.bodyColumns).map(runs => (
          <Text {...size}>
            {runs.map(run => (
              <Text {...style(run)}>{run.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
