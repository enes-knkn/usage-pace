import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
// Half the week gone: the ideal line stands at 50 %.
const RESETS_AT = NOW + 3.5 * DAY

const BAND = {
  plugin: 'usage-pace',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

type On = Parameters<TestBody>[1]
type Engine = Parameters<TestBody>[0]

function readingOf(weekUsed: number) {
  return { weekUsed, weekResetsAt: RESETS_AT, measuredAt: NOW }
}

// `weekUsed` is what session.start put in the state, `stored` what an earlier
// session kept in the store.
function seed(on: On, weekUsed: number | null, stored: number | null = null) {
  on('store.get', (_, e) => ({
    value: e.key === 'last-reading' && stored !== null ? readingOf(stored) : undefined,
  }))
  on('state.get', (_, e) => {
    if (e.key === 'now') {
      return { value: { value: NOW, version: 1 } }
    }
    const reading =
      weekUsed === null ? undefined : { shape: 'reading-1', value: readingOf(weekUsed) }

    return { value: { value: reading, version: 1 } }
  })
}

// The band's two rows, as their texts.
async function rowsOf($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ ...BAND, surface })
  const rows: string[] = []
  for (const pattern of [/SEMAINE/, /marge|avance|rythme|limite atteinte/]) {
    rows.push((await ui.find({ type: 'Text', text: pattern }))?.text ?? '')
  }
  await ui.unmount()

  return rows
}

test('ahead of the ideal line says to slow down', async ($, on) => {
  seed(on, 58)
  for (const surface of SURFACES) {
    const [, verdict] = await rowsOf($, surface)
    expect(verdict).toContain("▲ 8 % d'avance · ralentis un peu")
  }
})

test('behind the ideal line says there is room to use more', async ($, on) => {
  seed(on, 30)
  for (const surface of SURFACES) {
    const [, verdict] = await rowsOf($, surface)
    expect(verdict).toContain('▼ 20 % de marge · tu peux en utiliser plus')
  }
})

test('close to the ideal line says on pace', async ($, on) => {
  seed(on, 51)
  for (const surface of SURFACES) {
    const [, verdict] = await rowsOf($, surface)
    expect(verdict).toContain('● pile dans le rythme')
  }
})

test('the first row holds the bar and the figure, the second the verdict and the reset', async ($, on) => {
  seed(on, 30)
  for (const surface of SURFACES) {
    const [top, bottom] = await rowsOf($, surface)
    expect(top).toContain('━')
    expect(top).toContain('┃')
    expect(top).toContain('30 % utilisé')
    expect(bottom).toContain('reset dans 3 j 12 h')
  }
})

test('a narrow band drops the reset before the verdict', async ($, on) => {
  seed(on, 30)
  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, bodyColumns: 50 },
    surface: 'terminal',
  })
  const bottom = (await ui.find({ type: 'Text', text: /de marge/ }))?.text ?? ''
  expect(bottom).toContain('tu peux en utiliser plus')
  expect(bottom.includes('reset')).toBe(false)
  await ui.unmount()
})

// The desktop app stopped drawing the whole band once it held an Svg: the
// bar is text there, as on the terminal.
test('the desktop bar is drawn as text, with no Svg', async ($, on) => {
  seed(on, 30)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /━/ }))?.text).toContain('┃')
  await ui.unmount()
})

test('before session.start fills the state, the stored reading draws at once', async ($, on) => {
  seed(on, null, 58)
  for (const surface of SURFACES) {
    const [top] = await rowsOf($, surface)
    expect(top).toContain('58 %')
  }
})

test('with no reading anywhere the band waits', async ($, on) => {
  seed(on, null)
  for (const surface of SURFACES) {
    const [top] = await rowsOf($, surface)
    expect(top).toContain('en attente de la première mesure')
  }
})
