import { useEffect, useState } from "react";
import { getRouteApi, useNavigate, useParams } from "@tanstack/react-router";
import { formatMonthYear } from "@shared/dateFormat";
import { todayIso } from "@shared/dates";
import { shortIdOf, slugify } from "@shared/slug";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { ListFilters } from "@/components/ui/ListFilters";
import { ListNav } from "@/components/ui/ListNav";
import { Spinner } from "@/components/ui/Spinner";
import { TodoDone } from "@/features/todos/components/TodoDone";
import { TodoForm } from "@/features/todos/components/TodoForm";
import { TodoHero } from "@/features/todos/components/TodoHero";
import { TodoListForm } from "@/features/todos/components/TodoListForm";
import { TodoQuickAdd } from "@/features/todos/components/TodoQuickAdd";
import { TodoRow } from "@/features/todos/components/TodoRow";
import {
    allTags,
    filterTodos,
    splitTodos,
    todoSections,
    todoSummary,
    type TodoListSummary,
    type TodoWithDetails,
} from "@/features/todos/model";

type Editor =
    | { kind: "todo"; todo: TodoWithDetails }
    | { kind: "list"; list: TodoListSummary | undefined };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "todo") return "Edit to-do";

    return editor.list ? "Edit list" : "New list";
};

const route = getRouteApi("/todos");

/** The household's to-dos as a diary: everything together, or one list at a
 *  time, each with its own link. Filters sit in the URL, so a refresh keeps them. */
export const TodosPage = () => {
    const todosQuery = trpc.todos.list.useQuery();
    const listsQuery = trpc.todoLists.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const utils = trpc.useUtils();
    const complete = trpc.todos.complete.useMutation();
    const archiveCompleted = trpc.todos.archiveCompleted.useMutation();
    const formatDate = useFormatDate();
    const { locale } = useMoney();

    const search = route.useSearch();
    const navigate = useNavigate();
    const key = useParams({ strict: false }).list;

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);

    const todos = todosQuery.data ?? [];
    const lists = listsQuery.data ?? [];
    const members = (membersQuery.data ?? []).filter(
        (member) => member.archivedAt === null
    );
    const selected = lists.find((list) => list.shortId === shortIdOf(key ?? ""));
    const person = members.find(
        (member) => slugify(member.displayName) === search.person
    );
    const everyTag = allTags(todos);
    const selectedTags = (search.tags?.split(".") ?? []).map(
        (slug) => everyTag.find((tag) => slugify(tag) === slug) ?? slug
    );
    const today = todayIso();

    useEffect(() => {
        // A stale name after the short id (a rename, an old link) becomes the
        // list's current one.
        if (selected && key !== selected.slug)
            void navigate({
                to: "/todos/$list",
                params: { list: selected.slug },
                search: true,
                replace: true,
            });
    }, [selected, key, navigate]);

    const inList = selected
        ? todos.filter((todo) => todo.listId === selected.id)
        : todos;
    const everything = splitTodos(inList);
    // A tag still being filtered on keeps its chip, or it could never be cleared.
    const tags = [...new Set([...allTags(inList), ...selectedTags])];
    const { open, done } = splitTodos(
        filterTodos(inList, { tags: selectedTags, person: person?.id })
    );
    const sections = todoSections(open, today, (date) =>
        formatMonthYear(date, locale)
    );

    const setSearch = (next: Partial<typeof search>) =>
        void navigate({
            to: ".",
            search: (current) => ({ ...current, ...next }),
            replace: true,
        });

    const selectList = (slug: string | undefined) =>
        void navigate({
            to: slug ? "/todos/$list" : "/todos",
            params: slug ? { list: slug } : {},
            // A tag from one list means nothing on the next.
            search: (current) => ({ ...current, tags: undefined }),
        });

    const toggleTag = (tag: string) => {
        const next = selectedTags.includes(tag)
            ? selectedTags.filter((t) => t !== tag)
            : [...selectedTags, tag];
        setSearch({
            tags: next.length > 0 ? next.map(slugify).join(".") : undefined,
        });
    };

    const refresh = async () => {
        await Promise.all([
            utils.todos.invalidate(),
            utils.todoLists.invalidate(),
        ]);
    };

    const toggle = async (todo: TodoWithDetails) => {
        try {
            await complete.mutateAsync({
                id: todo.id,
                done: todo.completedAt === null,
                expectedUpdatedAt: todo.updatedAt,
            });
        } finally {
            // A failed tick is surfaced globally; the refetch puts the box back.
            await refresh();
        }
    };

    const clearDone = async () => {
        const { archived } = await archiveCompleted.mutateAsync({
            listId: selected?.id,
        });
        await refresh();
        notifySuccess(
            archived === 1 ? "Cleared 1 to-do." : `Cleared ${archived} to-dos.`
        );
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    const row = (todo: TodoWithDetails, showDate: boolean) => (
        <TodoRow
            key={todo.id}
            todo={todo}
            assigneeName={
                members.find((m) => m.id === todo.assigneeId)?.displayName ??
                null
            }
            listName={
                selected
                    ? null
                    : (lists.find((l) => l.id === todo.listId)?.name ?? null)
            }
            showDate={showDate}
            today={today}
            pending={complete.isPending && complete.variables?.id === todo.id}
            onToggle={() => void toggle(todo)}
            onEdit={() => setEditor({ kind: "todo", todo })}
        />
    );

    const loading = todosQuery.isLoading || listsQuery.isLoading;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-6 text-base">
            <TodoHero
                title={selected?.name ?? "To-dos"}
                summary={todoSummary(
                    everything.open,
                    everything.done.length,
                    today,
                    formatDate
                )}
                progress={selected}
                onEdit={
                    selected
                        ? () => setEditor({ kind: "list", list: selected })
                        : undefined
                }
            />

            {loading && <Spinner label="Loading to-dos" />}

            {!loading && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
                    <aside className="flex flex-col gap-3 lg:order-2 lg:gap-5">
                        <ListNav
                            label="To-do lists"
                            allLabel="All to-dos"
                            lists={lists}
                            selected={selected}
                            openCount={
                                todos.filter((t) => t.completedAt === null)
                                    .length
                            }
                            onSelect={selectList}
                            onAdd={() =>
                                setEditor({ kind: "list", list: undefined })
                            }
                        />
                        <ListFilters
                            tags={tags}
                            selectedTags={selectedTags}
                            onToggleTag={toggleTag}
                            members={members}
                            person={person?.id}
                            onPerson={(id) =>
                                setSearch({
                                    person: slugify(
                                        members.find((m) => m.id === id)
                                            ?.displayName ?? ""
                                    ) || undefined,
                                })
                            }
                        />
                    </aside>

                    <div className="flex min-w-0 flex-col gap-6 lg:order-1">
                        <TodoQuickAdd
                            listId={selected?.id}
                            listName={selected?.name}
                            tags={selectedTags}
                            assigneeId={person?.id}
                        />

                        {sections.map((section) => (
                            <section
                                key={section.title}
                                className="flex flex-col gap-1.5"
                            >
                                <h2
                                    className={`font-display text-h3 font-medium ${section.overdue ? "text-danger" : "text-text"}`}
                                >
                                    {section.title}
                                </h2>
                                <ul className="flex flex-col">
                                    {section.todos.map((todo, index) =>
                                        row(
                                            todo,
                                            todo.dueDate !==
                                                section.todos[index - 1]
                                                    ?.dueDate
                                        )
                                    )}
                                </ul>
                            </section>
                        ))}

                        {open.length === 0 && (
                            <p className="text-md text-text-muted">
                                {inList.length === 0
                                    ? "Nothing here yet. Add the first thing above."
                                    : done.length > 0
                                      ? "Nothing left to do here."
                                      : "Nothing matches these filters."}
                            </p>
                        )}

                        {done.length > 0 && (
                            <TodoDone
                                count={done.length}
                                open={search.done === "show"}
                                onOpenChange={(show) =>
                                    setSearch({
                                        done: show ? "show" : undefined,
                                    })
                                }
                                clearing={archiveCompleted.isPending}
                                onClear={() => void clearDone()}
                            >
                                {done.map((todo) => row(todo, false))}
                            </TodoDone>
                        )}
                    </div>
                </div>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={
                        editor.kind === "list" ? editor.list?.name : undefined
                    }
                    exiting={exiting}
                    focusField={editor.kind === "list"}
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "todo" && (
                        <TodoForm
                            key={editor.todo.id}
                            todo={editor.todo}
                            lists={lists}
                            members={members}
                            tags={everyTag}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "list" && (
                        <TodoListForm
                            key={editor.list?.id ?? "new"}
                            list={editor.list}
                            onCreated={selectList}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
