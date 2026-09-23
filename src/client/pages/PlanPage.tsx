import { useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { periodConfig, periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { useMediaQuery } from "@/useMediaQuery";
import { useMoney } from "@/useMoney";
import { orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { SelectField } from "@/components/ui/SelectField";
import { Spinner } from "@/components/ui/Spinner";
import { BillForm } from "@/features/plan/components/BillForm";
import { BillReviewLink } from "@/features/plan/components/BillReviewLink";
import { CategoryForm } from "@/features/plan/components/CategoryForm";
import { CategoryPane } from "@/features/plan/components/CategoryPane";
import { CategoryRail } from "@/features/plan/components/CategoryRail";
import { EditorPanel } from "@/features/plan/components/EditorPanel";
import { EmptyPlan } from "@/features/plan/components/EmptyPlan";
import { OwnerFilter } from "@/features/plan/components/OwnerFilter";
import { PlanHeader } from "@/features/plan/components/PlanHeader";
import { PotForm } from "@/features/plan/components/PotForm";
import { SetAsideForm } from "@/features/plan/components/SetAsideForm";
import {
    ALL,
    buildPlan,
    countBills,
    countSetAsides,
    filterByOwner,
    groupKey,
    groupSlugs,
    totalPerPeriod,
} from "@/features/plan/model";
import type { Category, Expense, Pot, SetAside } from "../../server/db/schema";

type Editor =
    | { kind: "category"; category: Category | undefined }
    | { kind: "pot"; pot: Pot | undefined; categoryId: string | null }
    | { kind: "setAside"; pot: Pot; setAside: SetAside | undefined }
    | {
          kind: "bill";
          bill: Expense | undefined;
          potId: string | null;
          categoryId: string | null;
      };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "category")
        return editor.category ? "Edit category" : "New category";
    if (editor.kind === "pot") return editor.pot ? "Edit pot" : "New pot";
    if (editor.kind === "setAside")
        return editor.setAside ? "Edit set-aside" : "New set-aside";

    return editor.bill ? "Edit bill" : "New bill";
};

const editorSubtitle = (editor: Editor): string | undefined => {
    if (editor.kind === "category") return editor.category?.name;
    if (editor.kind === "pot") return editor.pot?.name;
    if (editor.kind === "setAside") return editor.pot.name;

    return editor.bill?.name;
};

/** The form keeps its defaults from mount, so opening a different row has to
 *  remount it rather than reuse the one already on screen. */
const editorKey = (editor: Editor): string => {
    if (editor.kind === "category")
        return `category:${editor.category?.id ?? "new"}`;
    if (editor.kind === "pot") return `pot:${editor.pot?.id ?? "new"}`;
    if (editor.kind === "setAside")
        return `set-aside:${editor.setAside?.id ?? `new:${editor.pot.id}`}`;

    return `bill:${editor.bill?.id ?? "new"}:${editor.potId ?? "main"}`;
};

const route = getRouteApi("/plan");

/** Where the rail earns its 200px. Below this the page goes compact: the
 *  categories become a picker in the header, and the editor a sheet rather than
 *  a modal. Kept in step with the `min-[1080px]:` variants below. */
const RAIL_FITS = "(min-width: 1080px)";

/** Categories, pots and bills on one page — pick a category on the left, work on
 *  its pots in the middle, edit whatever you clicked on the right. The three
 *  pages this replaces were the same tree sliced three ways. */
export const PlanPage = () => {
    const categoriesQuery = trpc.categories.list.useQuery();
    const potsQuery = trpc.pots.list.useQuery();
    const expensesQuery = trpc.expenses.list.useQuery();
    const setAsidesQuery = trpc.setAside.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const alertsQuery = trpc.standingOrders.alerts.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();
    const utils = trpc.useUtils();
    const acknowledge = trpc.standingOrders.acknowledge.useMutation();

    const money = useMoney();
    const compact = !useMediaQuery(RAIL_FITS);
    const frequency = periodConfig(ctx.data?.household ?? 1).frequency;
    const unit = periodUnitLabel(frequency);

    // The category is URL state: a refresh, a bookmark or a link all come back
    // to the same one. Replaced rather than pushed — it is a filter, and a back
    // button that walks every category you clicked is nobody's idea of back.
    const requested = route.useSearch().category ?? ALL;
    const navigate = route.useNavigate();
    const selectCategory = (key: string) =>
        void navigate({
            search: key === ALL ? {} : { category: slugOf(key) },
            replace: true,
        });

    const [owner, setOwner] = useState(ALL);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);
    const [acknowledgingPotId, setAcknowledgingPotId] = useState<string | null>(
        null
    );

    const categories = categoriesQuery.data ?? [];
    const pots = potsQuery.data ?? [];
    const members = (membersQuery.data ?? []).filter(
        (member) => member.archivedAt === null
    );
    const setAsides = setAsidesQuery.data ?? [];

    const isLoading =
        categoriesQuery.isLoading ||
        potsQuery.isLoading ||
        expensesQuery.isLoading ||
        membersQuery.isLoading;

    const groups = buildPlan({
        categories,
        pots,
        bills: expensesQuery.data ?? [],
        setAsides,
        members,
        frequency,
    });

    // Filter by owner first, so the rail and the page total agree with the cards:
    // picking Ben should retotal the categories, not just thin them out.
    const ownerGroups = groups.map((group) => filterByOwner(group, owner));
    // The URL carries a slug; everything internal keys off the id. An id still
    // resolves, so links from before the slugs keep working, and a slug that no
    // longer matches anything (a renamed or archived category) falls back to
    // everything rather than leaving the page blank.
    const slugs = groupSlugs(groups);
    const keyForSlug = new Map(
        [...slugs].map(([key, slug]) => [slug, key] as const)
    );
    const selected =
        requested === ALL
            ? ALL
            : (keyForSlug.get(requested) ??
              (groups.some((group) => groupKey(group) === requested)
                  ? requested
                  : ALL));

    const visible = ownerGroups.filter(
        (group) => selected === ALL || groupKey(group) === selected
    );
    const total = totalPerPeriod(ownerGroups);

    const staleByPot = new Map(
        (alertsQuery.data ?? []).map((alert) => [
            alert.potId,
            { wasMonthly: alert.wasMonthly },
        ])
    );

    const slugOf = (key: string) => slugs.get(key) ?? key;

    // Keep the URL honest once the categories have loaded: an id (an old link,
    // or a category created a moment ago and selected before the slugs knew
    // about it) becomes its slug, and one that no longer resolves — archived,
    // renamed — is dropped rather than left naming nothing. Not before load:
    // with no categories yet, every slug looks like the second case.
    const canonical = selected === ALL ? undefined : slugs.get(selected);
    useEffect(() => {
        if (isLoading || requested === ALL || canonical === requested) return;
        void navigate({
            search: canonical ? { category: canonical } : {},
            replace: true,
        });
    }, [isLoading, canonical, requested, navigate]);

    const handleAcknowledge = async (potId: string) => {
        setAcknowledgingPotId(potId);
        try {
            await acknowledge.mutateAsync({ potId });
            await utils.standingOrders.alerts.invalidate();
        } finally {
            setAcknowledgingPotId(null);
        }
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    return (
        // Full-bleed: the rail is a nav tier against the sidebar, not a card
        // floating inside the page, so it has to cancel AppShell's padding and
        // put it back on the content column. `first:` keeps the top margin off
        // whenever a banner is rendered above us.
        <div className="hearth-ds -mx-[var(--app-shell-padding)] -mb-[var(--app-shell-padding)] flex min-h-[calc(100dvh-var(--app-shell-header-height,0px))] items-stretch first:-mt-[var(--app-shell-padding)]">
            {isLoading ? (
                <div className="w-full">
                    <Spinner label="Loading the plan" />
                </div>
            ) : (
                <>
                    {/* Sticky and self-start rather than stretched: the rail is
                        taller than the window on the All view, and an add
                        button you have to scroll eight categories to reach is not
                        an add button. */}
                    <div className="sticky top-0 hidden h-[calc(100dvh-var(--app-shell-header-height,0px))] self-start min-[1080px]:flex">
                        <CategoryRail
                            groups={ownerGroups}
                            selected={selected}
                            onSelect={selectCategory}
                            total={total}
                            money={money}
                            onAddCategory={() =>
                                setEditor({
                                    kind: "category",
                                    category: undefined,
                                })
                            }
                        />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-6 p-[var(--app-shell-padding)]">
                        <PlanHeader
                            total={total}
                            unit={unit}
                            money={money}
                            categoryCount={
                                ownerGroups.filter((group) => group.categoryId)
                                    .length
                            }
                            potCount={ownerGroups.reduce(
                                (count, group) => count + group.pots.length,
                                0
                            )}
                            billCount={ownerGroups.reduce(
                                (count, group) => count + countBills(group),
                                0
                            )}
                            setAsideCount={ownerGroups.reduce(
                                (count, group) => count + countSetAsides(group),
                                0
                            )}
                        >
                            {/* No rail this narrow, so the picker carries the
                            add button the rail would have held. */}
                            <div className="flex items-end gap-2 min-[1080px]:hidden">
                                {/* Empty means all: the field reads as unfiltered
                                rather than as one more category, and the real
                                ones sit under their own header in the native
                                picker. */}
                                <SelectField
                                    label="Category"
                                    className="flex-1"
                                    placeholder="All categories"
                                    options={[
                                        {
                                            label: "Categories",
                                            options: ownerGroups.map(
                                                (group) => ({
                                                    value: groupKey(group),
                                                    label: group.name,
                                                })
                                            ),
                                        },
                                    ]}
                                    value={selected === ALL ? "" : selected}
                                    onChange={(event) =>
                                        selectCategory(
                                            event.currentTarget.value || ALL
                                        )
                                    }
                                />
                                <Button
                                    variant="outline"
                                    aria-label="New category"
                                    className="h-[34px] w-[34px] px-0"
                                    onClick={() =>
                                        setEditor({
                                            kind: "category",
                                            category: undefined,
                                        })
                                    }
                                >
                                    <PlusIcon size={15} />
                                </Button>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <OwnerFilter
                                    members={orderMembers(members)}
                                    selected={owner}
                                    onSelect={setOwner}
                                />
                                <BillReviewLink />
                            </div>
                        </PlanHeader>

                        {/* Capped, but generously: past ~1120px a pot card only
                            puts more air between a name and its amount. */}
                        <div className="flex min-w-0 flex-1 flex-col gap-10 xl:max-w-[1120px]">
                            {groups.length === 0 && (
                                <EmptyPlan
                                    onAddCategory={() =>
                                        setEditor({
                                            kind: "category",
                                            category: undefined,
                                        })
                                    }
                                    onAddPot={() =>
                                        setEditor({
                                            kind: "pot",
                                            pot: undefined,
                                            categoryId: null,
                                        })
                                    }
                                />
                            )}
                            {visible.map((group) => (
                                <CategoryPane
                                    key={groupKey(group)}
                                    group={group}
                                    money={money}
                                    frequency={frequency}
                                    unit={unit}
                                    staleByPot={staleByPot}
                                    acknowledgingPotId={acknowledgingPotId}
                                    onAcknowledge={(potId) =>
                                        void handleAcknowledge(potId)
                                    }
                                    onEditCategory={() =>
                                        setEditor({
                                            kind: "category",
                                            category: categories.find(
                                                (c) => c.id === group.categoryId
                                            ),
                                        })
                                    }
                                    onAddPot={() =>
                                        setEditor({
                                            kind: "pot",
                                            pot: undefined,
                                            categoryId: group.categoryId,
                                        })
                                    }
                                    onEditPot={(pot) =>
                                        setEditor({
                                            kind: "pot",
                                            pot,
                                            categoryId: group.categoryId,
                                        })
                                    }
                                    onAddSetAside={(pot) =>
                                        setEditor({
                                            kind: "setAside",
                                            pot,
                                            setAside: undefined,
                                        })
                                    }
                                    onEditSetAside={(pot, setAside) =>
                                        setEditor({
                                            kind: "setAside",
                                            pot,
                                            setAside,
                                        })
                                    }
                                    onAddBill={(potId) =>
                                        setEditor({
                                            kind: "bill",
                                            bill: undefined,
                                            potId,
                                            categoryId: group.categoryId,
                                        })
                                    }
                                    onEditBill={(bill) =>
                                        setEditor({
                                            kind: "bill",
                                            bill,
                                            potId: bill.potId,
                                            categoryId: bill.categoryId,
                                        })
                                    }
                                />
                            ))}
                        </div>

                        {editor && (
                            <EditorPanel
                                title={editorTitle(editor)}
                                subtitle={editorSubtitle(editor)}
                                mode={compact ? "sheet" : "modal"}
                                exiting={exiting}
                                onExited={finishClose}
                                onClose={close}
                            >
                                {editor.kind === "category" && (
                                    <CategoryForm
                                        key={editorKey(editor)}
                                        category={editor.category}
                                        potCount={
                                            pots.filter(
                                                (pot) =>
                                                    pot.categoryId ===
                                                    editor.category?.id
                                            ).length
                                        }
                                        onCreated={selectCategory}
                                        onDone={close}
                                    />
                                )}
                                {editor.kind === "pot" && (
                                    <PotForm
                                        key={editorKey(editor)}
                                        pot={editor.pot}
                                        members={members}
                                        categories={categories}
                                        defaultCategoryId={editor.categoryId}
                                        onDone={close}
                                    />
                                )}
                                {editor.kind === "setAside" && (
                                    <SetAsideForm
                                        key={editorKey(editor)}
                                        pot={editor.pot}
                                        setAside={editor.setAside}
                                        onDone={close}
                                    />
                                )}
                                {editor.kind === "bill" && (
                                    <BillForm
                                        key={editorKey(editor)}
                                        bill={editor.bill}
                                        pots={pots}
                                        members={members}
                                        categories={categories}
                                        defaultPotId={editor.potId}
                                        defaultCategoryId={editor.categoryId}
                                        onDone={close}
                                    />
                                )}
                            </EditorPanel>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
