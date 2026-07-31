import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useEmailConfirmation } from "@/useEmailConfirmation";
import { ConfirmEmailChange } from "./ConfirmEmailChange";
import { EmailVerification } from "./EmailVerification";

interface AccountForm {
    username: string;
    displayName: string;
    email: string;
}

export const AccountSection = () => {
    const utils = trpc.useUtils();
    const me = trpc.users.me.useQuery();
    const status = trpc.auth.status.useQuery();
    const update = trpc.users.updateProfile.useMutation();
    const confirmation = useEmailConfirmation();

    // One derived form object (see GeneralSection) — no per-field copy line.
    const [edits, setForm] = useState<AccountForm | null>(null);
    const [currentPassword, setCurrentPassword] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState<"save" | "send" | null>(null);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    const d = me.data;
    const form =
        edits ??
        (d
            ? {
                  username: d.username,
                  displayName: d.displayName,
                  email: d.email ?? "",
              }
            : null);

    const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
        setForm(form ? { ...form, [key]: value } : form);

    if (!form) return null;

    // The server requires the current password to change the username or the email
    // (#50) — both are identity-bearing, so a stolen session must not be able to
    // move them. Mirror that condition here so the field only appears when it will
    // actually be asked for, rather than on every cosmetic edit.
    const changesUsername =
        form.username.trim().toLowerCase() !== (me.data?.username ?? "");
    const changesEmail =
        (form.email.trim() || null) !== (me.data?.email ?? null);
    const needsPassword =
        Boolean(status.data?.passwordSet) && (changesUsername || changesEmail);

    // Password reset only ever mails a *confirmed* address, so on an instance
    // that can send mail the field is worth more than a note to yourself — and on
    // a hosted one it's the only recovery route there is, so it can't be cleared.
    const emailDescription = status.data?.emailRequired
        ? "Required on this instance — it's the only way to recover your account if you lose your password."
        : status.data?.passwordResetAvailable
          ? "Used for invitations, and to reset your password if you lose it."
          : "Optional — only used for invitations on this instance.";

    // Moving the address drops its confirmed state, so warn before saving (#198).
    // Nothing to warn about on an instance that can't send the link anyway, or
    // when the address is being cleared rather than moved.
    const newEmail = form.email.trim();
    const confirmsEmailChange =
        confirmation.enabled && changesEmail && newEmail !== "";

    const handleSave = async (sendConfirmation = false) => {
        if (!form) return;
        setError("");
        setPending(sendConfirmation ? "send" : "save");
        try {
            await update.mutateAsync({
                username: form.username.trim(),
                displayName: form.displayName.trim(),
                email: newEmail || null,
                currentPassword: needsPassword ? currentPassword : undefined,
            });
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save your profile."
            );
            setPending(null);
            setConfirming(false);
            return;
        }
        // Saved. A failed send is reported by the verification card below rather
        // than as a save error — the profile change did land.
        if (sendConfirmation) await confirmation.send(newEmail);
        await Promise.all([
            utils.users.me.invalidate(),
            utils.auth.status.invalidate(),
            // A changed address goes back to unconfirmed (#111), so the
            // verification card has to re-read its state.
            utils.email.status.invalidate(),
        ]);
        setCurrentPassword("");
        setPending(null);
        setConfirming(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Your account
            </Title>
            <Stack gap="sm">
                <Group grow>
                    <TextInput
                        label="Name"
                        value={form.displayName}
                        onChange={(e) =>
                            set("displayName", e.currentTarget.value)
                        }
                    />
                    <TextInput
                        label="Username"
                        value={form.username}
                        onChange={(e) => set("username", e.currentTarget.value)}
                    />
                </Group>
                <TextInput
                    label="Email"
                    description={emailDescription}
                    value={form.email}
                    onChange={(e) => set("email", e.currentTarget.value)}
                    type="email"
                />
                <EmailVerification confirmation={confirmation} />
                {needsPassword && (
                    <PasswordInput
                        label="Current password"
                        description="Changing your username or email needs your password, so a stolen session can’t take the account over."
                        value={currentPassword}
                        onChange={(e) =>
                            setCurrentPassword(e.currentTarget.value)
                        }
                    />
                )}
                {error && (
                    <Alert color="red" title="Error">
                        {error}
                    </Alert>
                )}
                <Group justify="flex-end">
                    {saved && (
                        <Text size="sm" c="dimmed">
                            Saved ✓
                        </Text>
                    )}
                    <Button
                        onClick={() => {
                            if (confirmsEmailChange) setConfirming(true);
                            else void handleSave();
                        }}
                        loading={update.isPending && !confirming}
                        disabled={needsPassword && !currentPassword}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
            <ConfirmEmailChange
                opened={confirming}
                email={newEmail}
                pending={pending}
                onCancel={() => setConfirming(false)}
                onConfirm={(send) => void handleSave(send)}
            />
        </Card>
    );
};
