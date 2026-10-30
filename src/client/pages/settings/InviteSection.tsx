import { useState } from "react";
import { trpc } from "@/trpc";
import { inviteLink } from "@/inviteLink";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { CopyField } from "@/components/ui/CopyField";
import { Notice } from "@/components/ui/Notice";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { TextField } from "@/components/ui/TextField";
import { PendingInvites } from "./PendingInvites";

type InviteRole = "admin" | "member" | "viewer";

// Radix Select can't hold an empty value, so "nobody" needs a stand-in.
const NO_MEMBER = "none";

export interface InviteSectionProps {
    isOwner: boolean;
}

/** Bringing someone new in: a one-use link, emailed when this instance can
 *  send mail, optionally tied to a member so their account links itself. */
export const InviteSection = ({ isOwner }: InviteSectionProps) => {
    const utils = trpc.useUtils();
    const invites = trpc.invitations.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const createInvite = trpc.invitations.create.useMutation();
    const resend = trpc.invitations.resend.useMutation();
    // Only offer to send the invite when this instance can actually send mail
    // (#111); otherwise the address is just a label on the pending-invite list.
    const canEmail = trpc.email.status.useQuery().data?.enabled ?? false;

    const [role, setRole] = useState<InviteRole>("member");
    const [memberId, setMemberId] = useState<string>(NO_MEMBER);
    const [email, setEmail] = useState("");
    const [link, setLink] = useState("");
    const [emailedTo, setEmailedTo] = useState("");
    const [resent, setResent] = useState(false);
    const [error, setError] = useState("");

    const roleOptions: Array<{ value: InviteRole; label: string }> = [
        { value: "viewer", label: "Viewer (read-only)" },
        { value: "member", label: "Member (can edit)" },
        ...(isOwner
            ? [
                  {
                      value: "admin" as const,
                      label: "Admin (can manage & invite)",
                  },
              ]
            : []),
    ];

    // Offer only unlinked, active people — and not anyone already tied to a
    // pending invite, so two open invites can't target the same member.
    const tiedMemberIds = new Set(
        (invites.data ?? []).map((inv) => inv.memberId).filter(Boolean)
    );
    const memberOptions = (membersQuery.data ?? [])
        .filter(
            (m) =>
                m.kind === "person" &&
                m.archivedAt === null &&
                m.userId === null &&
                !tiedMemberIds.has(m.id)
        )
        .map((m) => ({ value: m.id, label: m.displayName }));

    const handleCreate = async () => {
        setError("");
        try {
            const res = await createInvite.mutateAsync({
                role,
                email: email.trim() || null,
                memberId: memberId === NO_MEMBER ? null : memberId,
            });
            setLink(inviteLink(window.location.origin, res.token));
            setEmailedTo(res.emailed ? email.trim() : "");
            setResent(false);
            setMemberId(NO_MEMBER);
            setEmail("");
            await utils.invitations.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not create the invitation."
            );
        }
    };

    // Resending mints a new link (#197) — show it, since it's now the only one
    // that works and the relay may still have dropped the email.
    const handleResend = async (id: string, to: string) => {
        setError("");
        try {
            const res = await resend.mutateAsync({ id });
            setLink(inviteLink(window.location.origin, res.token));
            setEmailedTo(res.emailed ? to : "");
            setResent(true);
            if (!res.emailed) {
                setError(
                    "The email didn't send. Share the new link below instead."
                );
            }
            await utils.invitations.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not resend the invitation."
            );
        }
    };

    return (
        <SettingsSection
            title="Invite someone"
            description="Each invitation is a link that works once and expires after 7 days."
        >
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <ChoiceField
                    label="Role"
                    options={roleOptions}
                    value={role}
                    onChange={setRole}
                />
                {canEmail && (
                    <TextField
                        label="Email"
                        description="Optional — we'll send them the link."
                        placeholder="them@example.com"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.currentTarget.value)}
                    />
                )}
                {memberOptions.length > 0 && (
                    <ChoiceField
                        label="Link to member"
                        description="Optional — auto-links their account on acceptance."
                        options={[
                            { value: NO_MEMBER, label: "No one" },
                            ...memberOptions,
                        ]}
                        value={memberId}
                        onChange={setMemberId}
                    />
                )}
            </div>
            <div className="flex justify-end">
                <Button
                    variant="solid"
                    disabled={createInvite.isPending}
                    onClick={() => void handleCreate()}
                >
                    {canEmail && email.trim()
                        ? "Send invite"
                        : "Create invite link"}
                </Button>
            </div>
            {error && <Notice tone="danger" title={error} />}
            {link && (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary-tint-weak p-4">
                    <p className="text-md font-semibold text-text">
                        {emailedTo
                            ? `Invite ${resent ? "re-sent" : "sent"} to ${emailedTo}`
                            : "Invite link — share it with the person you're inviting"}
                    </p>
                    <CopyField label="Invite link" value={link} />
                    <p className="text-sm text-text-muted">
                        {emailedTo
                            ? "Here's the same link, in case it doesn't arrive. It works once and expires in 7 days."
                            : "The link works once and expires in 7 days."}
                        {resent &&
                            " Any earlier link for this invitation has stopped working."}
                    </p>
                </div>
            )}
            <PendingInvites
                canEmail={canEmail}
                resendingId={
                    resend.isPending ? (resend.variables?.id ?? null) : null
                }
                onResend={(id, to) => void handleResend(id, to)}
            />
        </SettingsSection>
    );
};
