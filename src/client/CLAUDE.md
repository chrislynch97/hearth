# Hearth client (React) — conventions for Claude

Follow these when writing or editing React/TSX under `src/client`. The owner
reviews client code closely, so match them exactly.

## Formatting

- Follow the project Prettier config (`.prettierrc.json`: 4-space indent,
  semicolons, `arrowParens: always`, `es5` trailing commas). Run
  `npx prettier --write <file>` on any file you touch and leave it clean.
- Note: many older client files predate this config and don't conform. Don't
  reformat them wholesale, but any file you create or substantively edit should
  pass `prettier --check`.

## Imports

- Use the path aliases, not deep relative paths:
    - `@/…` → `src/client/…`
    - `@shared/…` → `src/shared/…`
    - e.g. `import { validatePassword } from "@shared/password-policy";`, never
      `"../shared/password-policy"` or `"../../shared/..."`.

## Functions

- Prefer arrow functions for handlers, callbacks, and other local functions,
  e.g. `const submit = async () => { … };` — not `function submit() { … }`.

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
  see `pages/IncomeTrendChart.tsx`.
