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

const SHORT_ID = /^[0-9a-z]{6}(?=-|$)/

/** A URL segment for something a person named: its fixed short id, then its name
 *  to read, `k3x9p2-wedding`. Only the short id is ever looked up. */
export const shortPath = (shortId: string, name: string): string => {
  const slug = slugify(name)
  return slug ? `${shortId}-${slug}` : shortId
}

/** The short id at the front of a URL segment, or null if there isn't one. */
export const shortIdOf = (path: string): string | null => SHORT_ID.exec(path)?.[0] ?? null
