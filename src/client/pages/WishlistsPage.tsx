import { useEffect, useState } from "react";
import { getRouteApi, useNavigate, useParams } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { shortIdOf, slugify } from "@shared/slug";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { ListFilters } from "@/components/ui/ListFilters";
import { ListNav } from "@/components/ui/ListNav";
import { Spinner } from "@/components/ui/Spinner";
import { allTags } from "@/features/todos/model";
import { WishBought } from "@/features/wishlists/components/WishBought";
import { WishCard } from "@/features/wishlists/components/WishCard";
import { WishForm } from "@/features/wishlists/components/WishForm";
import { WishHero } from "@/features/wishlists/components/WishHero";
import { WishlistForm } from "@/features/wishlists/components/WishlistForm";
import { WishQuickAdd } from "@/features/wishlists/components/WishQuickAdd";
import {
    filterItems,
    priceTotal,
    splitItems,
    wishSections,
    wishSummary,
    type WishlistItemWithTags,
    type WishlistSummary,
} from "@/features/wishlists/model";

type Editor =
    | { kind: "item"; item: WishlistItemWithTags }
    | { kind: "list"; list: WishlistSummary | undefined };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "item") return "Edit item";

    return editor.list ? "Edit list" : "New list";
};

const route = getRouteApi("/wishlists");

/** What the household wants to buy, most wanted first, all together or one list
 *  at a time. Filters sit in the URL, and the total follows them. */
export const WishlistsPage = () => {
    const itemsQuery = trpc.wishlistItems.list.useQuery();
    const listsQuery = trpc.wishlists.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const utils = trpc.useUtils();
    const setBought = trpc.wishlistItems.setBought.useMutation();
    const money = useMoney();

    const search = route.useSearch();
    const navigate = useNavigate();
    const key = useParams({ strict: false }).list;

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);

    const items = itemsQuery.data ?? [];
    const lists = listsQuery.data ?? [];
    const everyone = membersQuery.data ?? [];
    const members = everyone.filter((member) => member.archivedAt === null);
    const selected = lists.find((list) => list.shortId === shortIdOf(key ?? ""));
    const person = members.find(
        (member) => slugify(member.displayName) === search.person
    );
    const everyTag = allTags(items);
    const selectedTags = (search.tags?.split(".") ?? []).map(
        (slug) => everyTag.find((tag) => slugify(tag) === slug) ?? slug
    );

    useEffect(() => {
        // A stale name after the short id (a rename, an old link) becomes the
        // list's current one.
        if (selected && key !== selected.slug)
            void navigate({
                to: "/wishlists/$list",
                params: { list: selected.slug },
                search: true,
                replace: true,
            });
    }, [selected, key, navigate]);

    const inList = selected
        ? items.filter((item) => item.listId === selected.id)
        : items;
    // A tag still being filtered on keeps its chip, or it could never be cleared.
    const tags = [...new Set([...allTags(inList), ...selectedTags])];
    const shown = filterItems(inList, {
        tags: selectedTags,
        person: person?.id,
    });
    const { open, bought } = splitItems(shown);
    const sections = wishSections(open);
    const total = priceTotal(open);

    const setSearch = (next: Partial<typeof search>) =>
        void navigate({
            to: ".",
            search: (current) => ({ ...current, ...next }),
            replace: true,
        });

    const selectList = (slug: string | undefined) =>
        void navigate({
            to: slug ? "/wishlists/$list" : "/wishlists",
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

    const toggle = async (item: WishlistItemWithTags) => {
        try {
            await setBought.mutateAsync({
                id: item.id,
                bought: item.boughtAt === null,
                expectedUpdatedAt: item.updatedAt,
            });
        } finally {
            // A failed tick is surfaced globally; the refetch puts the box back.
            await Promise.all([
                utils.wishlistItems.invalidate(),
                utils.wishlists.invalidate(),
            ]);
        }
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    // Every member, archived included, so an old purchase keeps its buyer.
    const memberName = (id: string | null) =>
        everyone.find((member) => member.id === id)?.displayName ?? null;

    const card = (item: WishlistItemWithTags) => (
        <WishCard
            key={item.id}
            item={item}
            wantedByName={memberName(item.wantedById)}
            boughtByName={memberName(item.boughtById)}
            listName={
                selected
                    ? null
                    : (lists.find((l) => l.id === item.listId)?.name ?? null)
            }
            pending={setBought.isPending && setBought.variables?.id === item.id}
            onToggle={() => void toggle(item)}
            onEdit={() => setEditor({ kind: "item", item })}
        />
    );

    const loading = itemsQuery.isLoading || listsQuery.isLoading;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-6 text-base">
            <WishHero
                title={selected?.name ?? "Wish lists"}
                summary={wishSummary(
                    open,
                    bought.length,
                    shown.length < inList.length
                )}
                total={total > 0 ? formatMoney(total, money) : undefined}
                onEdit={
                    selected
                        ? () => setEditor({ kind: "list", list: selected })
                        : undefined
                }
            />

            {loading && <Spinner label="Loading wish lists" />}

            {!loading && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
                    <aside className="flex flex-col gap-3 lg:order-2 lg:gap-5">
                        <ListNav
                            label="Wish lists"
                            allLabel="All wishes"
                            lists={lists}
                            selected={selected}
                            openCount={
                                items.filter((i) => i.boughtAt === null).length
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
                        <WishQuickAdd
                            listId={selected?.id}
                            listName={selected?.name}
                            tags={selectedTags}
                            wantedById={person?.id}
                        />

                        {sections.map((section) => (
                            <section
                                key={section.title}
                                className="flex flex-col gap-2"
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <h2 className="font-display text-h3 font-medium text-text">
                                        {section.title}
                                    </h2>
                                    {section.total > 0 && (
                                        <span className="tabular text-sm text-text-muted">
                                            {formatMoney(section.total, money)}
                                        </span>
                                    )}
                                </div>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2.5">
                                    {section.items.map(card)}
                                </ul>
                            </section>
                        ))}

                        {open.length === 0 && (
                            <p className="text-md text-text-muted">
                                {inList.length === 0
                                    ? "Nothing here yet. Add the first thing above."
                                    : bought.length > 0
                                      ? "Everything here has been bought."
                                      : "Nothing matches these filters."}
                            </p>
                        )}

                        {bought.length > 0 && (
                            <WishBought
                                count={bought.length}
                                open={search.bought === "show"}
                                onOpenChange={(show) =>
                                    setSearch({
                                        bought: show ? "show" : undefined,
                                    })
                                }
                            >
                                {bought.map(card)}
                            </WishBought>
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
                    {editor.kind === "item" && (
                        <WishForm
                            key={editor.item.id}
                            item={editor.item}
                            lists={lists}
                            members={everyone.filter(
                                (m) =>
                                    m.archivedAt === null ||
                                    m.id === editor.item.wantedById
                            )}
                            tags={everyTag}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "list" && (
                        <WishlistForm
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
