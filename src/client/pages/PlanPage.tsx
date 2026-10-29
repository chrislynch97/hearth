import { useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { todayIso } from "@shared/dates";
import { periodConfig, periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { useMediaQuery } from "@/useMediaQuery";
import { useMoney } from "@/useMoney";
import { orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { BillForm } from "@/features/plan/components/BillForm";
import { BillReviewLink } from "@/features/plan/components/BillReviewLink";
import { CategoryForm } from "@/features/plan/components/CategoryForm";
import { CategoryPane } from "@/features/plan/components/CategoryPane";
import { CategoryFilter } from "@/features/plan/components/CategoryFilter";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { EmptyPlan } from "@/features/plan/components/EmptyPlan";
import { OwnerFilter } from "@/features/plan/components/OwnerFilter";
import { PlanHeader } from "@/features/plan/components/PlanHeader";
import { PotForm } from "@/features/plan/components/PotForm";
import { ShouldHoldDateChip } from "@/features/plan/components/ShouldHoldDateChip";
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

/** Below this the editor opens as a sheet rather than a modal. */
const MODAL_FITS = "(min-width: 1080px)";

/** Categories, pots and bills on one page — pick a category at the
 *  top, work on its pots below, edit whatever you clicked in a panel. The three
 *  pages this replaces were the same tree sliced three ways. */
export const PlanPage = () => {
    const categoriesQuery = trpc.categories.list.useQuery();
    const potsQuery = trpc.pots.list.useQuery();
    const expensesQuery = trpc.expenses.list.useQuery();
    const setAsidesQuery = trpc.setAside.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const alertsQuery = trpc.standingOrders.alerts.useQuery();
    const goalsQuery = trpc.savings.goals.useQuery();
    // Raw field value: empty mid-edit is fine, the query falls back to today.
    const [shouldHoldOn, setShouldHoldOn] = useState(todayIso);
    // Keep the last figures up while a new date loads, so open breakdowns stay open.
    const balancesQuery = trpc.plan.potBalances.useQuery(
        { on: shouldHoldOn || todayIso() },
        { placeholderData: (previous) => previous }
    );
    const ctx = trpc.bootstrap.context.useQuery();
    const utils = trpc.useUtils();
    const acknowledge = trpc.standingOrders.acknowledge.useMutation();

    const money = useMoney();
    const compact = !useMediaQuery(MODAL_FITS);
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

    // Filter by owner first, so the tabs and the page total agree with the cards:
    // picking Ben should retotal the categories, not just thin them out.
    const ownerGroups = groups.map((group) =>
        filterByOwner(group, owner, members, frequency)
    );
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
    const shouldHoldByPot = new Map(
        (balancesQuery.data ?? []).map((balance) => [balance.potId, balance])
    );
    const goalByPot = new Map(
        (goalsQuery.data ?? [])
            .filter(({ goal }) => goal.archivedAt === null)
            .map(({ goal, slug }) => [goal.potId, { slug, name: goal.name }])
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
        <div className="hearth-ds flex min-w-0">
            {isLoading ? (
                <div className="w-full">
                    <Spinner label="Loading the plan" />
                </div>
            ) : (
                <>
                    <div className="flex min-w-0 flex-1 flex-col gap-6">
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
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                                    <CategoryFilter
                                        groups={ownerGroups}
                                        selected={selected}
                                        onSelect={selectCategory}
                                        total={total}
                                        money={money}
                                    />
                                    <OwnerFilter
                                        members={orderMembers(members)}
                                        selected={owner}
                                        onSelect={setOwner}
                                    />
                                    <Button
                                        variant="dashed"
                                        icon={<PlusIcon />}
                                        className="h-9"
                                        onClick={() =>
                                            setEditor({
                                                kind: "category",
                                                category: undefined,
                                            })
                                        }
                                    >
                                        New category
                                    </Button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <ShouldHoldDateChip
                                        value={shouldHoldOn}
                                        onChange={setShouldHoldOn}
                                    />
                                    <BillReviewLink />
                                </div>
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
                                    members={members}
                                    money={money}
                                    frequency={frequency}
                                    unit={unit}
                                    staleByPot={staleByPot}
                                    shouldHoldByPot={shouldHoldByPot}
                                    goalByPot={goalByPot}
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
