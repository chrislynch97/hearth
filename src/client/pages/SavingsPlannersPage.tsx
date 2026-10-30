import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { DeleteGoalConfirm } from "@/features/savings/components/DeleteGoalConfirm";
import { GoalCard } from "@/features/savings/components/GoalCard";
import { GoalForm } from "@/features/savings/components/GoalForm";
import type { GoalPlan } from "@/features/savings/model";
import { useGoalActions } from "@/features/savings/useGoalActions";

type Editor =
    | { kind: "new" }
    | { kind: "edit"; plan: GoalPlan }
    | { kind: "delete"; plan: GoalPlan };

const editorTitle = (editor: Editor): string =>
    editor.kind === "new"
        ? "New goal"
        : editor.kind === "edit"
          ? "Edit goal"
          : `Delete ${editor.plan.goal.name}?`;

/** Every savings goal, live ones first: where each stands, and the way into
 *  it. Adding, renaming, archiving and deleting all start here. */
export const SavingsPlannersPage = () => {
    const goalsQuery = trpc.savings.goals.useQuery();
    const potsQuery = trpc.savings.eligiblePots.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const money = useMoney();
    const navigate = useNavigate();
    const { toggleArchived, removeGoal, removing } = useGoalActions();


    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);

    const goals = goalsQuery.data ?? [];
    const live = goals.filter(({ goal }) => goal.archivedAt === null);
    const archived = goals.filter(({ goal }) => goal.archivedAt !== null);

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5 text-base">
            <PageHeader
                title="Savings planners"
                description="A goal on top of a pot: what each deadline needs, and whether what's going in gets you there."
                actions={
                    <Button
                        icon={<PlusIcon />}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => setEditor({ kind: "new" })}
                    >
                        New goal
                    </Button>
                }
            />

            {goalsQuery.isLoading && <Spinner label="Loading goals" />}

            {!goalsQuery.isLoading && goals.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        Start with a goal, like a wedding or a new kitchen, and
                        the pot it's saved in. Then add what it'll cost and
                        when.
                    </CardContent>
                </Card>
            )}

            {live.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {live.map((plan) => (
                        <GoalCard
                            key={plan.goal.id}
                            plan={plan}
                            money={money}
                            onEdit={() => setEditor({ kind: "edit", plan })}
                            onToggleArchived={() => void toggleArchived(plan)}
                            onDelete={() => setEditor({ kind: "delete", plan })}
                        />
                    ))}
                </ul>
            )}

            {archived.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-text-muted">
                        Archived
                    </h2>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {archived.map((plan) => (
                            <GoalCard
                                key={plan.goal.id}
                                plan={plan}
                                money={money}
                                onEdit={() => setEditor({ kind: "edit", plan })}
                                onToggleArchived={() => void toggleArchived(plan)}
                                onDelete={() =>
                                    setEditor({ kind: "delete", plan })
                                }
                            />
                        ))}
                    </ul>
                </section>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={
                        editor.kind === "edit" ? editor.plan.goal.name : undefined
                    }
                    exiting={exiting}
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "delete" ? (
                        <DeleteGoalConfirm
                            plan={editor.plan}
                            pending={removing}
                            onConfirm={() =>
                                void removeGoal(editor.plan).then((done) => {
                                    if (done) close();
                                })
                            }
                        />
                    ) : (
                        <GoalForm
                            key={editor.kind === "edit" ? editor.plan.goal.id : "new"}
                            goal={editor.kind === "edit" ? editor.plan : undefined}
                            pots={potsQuery.data ?? []}
                            members={membersQuery.data ?? []}
                            onCreated={(path) =>
                                void navigate({
                                    to: "/planners/$goal",
                                    params: { goal: path },
                                })
                            }
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
