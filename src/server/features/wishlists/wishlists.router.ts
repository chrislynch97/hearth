import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { wishlist, wishlistItem } from '../../db/schema'
import type { Wishlist } from '../../db/schema'
import { newId } from '@shared/ids'
import { shortPath } from '@shared/slug'
import { newShortId } from '../savings/savings'

const NAME = z.string().trim().min(1).max(100)

export interface WishlistSummary extends Wishlist {
  /** Its URL segment, `k3x9p2-kitchen`. */
  slug: string
  total: number
  /** How many have been bought. */
  done: number
}

export const wishlistsRouter = router({
  /** Every list, archived included, with how much of it has been bought. */
  list: publicProcedure.query(async ({ ctx }): Promise<WishlistSummary[]> => {
    const lists = await ctx.db
      .select()
      .from(wishlist)
      .where(scopeWhere(ctx.householdId, wishlist.householdId))
      .orderBy(asc(wishlist.createdAt))
    const items = await ctx.db
      .select({ listId: wishlistItem.listId, boughtAt: wishlistItem.boughtAt })
      .from(wishlistItem)
      .where(scopeWhere(ctx.householdId, wishlistItem.householdId, isNull(wishlistItem.archivedAt)))

    return lists.map((list) => {
      const own = items.filter((item) => item.listId === list.id)
      return {
        ...list,
        slug: shortPath(list.shortId, list.name),
        total: own.length,
        done: own.filter((item) => item.boughtAt !== null).length,
      }
    })
  }),

  create: publicProcedure.input(z.object({ name: NAME })).mutation(async ({ ctx, input }) => {
    const now = new Date()
    const id = newId()
    const taken = await ctx.db
      .select({ shortId: wishlist.shortId })
      .from(wishlist)
      .where(scopeWhere(ctx.householdId, wishlist.householdId))
    const shortId = newShortId(new Set(taken.map((t) => t.shortId)))
    const [inserted] = await ctx.db
      .insert(wishlist)
      .values({ id, householdId: ctx.householdId, shortId, name: input.name, createdAt: now, updatedAt: now })
      .returning()
    recordAudit(ctx, { entityType: 'wishlist', entityId: id, action: 'create', after: inserted })
    return { ...inserted!, slug: shortPath(shortId, input.name) }
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: NAME.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, name, archived } = input
      const now = new Date()
      const [before] = await ctx.db
        .select()
        .from(wishlist)
        .where(scopeWhere(ctx.householdId, wishlist.householdId, eq(wishlist.id, id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' })

      const archiving = archived === undefined ? {} : { archivedAt: archived ? (before.archivedAt ?? now) : null }
      const [updated] = await ctx.db
        .update(wishlist)
        .set({ ...(name === undefined ? {} : { name }), ...archiving, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            wishlist.householdId,
            eq(wishlist.id, id),
            versionGuard(wishlist.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
      if (updated) {
        const action = archived && !before.archivedAt ? 'archive' : 'update'
        recordAudit(ctx, { entityType: 'wishlist', entityId: id, action, before, after: updated })
        return updated
      }
      throwStaleWrite('List', true)
    }),
})
