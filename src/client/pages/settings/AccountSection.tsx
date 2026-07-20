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

    // One derived form object (see GeneralSection) — no per-field copy line.
    const [edits, setForm] = useState<AccountForm | null>(null);
    const [currentPassword, setCurrentPassword] = useState("");
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

    const handleSave = async () => {
        if (!form) return;
        setError("");
        try {
            await update.mutateAsync({
                username: form.username.trim(),
                displayName: form.displayName.trim(),
                email: form.email.trim() || null,
                currentPassword: needsPassword ? currentPassword : undefined,
            });
            await Promise.all([
                utils.users.me.invalidate(),
                utils.auth.status.invalidate(),
            ]);
            setCurrentPassword("");
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save your profile."
            );
        }
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
                    description="Optional — only used for invitations and (later) password reset."
                    value={form.email}
                    onChange={(e) => set("email", e.currentTarget.value)}
                    type="email"
                />
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
                        onClick={() => void handleSave()}
                        loading={update.isPending}
                        disabled={needsPassword && !currentPassword}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};
