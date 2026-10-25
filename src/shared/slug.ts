/** A name as a URL slug: `Food & Drink` becomes `food-drink`. Ids are what
 *  everything internal keys off, but they have no business in a URL a person
 *  reads. */
export const slugify = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** One slug per name, unique across the list in its order: a later name that
 *  slugifies the same as an earlier one gets a numbered suffix, and a name with
 *  nothing slug-worthy in it falls back to `fallback`. */
export const uniqueSlugs = (names: string[], fallback: string): string[] => {
  const taken = new Map<string, number>()
  return names.map((name) => {
    const base = slugify(name) || fallback
    const seen = taken.get(base) ?? 0
    taken.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen + 1}`
  })
}
