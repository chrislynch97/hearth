# Hearth — Brand identity (v1)

Source of truth for the Hearth visual identity. Human-readable and safe to hand to
Claude / Claude Code. The machine-consumable Mantine theme lives in
`brand/hearth-theme.ts` (copy to `src/client/theme.ts` for the app).

> **For AI assistants:** when building or restyling any Hearth UI, use the tokens
> below. Prefer the Mantine theme colours (`moss`, `apricot`, `sand`) and the
> `hearthTokens` object over raw hex. Headings + money figures are Spectral;
> everything else is Hanken Grotesk. Never introduce new hues or gradients.

---

## Name & tone

**Hearth** — a local-first household budgeting app that grows into wider household
management (salaries, savings, loans). Voice: warm and plain-spoken, quietly
competent. Not jokey, not corporate. "The home ledger."

---

## Logo

The mark is a **house with a lit window** (the "hearth" glow) — a gable roof over
two walls with a single apricot dot. Files in `brand/logo/`:

| File | Use |
|---|---|
| `hearth-mark.svg` | Primary mark — moss with apricot window, on light surfaces |
| `hearth-mark-mono.svg` | Single-ink mark for stamps, engraving, disabled states |
| `hearth-favicon.svg` | App icon / favicon — linen mark on a rounded moss tile |

**Lockup:** mark + "Hearth" in Spectral Medium, left-aligned, gap ≈ 0.4× cap height.
**Clearspace:** keep clear space equal to the height of the roof on all sides.
**Min size:** 20px mark in UI; 16px favicon tile.
**Don't:** recolour the window anything but apricot; stretch; add shadows/gradients;
set the wordmark in a sans.

---

## Colour

### Core
| Token | Hex | Role |
|---|---|---|
| Moss | `#47613F` | Primary. Brand green, primary buttons, active nav, sidebar. |
| Moss deep | `#2E3F28` | Emphasis surfaces (e.g. joint-pots card). |
| Ink / Bark | `#22261F` | Text, dark buttons, dark-mode background. |
| Apricot | `#D98C5F` | Accent — attention only (over budget, needs-a-pot, reconcile). |
| Linen | `#EFEDE3` | Light elements on dark (logo, sidebar text). |

### Neutrals (`sand` scale)
| Token | Hex | Role |
|---|---|---|
| Paper | `#FBFAF4` | Card surface (Mantine `white`). |
| Canvas | `#F4F2EA` | App background. |
| Border | `#E7E2D5` | Hairlines, card borders. |
| Stone | `#A9A491` | Muted UI, savings-pot bars. |
| Faint / Muted text | `#8E9482` / `#7C8676` | Secondary + label text. |

### Semantic
| Token | Hex | Role |
|---|---|---|
| Positive | `#3E7C4F` | Refunds, in-credit amounts. |
| Attention | `#D98C5F` | Over budget, needs-a-pot, catch-up. |
| Savings | `#8A7A6A` | Drawdown / savings pots. |

### Owner accents
Assign per household member, in order: `#6E8A5F`, `#C1745A`, `#8A7A6A`, `#5B7D86`, `#A08A52`.

Full 10-step ramps for Mantine are in `hearth-theme.ts`.

---

## Typography

| Role | Font | Notes |
|---|---|---|
| Headings & money figures | **Spectral** (Medium 500) | Warm high-contrast serif. Big balances, page titles. |
| Interface / body | **Hanken Grotesk** (400/500/600) | All UI text, labels, buttons. |
| Labels & data | **Space Mono** | Uppercase eyebrows, hex, small technical labels. |

Numbers use `font-variant-numeric: tabular-nums` everywhere they align in columns.

Google Fonts `<link>` for `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

---

## Shape & spacing

- Radius: cards `12–16px`, inputs/buttons `9–12px`, pills `999px`.
- Borders over shadows in light mode; soft shadows only for elevated/floating surfaces.
- Progress bars: `8px` tall, fully rounded. Fill moss; switch to apricot when over budget.
- Density is comfortable, not cramped — this is a calm app.

---

## Using it with Mantine (v1)

1. Copy `brand/hearth-theme.ts` → `src/client/theme.ts` (it already exports `theme`).
2. Add the Google Fonts `<link>` to `index.html`.
3. Import `hearthTokens` where you need raw values (custom charts, bars, tinted panels).
4. Primary buttons/nav read as moss automatically; use `color="apricot"` only for
   attention states and `color="green"`→ map to the `positive` token for credits.

Visual reference sheet: `Hearth — Identity.dc.html`.
