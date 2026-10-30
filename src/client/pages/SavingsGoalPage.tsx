import { useEffect, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { Notice } from "@/components/ui/Notice";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { BalanceForm } from "@/features/savings/components/BalanceForm";
import { BalanceList } from "@/features/savings/components/BalanceList";
import { DeleteGoalConfirm } from "@/features/savings/components/DeleteGoalConfirm";
import { GoalChart } from "@/features/savings/components/GoalChart";
import { GoalFigures } from "@/features/savings/components/GoalFigures";
import { GoalForm } from "@/features/savings/components/GoalForm";
import { GoalHeader } from "@/features/savings/components/GoalHeader";
import { GoalVerdict } from "@/features/savings/components/GoalVerdict";
import { ItemForm } from "@/features/savings/components/ItemForm";
import { ItemRow } from "@/features/savings/components/ItemRow";
import { ItemsFooter } from "@/features/savings/components/ItemsFooter";
import { PaidForm } from "@/features/savings/components/PaidForm";
import { WhatIf } from "@/features/savings/components/WhatIf";
import {
    findGoal,
    plannerInput,
    type GoalPlan,
} from "@/features/savings/model";
import { useGoalActions } from "@/features/savings/useGoalActions";
import type { SavingsBalance, SavingsItem } from "../../server/db/schema";

type Editor =
    | { kind: "goal"; goal: GoalPlan; focusRate?: boolean }
    | { kind: "delete"; goal: GoalPlan }
    | { kind: "item"; item: SavingsItem | undefined }
    | { kind: "paid"; item: SavingsItem }
    | { kind: "balance"; balance: SavingsBalance | undefined };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "goal") return "Edit goal";
    if (editor.kind === "delete") return `Delete ${editor.goal.goal.name}?`;
    if (editor.kind === "item") return editor.item ? "Edit item" : "New item";
    if (editor.kind === "paid") return `Mark ${editor.item.name} paid`;

    return editor.balance ? "Edit balance" : "Record balance";
};

/** The form keeps its defaults from mount, so opening a different row has to
 *  remount it rather than reuse the one already on screen. */
const editorKey = (editor: Editor): string => {
    if (editor.kind === "goal")
        return `goal:${editor.goal.goal.id}${editor.focusRate ? ":rate" : ""}`;
    if (editor.kind === "delete") return `delete:${editor.goal.goal.id}`;
    if (editor.kind === "item") return `item:${editor.item?.id ?? "new"}`;
    if (editor.kind === "paid") return `paid:${editor.item.id}`;

    return `balance:${editor.balance?.id ?? "new"}`;
};

const route = getRouteApi("/planners/$goal");

/** A savings goal on top of one pot: what's in it, what each deadline needs,
 *  where the current set-aside gets you, and what a different one would. */
export const SavingsGoalPage = () => {
    const goalsQuery = trpc.savings.goals.useQuery();
    const utils = trpc.useUtils();
    const apply = trpc.savings.applyContribution.useMutation();
    const setPaid = trpc.savings.setPaid.useMutation();
    const { toggleArchived, removeGoal, removing } = useGoalActions();
    const money = useMoney();
    const formatDate = useFormatDate();


    // The goal's URL segment, `<shortId>-<name>`.
    const key = route.useParams().goal;
    const navigate = route.useNavigate();

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);
    // Per goal, so switching goals doesn't carry one goal's what-if to another.
    const [whatIf, setWhatIf] = useState<{ goalId: string; amount: number } | null>(null);

    const goals = goalsQuery.data ?? [];
    const selected = findGoal(goals, key);

    useEffect(() => {
        // A stale name after the short id (a rename, an old link) becomes the
        // goal's current one.
        if (selected && key !== selected.slug)
            void navigate({
                to: "/planners/$goal",
                params: { goal: selected.slug },
                replace: true,
            });
    }, [selected, key, navigate]);
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
    // An item-by-item goal with nothing unpaid has no plan to draw.
    const nothingToPlan =
        detail !== undefined &&
        detail.goal.targetAmount === null &&
        detail.items.every((item) => item.paidOn !== null);

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

    const markUnpaid = async (item: SavingsItem) => {
        try {
            await setPaid.mutateAsync({ id: item.id, paidOn: null });
        } catch {
            return; // surfaced by the global error handler
        }
        await utils.savings.invalidate();
        notifySuccess(`Marked ${item.name} not paid. The target is unchanged.`);
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5 text-base">
            {!selected && (goalsQuery.isLoading || goalsQuery.isFetching) && (
                <Spinner label="Loading the goal" />
            )}

            {!selected && !goalsQuery.isLoading && !goalsQuery.isFetching && (
                <Card>
                    <CardContent className="flex flex-col items-start gap-3">
                        <p className="text-base text-text-muted">
                        There's no savings goal at this address. It may have
                        been renamed or deleted.
                        </p>
                        <Button asChild>
                            <Link to="/planners">All savings planners</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {selected && (
                <>
                    <GoalHeader
                        plan={selected}
                        onEdit={() => setEditor({ kind: "goal", goal: selected })}
                        onEditRate={() =>
                            setEditor({ kind: "goal", goal: selected, focusRate: true })
                        }
                        onToggleArchived={() => void toggleArchived(selected)}
                        onDelete={() =>
                            setEditor({ kind: "delete", goal: selected })
                        }
                        onRecordBalance={() =>
                            setEditor({ kind: "balance", balance: undefined })
                        }
                    />

                    {!detail || !input ? (
                        <Spinner label="Loading the goal" />
                    ) : (
                        <>
                            {detail.goal.archivedAt !== null &&
                                detail.contribution > 0 && (
                                    <Notice
                                        tone="info"
                                        title="This goal is archived"
                                        action={
                                            <Button asChild>
                                                <Link to="/plan">
                                                    Change it on Plan
                                                </Link>
                                            </Button>
                                        }
                                    >
                                        The {detail.potName} pot still gets{" "}
                                        {formatMoney(detail.contribution, money)}
                                        {periodUnitLabel(detail.period.frequency)}.
                                    </Notice>
                                )}

                            <GoalFigures detail={detail} money={money} />
                            {nothingToPlan ? (
                                <Card>
                                    <CardContent className="text-base text-text-muted">
                                    {detail.items.length === 0
                                        ? "Add what you're saving for, each with its own date, and the plan shows here."
                                        : "Nothing left to save for. Add an item, or archive the goal."}
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    <GoalVerdict
                                        detail={detail}
                                        money={money}
                                        pending={apply.isPending}
                                        onUse={(perPeriod) => void switchContribution(perPeriod)}
                                    />

                                    <Card className="gap-0 px-3.5 py-3">
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
                                    </Card>

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
                                </>
                            )}

                            <Card className="gap-0 overflow-hidden py-0">
                                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
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
                                        className="max-sm:h-9 max-sm:w-full"
                                        onClick={() =>
                                            setEditor({ kind: "item", item: undefined })
                                        }
                                    >
                                        Add item
                                    </Button>
                                </div>
                                {detail.items.length === 0 ? (
                                    <p className="px-3.5 py-3 text-sm text-text-muted">
                                        {detail.goal.targetAmount === null
                                            ? "No items yet. Add each thing you're saving for, with its date."
                                            : "No items yet. Add what the goal will cost, each with its own deadline if it's due before the day."}
                                    </p>
                                ) : (
                                    <ul className="m-0 list-none p-0">
                                        {detail.items.map((item) => (
                                            <ItemRow
                                                key={item.id}
                                                item={item}
                                                targetDate={detail.target.targetDate}
                                                flag={detail.plan.flags[item.id]}
                                                money={money}
                                                pending={
                                                    setPaid.isPending &&
                                                    setPaid.variables?.id === item.id
                                                }
                                                onTick={() =>
                                                    setEditor({ kind: "paid", item })
                                                }
                                                onUntick={() => void markUnpaid(item)}
                                                onEdit={() =>
                                                    setEditor({ kind: "item", item })
                                                }
                                            />
                                        ))}
                                    </ul>
                                )}
                                {detail.items.length > 0 && (
                                    <ItemsFooter plan={detail} money={money} />
                                )}
                            </Card>

                            <Card className="gap-0 overflow-hidden py-0">
                                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
                                    <h2 className="text-base font-semibold">
                                        Recorded balances
                                    </h2>
                                    <span className="flex-1" />
                                    <Button
                                        variant="dashed"
                                        compact
                                        icon={<PlusIcon />}
                                        className="max-sm:h-9 max-sm:w-full"
                                        onClick={() =>
                                            setEditor({
                                                kind: "balance",
                                                balance: undefined,
                                            })
                                        }
                                    >
                                        Record
                                    </Button>
                                </div>
                                <BalanceList
                                    balances={detail.balances}
                                    money={money}
                                    onEdit={(balance) =>
                                        setEditor({ kind: "balance", balance })
                                    }
                                />
                            </Card>
                        </>
                    )}
                </>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={selected?.goal.name}
                    exiting={exiting}
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "delete" && (
                        <DeleteGoalConfirm
                            key={editorKey(editor)}
                            plan={editor.goal}
                            pending={removing}
                            onConfirm={() =>
                                void removeGoal(editor.goal).then((done) => {
                                    if (done) void navigate({ to: "/planners" });
                                })
                            }
                        />
                    )}
                    {editor.kind === "goal" && (
                        <GoalForm
                            key={editorKey(editor)}
                            goal={editor.goal}
                            focusRate={editor.focusRate}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "item" && detail && (
                        <ItemForm
                            key={editorKey(editor)}
                            goal={detail.goal}
                            items={detail.items}
                            item={editor.item}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "paid" && detail && (
                        <PaidForm
                            key={editorKey(editor)}
                            item={editor.item}
                            target={detail.goal.targetAmount}
                            anchor={detail.plan.anchor}
                            today={detail.today}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "balance" && detail && (
                        <BalanceForm
                            key={editorKey(editor)}
                            goalId={detail.goal.id}
                            potName={detail.potName}
                            today={detail.today}
                            balance={editor.balance}
                            expected={detail.plan.balanceNow}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
