import { Suspense, lazy, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMediaQuery } from "@/useMediaQuery";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { BalanceForm } from "@/features/savings/components/BalanceForm";
import { BalanceList } from "@/features/savings/components/BalanceList";
import { GoalBar } from "@/features/savings/components/GoalBar";
import { GoalFigures } from "@/features/savings/components/GoalFigures";
import { GoalForm } from "@/features/savings/components/GoalForm";
import { GoalVerdict } from "@/features/savings/components/GoalVerdict";
import { ItemForm } from "@/features/savings/components/ItemForm";
import { ItemRow } from "@/features/savings/components/ItemRow";
import { WhatIf } from "@/features/savings/components/WhatIf";
import {
    pickGoal,
    plannerInput,
    type GoalPlan,
} from "@/features/savings/model";
import type { SavingsBalance, SavingsItem } from "../../server/db/schema";

// Lazy so recharts stays out of this page's chunk until the chart is drawn.
const GoalChart = lazy(() =>
    import("@/features/savings/components/GoalChart").then((m) => ({
        default: m.GoalChart,
    }))
);

type Editor =
    | { kind: "goal"; goal: GoalPlan | undefined }
    | { kind: "item"; item: SavingsItem | undefined }
    | { kind: "balance" };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "goal") return editor.goal ? "Edit goal" : "New goal";
    if (editor.kind === "item") return editor.item ? "Edit item" : "New item";

    return "Record balance";
};

/** The form keeps its defaults from mount, so opening a different row has to
 *  remount it rather than reuse the one already on screen. */
const editorKey = (editor: Editor): string => {
    if (editor.kind === "goal") return `goal:${editor.goal?.goal.id ?? "new"}`;
    if (editor.kind === "item") return `item:${editor.item?.id ?? "new"}`;

    return "balance";
};

const route = getRouteApi("/planners");

/** Below this the editor is a sheet rather than a modal. */
const MODAL_FITS = "(min-width: 640px)";

/** A savings goal on top of one pot: what's in it, what each deadline needs,
 *  where the current set-aside gets you, and what a different one would. */
export const SavingsPlannersPage = () => {
    const goalsQuery = trpc.savings.goals.useQuery();
    const potsQuery = trpc.savings.eligiblePots.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const utils = trpc.useUtils();
    const apply = trpc.savings.applyContribution.useMutation();
    const setPaid = trpc.savings.setPaid.useMutation();
    const removeBalance = trpc.savings.removeBalance.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const compact = !useMediaQuery(MODAL_FITS);

    // URL state, so a refresh, a shared link or an Overview alert lands on the goal.
    const requested = route.useSearch().goal;
    const navigate = route.useNavigate();
    const selectGoal = (id: string) =>
        void navigate({ search: { goal: id }, replace: true });

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);
    // Per goal, so switching goals doesn't carry one goal's what-if to another.
    const [whatIf, setWhatIf] = useState<{ goalId: string; amount: number } | null>(null);
    const [promptItemId, setPromptItemId] = useState<string | null>(null);

    const goals = goalsQuery.data ?? [];
    const selected = pickGoal(goals, requested);
    const detailQuery = trpc.savings.goal.useQuery(
        { id: selected?.goal.id ?? "" },
        { enabled: selected !== undefined }
    );
    const detail = detailQuery.data;

    const input = detail ? plannerInput(detail) : null;
    const whatIfAmount =
        detail && whatIf?.goalId === detail.goal.id
            ? whatIf.amount
            : (detail?.contribution ?? 0);
    const canSwitch = (detail?.contributionLineCount ?? 0) <= 1;

    const switchContribution = async (perPeriod: number) => {
        if (!detail) return;
        try {
            await apply.mutateAsync({ goalId: detail.goal.id, perPeriod });
        } catch {
            return; // surfaced by the global error handler
        }
        await Promise.all([utils.savings.invalidate(), utils.setAside.invalidate(), utils.plan.invalidate()]);
        setWhatIf(null);
        notifySuccess(
            `The ${detail.potName} pot now gets ${formatMoney(perPeriod, money)}${periodUnitLabel(detail.period.frequency)}.`
        );
    };

    const markPaid = async (item: SavingsItem, reduceTarget: boolean) => {
        if (!detail) return;
        try {
            await setPaid.mutateAsync({
                id: item.id,
                paidOn: detail.today,
                reduceTarget,
            });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        setPromptItemId(null);
        notifySuccess(
            reduceTarget
                ? `Marked ${item.name} paid and took ${formatMoney(item.amount, money)} off the target.`
                : `Marked ${item.name} paid.`
        );
    };

    const markUnpaid = async (item: SavingsItem) => {
        try {
            await setPaid.mutateAsync({ id: item.id, paidOn: null });
        } catch {
            return;
        }
        await utils.savings.invalidate();
    };

    const dropBalance = async (balance: SavingsBalance) => {
        try {
            await removeBalance.mutateAsync({ id: balance.id });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(`Removed the ${formatDate(balance.asOfDate)} balance.`);
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-4 text-base">
            <header className="border-b border-border-strong pb-5">
                <h1 className="font-display text-h1 font-medium leading-tight">
                    Savings planners
                </h1>
                <p className="mt-1 text-sm text-text-muted">
                    A goal on top of a pot: what each deadline needs, and
                    whether what's going in gets you there.
                </p>
            </header>

            {goalsQuery.isLoading && <Spinner label="Loading goals" />}

            {!goalsQuery.isLoading && !selected && (
                <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border-strong p-5">
                    <p className="text-sm text-text-muted">
                        Start with a goal, like a wedding or a new kitchen, and
                        the pot it's saved in. Then add what it'll cost and
                        when.
                    </p>
                    <Button
                        icon={<PlusIcon />}
                        onClick={() => setEditor({ kind: "goal", goal: undefined })}
                    >
                        New goal
                    </Button>
                </div>
            )}

            {selected && (
                <>
                    <GoalBar
                        goals={goals}
                        selected={selected}
                        onSelect={selectGoal}
                        onEdit={() => setEditor({ kind: "goal", goal: selected })}
                        onRecordBalance={() => setEditor({ kind: "balance" })}
                        onAdd={() => setEditor({ kind: "goal", goal: undefined })}
                    />

                    {!detail || !input ? (
                        <Spinner label="Loading the goal" />
                    ) : (
                        <>
                            {detail.goal.archivedAt !== null &&
                                detail.contribution > 0 && (
                                    <Callout>
                                        This goal is archived, but the{" "}
                                        {detail.potName} pot still gets{" "}
                                        {formatMoney(detail.contribution, money)}
                                        {periodUnitLabel(detail.period.frequency)}.{" "}
                                        <Link
                                            to="/plan"
                                            className="font-semibold text-primary"
                                        >
                                            Change it on Plan →
                                        </Link>
                                    </Callout>
                                )}

                            <GoalFigures detail={detail} money={money} />
                            <GoalVerdict
                                detail={detail}
                                money={money}
                                pending={apply.isPending}
                                onUse={(perPeriod) => void switchContribution(perPeriod)}
                            />

                            <section className="rounded-md border border-border bg-raised px-3.5 pb-2 pt-3">
                                <Suspense
                                    fallback={
                                        <div className="h-[310px]">
                                            <Spinner label="Loading the chart" />
                                        </div>
                                    }
                                >
                                    <GoalChart
                                        input={input}
                                        balanceNow={detail.plan.balanceNow}
                                        whatIf={
                                            whatIfAmount === detail.contribution
                                                ? null
                                                : whatIfAmount
                                        }
                                        money={money}
                                        formatDate={formatDate}
                                    />
                                </Suspense>
                            </section>

                            <WhatIf
                                input={input}
                                amount={whatIfAmount}
                                onChange={(amount) =>
                                    setWhatIf({ goalId: detail.goal.id, amount })
                                }
                                potName={detail.potName}
                                canSwitch={canSwitch}
                                pending={apply.isPending}
                                onSwitch={(amount) => void switchContribution(amount)}
                                money={money}
                            />

                            <section className="rounded-md border border-border bg-raised">
                                <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                                    <h2 className="text-base font-semibold">
                                        Items
                                    </h2>
                                    <span className="text-xs text-text-muted">
                                        Tick when paid
                                    </span>
                                    <span className="flex-1" />
                                    <Button
                                        variant="dashed"
                                        compact
                                        icon={<PlusIcon />}
                                        onClick={() =>
                                            setEditor({ kind: "item", item: undefined })
                                        }
                                    >
                                        Add item
                                    </Button>
                                </div>
                                {detail.items.length === 0 ? (
                                    <p className="px-3.5 py-3 text-sm text-text-muted">
                                        No items yet. Add what the goal will
                                        cost, each with its own deadline if it's
                                        due before the day.
                                    </p>
                                ) : (
                                    <ul className="m-0 list-none p-0">
                                        {detail.items.map((item) => (
                                            <ItemRow
                                                key={item.id}
                                                item={item}
                                                targetDate={detail.goal.targetDate}
                                                flag={detail.plan.flags[item.id]}
                                                money={money}
                                                prompt={
                                                    promptItemId === item.id
                                                        ? {
                                                              target: detail.goal.targetAmount,
                                                              pending: setPaid.isPending,
                                                          }
                                                        : null
                                                }
                                                onTick={() => setPromptItemId(item.id)}
                                                onUntick={() => void markUnpaid(item)}
                                                onReduce={() => void markPaid(item, true)}
                                                onKeep={() => void markPaid(item, false)}
                                                onCancel={() => setPromptItemId(null)}
                                                onEdit={() =>
                                                    setEditor({ kind: "item", item })
                                                }
                                            />
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section className="rounded-md border border-border bg-raised">
                                <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                                    <h2 className="text-base font-semibold">
                                        Recorded balances
                                    </h2>
                                    <span className="flex-1" />
                                    <Button
                                        variant="dashed"
                                        compact
                                        icon={<PlusIcon />}
                                        onClick={() => setEditor({ kind: "balance" })}
                                    >
                                        Record
                                    </Button>
                                </div>
                                <BalanceList
                                    balances={detail.balances}
                                    money={money}
                                    removingId={
                                        removeBalance.isPending
                                            ? (removeBalance.variables?.id ?? null)
                                            : null
                                    }
                                    onRemove={(balance) => void dropBalance(balance)}
                                />
                            </section>
                        </>
                    )}
                </>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={
                        editor.kind === "goal" && !editor.goal
                            ? undefined
                            : selected?.goal.name
                    }
                    mode={compact ? "sheet" : "modal"}
                    exiting={exiting}
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "goal" && (
                        <GoalForm
                            key={editorKey(editor)}
                            goal={editor.goal}
                            pots={potsQuery.data ?? []}
                            members={membersQuery.data ?? []}
                            onCreated={selectGoal}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "item" && detail && (
                        <ItemForm
                            key={editorKey(editor)}
                            goal={detail.goal}
                            item={editor.item}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "balance" && detail && (
                        <BalanceForm
                            key={editorKey(editor)}
                            goalId={detail.goal.id}
                            potName={detail.potName}
                            today={detail.today}
                            expected={detail.plan.balanceNow}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
