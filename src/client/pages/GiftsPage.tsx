import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { todayIso } from "@shared/dates";
import { trpc } from "@/trpc";
import { useMediaQuery } from "@/useMediaQuery";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { BudgetBar } from "@/features/gifts/components/BudgetBar";
import { GiftColumn } from "@/features/gifts/components/GiftColumn";
import { GiftForm } from "@/features/gifts/components/GiftForm";
import { OccasionBar } from "@/features/gifts/components/OccasionBar";
import { OccasionForm } from "@/features/gifts/components/OccasionForm";
import { PersonCard } from "@/features/gifts/components/PersonCard";
import { RecipientForm } from "@/features/gifts/components/RecipientForm";
import {
    giftsByStatus,
    pickOccasion,
    type GiftStatus,
    type OccasionSummary,
    type RecipientWithGifts,
} from "@/features/gifts/model";
import type { Gift } from "../../server/db/schema";

type Editor =
    | { kind: "occasion"; occasion: OccasionSummary | undefined }
    | { kind: "recipient"; recipient: RecipientWithGifts | undefined }
    | { kind: "gift"; gift: Gift | undefined; recipientId: string };

const editorTitle = (editor: Editor): string => {
    if (editor.kind === "occasion")
        return editor.occasion ? "Edit occasion" : "New occasion";
    if (editor.kind === "recipient")
        return editor.recipient ? "Edit person" : "New person";

    return editor.gift ? "Edit gift" : "New gift";
};

/** The form keeps its defaults from mount, so opening a different row has to
 *  remount it rather than reuse the one already on screen. */
const editorKey = (editor: Editor): string => {
    if (editor.kind === "occasion")
        return `occasion:${editor.occasion?.id ?? "new"}`;
    if (editor.kind === "recipient")
        return `recipient:${editor.recipient?.id ?? "new"}`;

    return `gift:${editor.gift?.id ?? `new:${editor.recipientId}`}`;
};

const route = getRouteApi("/gifts");

/** Below this the editor is a sheet rather than a modal. */
const MODAL_FITS = "(min-width: 640px)";

/** Presents for an occasion: who they're for, what they cost, and how much of
 *  the budget is left. Shared by the whole household. */
export const GiftsPage = () => {
    const occasionsQuery = trpc.gifts.occasions.useQuery();
    const utils = trpc.useUtils();
    const updateGift = trpc.gifts.updateGift.useMutation();

    const compact = !useMediaQuery(MODAL_FITS);

    // URL state, so a refresh or a shared link comes back to the same occasion.
    const requested = route.useSearch().occasion;
    const navigate = route.useNavigate();
    const selectOccasion = (id: string) =>
        void navigate({ search: { occasion: id }, replace: true });

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);
    // Several moves can be in flight at once; each card waits only on its own.
    const [pendingGiftIds, setPendingGiftIds] = useState<ReadonlySet<string>>(
        () => new Set()
    );

    const occasions = occasionsQuery.data ?? [];
    const selected = pickOccasion(occasions, requested, todayIso());
    const detailQuery = trpc.gifts.occasion.useQuery(
        { id: selected?.id ?? "" },
        { enabled: selected !== undefined }
    );
    const detail = detailQuery.data;
    // A new gift starts against the first person; the form picks who for.
    const firstRecipient = detail?.recipients[0];

    /** Button or drop: the card moves at once, then the save and a refetch
     *  bring the totals in. A failed save's refetch puts the card back. */
    const moveGift = async (gift: Gift, status: GiftStatus) => {
        if (!selected || gift.status === status || pendingGiftIds.has(gift.id))
            return;
        setPendingGiftIds((ids) => new Set(ids).add(gift.id));
        const key = { id: selected.id };
        await utils.gifts.occasion.cancel(key);
        utils.gifts.occasion.setData(key, (current) =>
            current
                ? {
                      ...current,
                      recipients: current.recipients.map((recipient) => ({
                          ...recipient,
                          gifts: recipient.gifts.map((g) =>
                              g.id === gift.id ? { ...g, status } : g
                          ),
                      })),
                  }
                : current
        );
        try {
            await updateGift.mutateAsync({
                id: gift.id,
                expectedUpdatedAt: gift.updatedAt,
                status,
            });
            await utils.gifts.invalidate();
        } catch {
            // surfaced by the global error handler
            await utils.gifts.invalidate();
        } finally {
            setPendingGiftIds((ids) => {
                const next = new Set(ids);
                next.delete(gift.id);
                return next;
            });
        }
    };

    const dropGift = (giftId: string, status: GiftStatus) => {
        const gift = detail?.recipients
            .flatMap((recipient) => recipient.gifts)
            .find((g) => g.id === giftId);
        if (gift) void moveGift(gift, status);
    };

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1120px] flex-col gap-5 text-base">
            <header className="border-b border-border-strong pb-5">
                <h1 className="font-display text-h1 font-medium leading-tight">
                    Gifts
                </h1>
                <p className="mt-1 text-sm text-text-muted">
                    Who you're buying for, what you've got them, and what's left
                    to spend.
                </p>
            </header>

            {occasionsQuery.isLoading && <Spinner label="Loading gifts" />}

            {!occasionsQuery.isLoading && !selected && (
                <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border-strong p-5">
                    <p className="text-sm text-text-muted">
                        Start with an occasion, like Christmas or a birthday.
                        Then add the people you're buying for.
                    </p>
                    <Button
                        icon={<PlusIcon />}
                        onClick={() =>
                            setEditor({ kind: "occasion", occasion: undefined })
                        }
                    >
                        New occasion
                    </Button>
                </div>
            )}

            {selected && (
                <>
                    <OccasionBar
                        occasions={occasions}
                        selected={selected}
                        onSelect={selectOccasion}
                        onEdit={() =>
                            setEditor({ kind: "occasion", occasion: selected })
                        }
                        onAdd={() =>
                            setEditor({ kind: "occasion", occasion: undefined })
                        }
                    />

                    {!detail ? (
                        <Spinner label="Loading the occasion" />
                    ) : (
                        <>
                            <BudgetBar
                                totals={detail.totals}
                                allocated={detail.allocated}
                            />

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                                {detail.recipients.map((recipient) => (
                                    <PersonCard
                                        key={recipient.id}
                                        recipient={recipient}
                                        onEdit={() =>
                                            setEditor({
                                                kind: "recipient",
                                                recipient,
                                            })
                                        }
                                    />
                                ))}
                                <button
                                    onClick={() =>
                                        setEditor({
                                            kind: "recipient",
                                            recipient: undefined,
                                        })
                                    }
                                    className="flex min-h-16 items-center justify-center gap-2 rounded-md border border-dashed border-border-strong font-semibold text-primary transition-colors duration-[140ms] ease-out hover:bg-hover"
                                >
                                    <PlusIcon />
                                    <span className="text-sm">Add person</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-3">
                                {giftsByStatus(detail.recipients).map(
                                    (column) => (
                                        <GiftColumn
                                            key={column.status}
                                            column={column}
                                            pendingGiftIds={pendingGiftIds}
                                            onEditGift={({ gift }) =>
                                                setEditor({
                                                    kind: "gift",
                                                    gift,
                                                    recipientId:
                                                        gift.recipientId,
                                                })
                                            }
                                            onAdvanceGift={({ gift }, status) =>
                                                void moveGift(gift, status)
                                            }
                                            onDropGift={(giftId) =>
                                                dropGift(giftId, column.status)
                                            }
                                            footer={
                                                column.status === "idea" &&
                                                (firstRecipient ? (
                                                    <Button
                                                        variant="dashed"
                                                        compact
                                                        icon={<PlusIcon />}
                                                        className="self-start"
                                                        onClick={() =>
                                                            setEditor({
                                                                kind: "gift",
                                                                gift: undefined,
                                                                recipientId:
                                                                    firstRecipient.id,
                                                            })
                                                        }
                                                    >
                                                        Add gift
                                                    </Button>
                                                ) : (
                                                    <p className="text-xs text-text-muted">
                                                        Add a person to start
                                                        their list.
                                                    </p>
                                                ))
                                            }
                                        />
                                    )
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={
                        editor.kind === "occasion" && !editor.occasion
                            ? undefined
                            : selected?.name
                    }
                    mode={compact ? "sheet" : "modal"}
                    exiting={exiting}
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "occasion" && (
                        <OccasionForm
                            key={editorKey(editor)}
                            occasion={editor.occasion}
                            occasions={occasions}
                            onCreated={selectOccasion}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "recipient" && detail && (
                        <RecipientForm
                            key={editorKey(editor)}
                            occasion={detail}
                            recipient={editor.recipient}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "gift" && (
                        <GiftForm
                            key={editorKey(editor)}
                            gift={editor.gift}
                            recipientId={editor.recipientId}
                            recipients={detail?.recipients ?? []}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
