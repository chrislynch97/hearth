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
