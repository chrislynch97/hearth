import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { Separator } from "@/components/shadcn/separator";
import { Button } from "@/components/ui/Button";
import { msToLocalIso } from "./util";

export interface PendingInvitesProps {
    canEmail: boolean;
    /** The id being resent, so only its button shows as busy. */
    resendingId: string | null;
    onResend: (id: string, email: string) => void;
}

/** Invitations sent but not yet accepted, each with a way to resend or revoke. */
export const PendingInvites = ({
    canEmail,
    resendingId,
    onResend,
}: PendingInvitesProps) => {
    const utils = trpc.useUtils();
    const invites = trpc.invitations.list.useQuery();
    const revoke = trpc.invitations.revoke.useMutation();
    const fmt = useFormatDate();

    const rows = invites.data ?? [];
    if (rows.length === 0) return null;

    return (
        <>
            <Separator />
            <div>
                <h3 className="mb-2 text-md font-semibold text-text">
                    Pending invitations
                </h3>
                <ul className="flex flex-col divide-y divide-border">
                    {rows.map((inv) => (
                        <li
                            key={inv.id}
                            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-base text-text">
                                    {inv.email ?? "Invite link"}
                                </p>
                                <p className="text-sm text-text-muted">
                                    {inv.role}
                                    {inv.memberName
                                        ? ` · links to ${inv.memberName}`
                                        : ""}{" "}
                                    · expires{" "}
                                    {fmt(msToLocalIso(inv.expiresAt.getTime()))}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                {canEmail && inv.email && (
                                    <Button
                                        variant="ghost"
                                        compact
                                        title="Emails a new link — the previous one stops working."
                                        disabled={resendingId === inv.id}
                                        onClick={() =>
                                            inv.email &&
                                            onResend(inv.id, inv.email)
                                        }
                                    >
                                        Resend
                                    </Button>
                                )}
                                <Button
                                    variant="danger"
                                    compact
                                    disabled={revoke.isPending}
                                    onClick={async () => {
                                        await revoke.mutateAsync({
                                            id: inv.id,
                                        });
                                        await utils.invitations.list.invalidate();
                                    }}
                                >
                                    Revoke
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};
