import { createTheme, Select, type MantineColorsTuple } from '@mantine/core'

/**
 * Hearth — Mantine theme (brand v1)
 * Source of truth for colour + type. See brand/hearth-brand.md for the full
 * rationale and non-Mantine tokens (surfaces, semantic colours, logo rules).
 *
 * Fonts are loaded via <link> in index.html:
 *   Spectral (headings + money figures), Hanken Grotesk (UI), Space Mono (labels/mono)
 */

// Primary — Moss. Brand green sits at index 6 (Mantine's default shade).
const moss: MantineColorsTuple = [
  '#eff3ec', '#d9e3d0', '#c0d0b2', '#a3bc90', '#86a971',
  '#6a9157', '#47613f', '#3f5638', '#33472d', '#253620',
]

// Accent — Apricot. Use for attention / over-budget / warnings ONLY, never as
// a second primary. Brand apricot ≈ index 5.
const apricot: MantineColorsTuple = [
  '#fcefe7', '#f8dece', '#f1c6aa', '#e9ad86', '#e29a6c',
  '#dd8c5c', '#c9744a', '#ae5e39', '#8c4a2d', '#6b3822',
]

// Warm neutrals — replaces Mantine's cool gray. Surfaces, borders, muted text.
const sand: MantineColorsTuple = [
  '#fbfaf4', '#f4f2ea', '#ebe7db', '#e1dbcd', '#d2c9b4',
  '#b9ae95', '#a9a491', '#8a8570', '#6b6656', '#4a4638',
]

// Warm dark ramp — overrides Mantine's blue-grey 'dark' so dark mode reads bark,
// not slate. dark[7] = body background, dark[6] = elevated surface.
const bark: MantineColorsTuple = [
  '#c7cbc0', '#a7ac9f', '#82887a', '#5c6356', '#434a3e',
  '#363c31', '#2c3227', '#22261f', '#1b1f18', '#141711',
]

export const theme = createTheme({
  primaryColor: 'moss',
  primaryShade: { light: 6, dark: 5 },

  colors: { moss, apricot, sand, dark: bark },

  white: '#fbfaf4', // paper
  black: '#22261f', // ink

  fontFamily:
    '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: '"Space Mono", ui-monospace, "SF Mono", monospace',
  headings: {
    fontFamily: '"Spectral", Georgia, "Times New Roman", serif',
    fontWeight: '500',
  },

  defaultRadius: 'md',
  radius: { xs: '6px', sm: '9px', md: '12px', lg: '16px', xl: '20px' },

  components: {
    // Every Select is searchable by default, so long lists (pots, currencies,
    // owners) can be typed into instead of scrolled. Override per-instance if not wanted.
    Select: Select.extend({ defaultProps: { searchable: true } }),
  },
})

/**
 * Non-Mantine tokens for hand-rolled UI (charts, custom surfaces).
 * Kept here so there's one import for everything brand-related.
 */
export const hearthTokens = {
  surface: {
    canvas: '#f4f2ea',
    card: '#fbfaf4',
    tint: '#eaf0e4', // moss-tinted panel (e.g. auto-matched pot)
    warmTint: '#fbf0e7', // apricot-tinted panel (e.g. catch-up banner)
    border: '#e7e2d5',
  },
  text: {
    ink: '#22261f',
    body: '#33402c',
    muted: '#7c8676',
    faint: '#8e9482',
  },
  brand: {
    moss: '#47613f',
    mossDeep: '#2e3f28',
    apricot: '#d98c5f',
    ink: '#22261f',
    linen: '#efede3',
  },
  semantic: {
    positive: '#3e7c4f', // refunds, in-credit
    attention: '#d98c5f', // over budget, needs-a-pot, reconcile
    savings: '#8a7a6a', // drawdown / savings pots
  },
  // Owner accent colours (assign per household member)
  ownerPalette: ['#6e8a5f', '#c1745a', '#8a7a6a', '#5b7d86', '#a08a52'],
} as const

/**
 * Shared x-axis props for @mantine/charts. We shrink the tick font to fit more
 * date labels, but overriding `tick` REPLACES Mantine's default — which sets
 * `fill: 'currentColor'`. Without it recharts falls back to a hardcoded dark
 * grey that's unreadable in dark mode. Re-adding `fill: 'currentColor'` lets the
 * ticks inherit Mantine's chart text colour, which adapts to the colour scheme.
 */
export const chartXAxisProps = { tick: { fontSize: 10, fill: 'currentColor' } }
