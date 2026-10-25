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
