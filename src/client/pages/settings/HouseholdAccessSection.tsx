import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Code,
    CopyButton,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { inviteLink } from "@/inviteLink";
import { useFormatDate } from "@/useMoney";
import { AccessList } from "./AccessList";
import { msToLocalIso } from "./util";

export const HouseholdAccessSection = () => {
    const utils = trpc.useUtils();
    const me = trpc.users.me.useQuery();
    const fmt = useFormatDate();
    const switchHousehold = trpc.users.switchHousehold.useMutation();

    const role = me.data?.role ?? null;
    const isAdmin = role === "admin" || role === "owner";
    const isOwner = role === "owner";
    const memberships = me.data?.memberships ?? [];

    const invites = trpc.invitations.list.useQuery(undefined, {
        enabled: isAdmin,
    });
    const membersQuery = trpc.members.list.useQuery(undefined, {
        enabled: isAdmin,
    });
    const createInvite = trpc.invitations.create.useMutation();
    const resend = trpc.invitations.resend.useMutation();
    const revoke = trpc.invitations.revoke.useMutation();

    const [inviteRole, setInviteRole] = useState("member");
    const [inviteMemberId, setInviteMemberId] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [link, setLink] = useState("");
    const [emailedTo, setEmailedTo] = useState("");
    const [resent, setResent] = useState(false);
    const [error, setError] = useState("");

    // Only offer to send the invite when this instance can actually send mail
    // (#111); otherwise the address is just a label on the pending-invite list.
    const canEmail = trpc.email.status.useQuery().data?.enabled ?? false;

    if (!me.data) return null;

    const handleSwitch = async (householdId: string) => {
        if (householdId === me.data?.activeHouseholdId) return;
        await switchHousehold.mutateAsync({ householdId });
        // Active household changed — everything is scoped to it, so refetch all.
        await utils.invalidate();
        window.location.reload();
    };

    const handleCreateInvite = async () => {
        setError("");
        try {
            const res = await createInvite.mutateAsync({
                role: inviteRole as "admin" | "member" | "viewer",
                email: inviteEmail.trim() || null,
                memberId: inviteMemberId,
            });
            setLink(inviteLink(window.location.origin, res.token));
            setEmailedTo(res.emailed ? inviteEmail.trim() : "");
            setResent(false);
            setInviteMemberId(null);
            setInviteEmail("");
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
    const handleResend = async (id: string, email: string) => {
        setError("");
        try {
            const res = await resend.mutateAsync({ id });
            setLink(inviteLink(window.location.origin, res.token));
            setEmailedTo(res.emailed ? email : "");
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

    const inviteRoleOptions = [
        { value: "viewer", label: "Viewer (read-only)" },
        { value: "member", label: "Member (can edit)" },
        ...(isOwner
            ? [{ value: "admin", label: "Admin (can manage & invite)" }]
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

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Households &amp; access
            </Title>
            <Stack gap="sm">
                {memberships.length > 1 && (
                    <Select
                        label="Active household"
                        description="Switch which household you're viewing."
                        data={memberships.map((m) => ({
                            value: m.householdId,
                            label: `${m.householdName} · ${m.role}`,
                        }))}
                        value={me.data.activeHouseholdId}
                        onChange={(v) => v && void handleSwitch(v)}
                        allowDeselect={false}
                    />
                )}

                {!isAdmin && (
                    <Text size="sm" c="dimmed">
                        You&apos;re a {role} of this household. Ask an admin to
                        invite others.
                    </Text>
                )}

                {isAdmin && (
                    <>
                        <AccessList isOwner={isOwner} />
                        <Divider label="Invite someone" labelPosition="left" />
                        <Group align="flex-end">
                            <Select
                                label="Role"
                                data={inviteRoleOptions}
                                value={inviteRole}
                                onChange={(v) => setInviteRole(v ?? "member")}
                                allowDeselect={false}
                                w={220}
                            />
                            {canEmail && (
                                <TextInput
                                    label="Email"
                                    description="Optional — we'll send them the link."
                                    placeholder="them@example.com"
                                    value={inviteEmail}
                                    onChange={(e) =>
                                        setInviteEmail(e.currentTarget.value)
                                    }
                                    type="email"
                                    w={240}
                                />
                            )}
                            {memberOptions.length > 0 && (
                                <Select
                                    label="Link to member"
                                    description="Optional — auto-links their account on acceptance."
                                    placeholder="No one"
                                    data={memberOptions}
                                    value={inviteMemberId}
                                    onChange={setInviteMemberId}
                                    clearable
                                    w={220}
                                />
                            )}
                            <Button
                                onClick={() => void handleCreateInvite()}
                                loading={createInvite.isPending}
                            >
                                {canEmail && inviteEmail.trim()
                                    ? "Send invite"
                                    : "Create invite link"}
                            </Button>
                        </Group>
                        {error && (
                            <Alert color="red" title="Error">
                                {error}
                            </Alert>
                        )}
                        {link && (
                            <Alert
                                color="moss"
                                variant="light"
                                title={
                                    emailedTo
                                        ? `Invite ${resent ? "re-sent" : "sent"} to ${emailedTo}`
                                        : "Invite link — share it with the person you're inviting"
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Code
                                        fz="xs"
                                        style={{ overflowX: "auto", flex: 1 }}
                                    >
                                        {link}
                                    </Code>
                                    <CopyButton value={link}>
                                        {({ copied, copy }) => (
                                            <Button
                                                size="compact-sm"
                                                variant="default"
                                                onClick={copy}
                                            >
                                                {copied ? "Copied" : "Copy"}
                                            </Button>
                                        )}
                                    </CopyButton>
                                </Group>
                                <Text size="xs" c="dimmed" mt={4}>
                                    {emailedTo
                                        ? "Here's the same link, in case it doesn't arrive. It works once and expires in 7 days."
                                        : "The link works once and expires in 7 days."}
                                    {resent &&
                                        " Any earlier link for this invitation has stopped working."}
                                </Text>
                            </Alert>
                        )}

                        {(invites.data?.length ?? 0) > 0 && (
                            <>
                                <Divider
                                    label="Pending invitations"
                                    labelPosition="left"
                                />
                                <Stack gap={4}>
                                    {invites.data?.map((inv) => {
                                        const email = inv.email;
                                        return (
                                            <Group
                                                key={inv.id}
                                                justify="space-between"
                                                px="xs"
                                                py={4}
                                            >
                                                <Text size="sm">
                                                    {email ?? "Invite link"}{" "}
                                                    <Text
                                                        span
                                                        size="xs"
                                                        c="dimmed"
                                                    >
                                                        · {inv.role}
                                                        {inv.memberName
                                                            ? ` · links to ${inv.memberName}`
                                                            : ""}{" "}
                                                        · expires{" "}
                                                        {fmt(
                                                            msToLocalIso(
                                                                inv.expiresAt.getTime()
                                                            )
                                                        )}
                                                    </Text>
                                                </Text>
                                                <Group gap={6} wrap="nowrap">
                                                    {canEmail && email && (
                                                        <Tooltip
                                                            label="Emails a new link — the previous one stops working."
                                                            multiline
                                                            w={240}
                                                            withArrow
                                                        >
                                                            <Button
                                                                size="compact-xs"
                                                                variant="subtle"
                                                                loading={
                                                                    resend.isPending &&
                                                                    resend
                                                                        .variables
                                                                        ?.id ===
                                                                        inv.id
                                                                }
                                                                onClick={() =>
                                                                    void handleResend(
                                                                        inv.id,
                                                                        email
                                                                    )
                                                                }
                                                            >
                                                                Resend
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                    <Button
                                                        size="compact-xs"
                                                        variant="subtle"
                                                        color="red"
                                                        loading={
                                                            revoke.isPending
                                                        }
                                                        onClick={async () => {
                                                            await revoke.mutateAsync(
                                                                { id: inv.id }
                                                            );
                                                            await utils.invitations.list.invalidate();
                                                        }}
                                                    >
                                                        Revoke
                                                    </Button>
                                                </Group>
                                            </Group>
                                        );
                                    })}
                                </Stack>
                            </>
                        )}
                    </>
                )}
            </Stack>
        </Card>
    );
};
