# Hearth client (React) — conventions for Claude

Follow these when writing or editing React/TSX under `src/client`. The owner
reviews client code closely, so match them exactly.

## Formatting

- Hand-write edits in the surrounding file's style. **Don't run
  `prettier --write`** — most client files predate `.prettierrc.json` and it
  rewrites them wholesale, burying the real change.

## Imports

- `@/…` → `src/client/…`, `@shared/…` → `src/shared/…`. Never deep relative paths.

## Charts

Two libraries, and the choice is about size, not taste:

- **`@microcharts/react`** for anything word-sized — a bar in a table cell, a
  sparkline beside a figure, a signed change next to a number. Zero-dependency
  static SVG, no axes, no tooltips. Import per chart
  (`@microcharts/react/sparkline`), never the barrel, and add its stylesheet to
  `main.tsx` if the chart has one.
- Full charts (axes, legend, tooltips) use shadcn's `components/shadcn/chart`
  (recharts, themed from the design tokens) behind a `React.lazy` boundary — see
  `features/home/components/IncomeTrendChart.tsx`.

Don't hand-roll a bar or sparkline out of `<Box>` and percentage widths;
microcharts covers those and describes itself to assistive tech.

Colours come from `microcharts.css`, which maps the `--mc-*` tokens onto the
Hearth palette. It's deliberately unlayered so it beats microcharts' own
`@layer` defaults — including its `prefers-color-scheme` block, which would
otherwise ignore a scheme the user forced in Appearance settings.

## Routing

Routes are file-based (TanStack Router). `src/client/routes/` is the source of
truth; the vite plugin generates `src/client/routeTree.gen.ts` from it on every
build, dev start and test run.

- To add a page: write the component in `src/client/pages/`, then add a route
  file whose name is the URL — `routes/upcoming.tsx` → `/upcoming`. Nesting uses
  dots: `routes/settings.system.tsx` → `/settings/system`. `index.tsx` is the
  exact-match child (`routes/settings.index.tsx` → `/settings` itself).
- Keep route files thin — a `createFileRoute(...)({ component })` declaration
  wiring a page in, not page logic. `__root.tsx` is the app shell.
- Never hand-edit `routeTree.gen.ts`; it's regenerated and is excluded from
  prettier (`.prettierignore`) and lint.
- The plugin's `autoCodeSplitting` puts each route's component in its own chunk,
  so pages load on demand (#141). A heavy dependency used by only part of a page
  (recharts, say) still deserves its own `React.lazy` boundary inside the page —
  see `pages/HomePage.tsx`.
