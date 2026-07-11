// Curated list of regions the household can pick from. `locale` only drives date
// formatting (numeric day/month order and month names via `Intl` in
// `dateFormat.ts`) — currency shape is configured separately with explicit
// symbol/separator settings, so this is deliberately a small, common set rather
// than the full Intl locale catalogue.
export interface LocaleOption {
  value: string
  label: string
}

export const LOCALES: LocaleOption[] = [
  { value: 'en-GB', label: 'United Kingdom — English (04/07/2026)' },
  { value: 'en-US', label: 'United States — English (07/04/2026)' },
  { value: 'en-IE', label: 'Ireland — English (04/07/2026)' },
  { value: 'en-AU', label: 'Australia — English (04/07/2026)' },
  { value: 'en-CA', label: 'Canada — English (2026-07-04)' },
  { value: 'en-NZ', label: 'New Zealand — English (04/07/2026)' },
  { value: 'de-DE', label: 'Germany — German (04.07.2026)' },
  { value: 'fr-FR', label: 'France — French (04/07/2026)' },
  { value: 'es-ES', label: 'Spain — Spanish (4/7/2026)' },
  { value: 'it-IT', label: 'Italy — Italian (04/07/2026)' },
  { value: 'nl-NL', label: 'Netherlands — Dutch (04-07-2026)' },
]
