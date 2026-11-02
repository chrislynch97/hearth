import { z } from 'zod'
import { asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { actingMemberId, assertMember, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { wishlist, wishlistItem, wishlistItemTag } from '../../db/schema'
import type { WishlistItem } from '../../db/schema'
import { newId } from '@shared/ids'
import { PRIORITIES } from '@shared/priority'
import { MAX_TAGS, MAX_TAG_LENGTH, cleanTagNames } from '@shared/tags'
import type { DBOrTx, Tx } from '../../db/client'

const NAME = z.string().trim().min(1).max(200)
const LINK = z.string().trim().max(2000)
// The column is a Postgres integer.
const PRICE = z.number().int().nonnegative().max(2_147_483_647)
const PRIORITY = z.enum(PRIORITIES)
const TAGS = z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS)

export interface WishlistItemWithTags extends WishlistItem {
  tags: string[]
}

/** A guessed id from another household must not file an item under their list. */
async function assertList(db: DBOrTx, householdId: string, listId: string): Promise<void> {
  const [row] = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(scopeWhere(householdId, wishlist.householdId, eq(wishlist.id, listId)))
  if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That list no longer exists.' })
}

/** Makes an item's tags exactly `names`, reusing another item's spelling so
 *  "kitchen" joins "Kitchen" rather than sitting beside it. */
async function setTags(tx: Tx, householdId: string, itemId: string, names: string[], now: Date): Promise<void> {
  await tx.delete(wishlistItemTag).where(scopeWhere(householdId, wishlistItemTag.householdId, eq(wishlistItemTag.itemId, itemId)))
  const cleaned = cleanTagNames(names)
  const existing =
    cleaned.length === 0
      ? []
      : await tx
          .selectDistinct({ name: wishlistItemTag.name })
          .from(wishlistItemTag)
          .where(
            scopeWhere(
              householdId,
              wishlistItemTag.householdId,
              inArray(
                sql`lower(${wishlistItemTag.name})`,
                cleaned.map((name) => name.toLowerCase()),
              ),
            ),
          )
  const wanted = cleaned.map(
    (name) => existing.find((row) => row.name.toLowerCase() === name.toLowerCase())?.name ?? name,
  )
  if (wanted.length > 0) {
    await tx
      .insert(wishlistItemTag)
      .values(wanted.map((name) => ({ id: newId(), householdId, itemId, name, createdAt: now, updatedAt: now })))
  }
}

export const wishlistItemsRouter = router({
  /** Every live item, bought ones included; the page filters and sorts. */
  list: publicProcedure.query(async ({ ctx }): Promise<WishlistItemWithTags[]> => {
    const rows = await ctx.db
      .select()
      .from(wishlistItem)
      .where(scopeWhere(ctx.householdId, wishlistItem.householdId, isNull(wishlistItem.archivedAt)))
      .orderBy(asc(wishlistItem.createdAt))
    const tags = await ctx.db
      .select({ itemId: wishlistItemTag.itemId, name: wishlistItemTag.name })
      .from(wishlistItemTag)
      .where(scopeWhere(ctx.householdId, wishlistItemTag.householdId))
      .orderBy(asc(wishlistItemTag.name))

    return rows.map((row) => ({
      ...row,
      tags: tags.filter((tag) => tag.itemId === row.id).map((tag) => tag.name),
    }))
  }),

  create: publicProcedure
    .input(
      z.object({
        name: NAME,
        link: LINK.nullable().optional(),
        price: PRICE.nullable().optional(),
        priority: PRIORITY.optional(),
        wantedById: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        listId: z.string().nullable().optional(),
        tags: TAGS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tags = [], ...fields } = input
      if (fields.wantedById) await assertMember(ctx.db, ctx.householdId, fields.wantedById)
      if (fields.listId) await assertList(ctx.db, ctx.householdId, fields.listId)

      const now = new Date()
      const id = newId()
      const inserted = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(wishlistItem)
          .values({ ...fields, id, householdId: ctx.householdId, createdAt: now, updatedAt: now })
          .returning()
        await setTags(tx, ctx.householdId, id, tags, now)
        return row!
      })
      recordAudit(ctx, { entityType: 'wishlistItem', entityId: id, action: 'create', after: inserted })
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: NAME.optional(),
        link: LINK.nullable().optional(),
        price: PRICE.nullable().optional(),
        priority: PRIORITY.optional(),
        wantedById: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        listId: z.string().nullable().optional(),
        tags: TAGS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, tags, ...fields } = input
      if (fields.wantedById) await assertMember(ctx.db, ctx.householdId, fields.wantedById)
      if (fields.listId) await assertList(ctx.db, ctx.householdId, fields.listId)

      const [before] = await ctx.db
        .select()
        .from(wishlistItem)
        .where(scopeWhere(ctx.householdId, wishlistItem.householdId, eq(wishlistItem.id, id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' })

      const now = new Date()
      const updated = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(wishlistItem)
          .set({ ...fields, updatedAt: now })
          .where(
            scopeWhere(
              ctx.householdId,
              wishlistItem.householdId,
              eq(wishlistItem.id, id),
              versionGuard(wishlistItem.updatedAt, expectedUpdatedAt),
            ),
          )
          .returning()
        if (!row) throwStaleWrite('Item', true)
        if (tags) await setTags(tx, ctx.householdId, id, tags, now)
        return row
      })
      recordAudit(ctx, { entityType: 'wishlistItem', entityId: id, action: 'update', before, after: updated })
      return updated
    }),

  /** Tick or un-tick. Asking for the state it's already in returns it unchanged:
   *  two people ticking the same box agree, so there's no conflict to raise. */
  setBought: publicProcedure
    .input(z.object({ id: z.string(), bought: z.boolean(), expectedUpdatedAt: expectedUpdatedAtInput }))
    .mutation(async ({ ctx, input }) => {
      const [before] = await ctx.db
        .select()
        .from(wishlistItem)
        .where(scopeWhere(ctx.householdId, wishlistItem.householdId, eq(wishlistItem.id, input.id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' })
      if ((before.boughtAt !== null) === input.bought) return before

      const now = new Date()
      const boughtById = input.bought ? await actingMemberId(ctx.db, ctx.householdId, ctx.userId) : null
      const [updated] = await ctx.db
        .update(wishlistItem)
        .set({ boughtAt: input.bought ? now : null, boughtById, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            wishlistItem.householdId,
            eq(wishlistItem.id, input.id),
            versionGuard(wishlistItem.updatedAt, input.expectedUpdatedAt),
          ),
        )
        .returning()
      if (updated) {
        recordAudit(ctx, { entityType: 'wishlistItem', entityId: input.id, action: 'update', before, after: updated })
        return updated
      }
      throwStaleWrite('Item', true)
    }),

  /** Archived rather than deleted, so the audit trail still has something to name. */
  archive: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const [before] = await ctx.db
      .select()
      .from(wishlistItem)
      .where(scopeWhere(ctx.householdId, wishlistItem.householdId, eq(wishlistItem.id, input.id)))
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' })

    const now = new Date()
    await ctx.db
      .update(wishlistItem)
      .set({ archivedAt: before.archivedAt ?? now, updatedAt: now })
      .where(scopeWhere(ctx.householdId, wishlistItem.householdId, eq(wishlistItem.id, input.id)))
    recordAudit(ctx, { entityType: 'wishlistItem', entityId: input.id, action: 'archive', before })
  }),
})
