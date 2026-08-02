import { useEffect, useState } from "react";
import {
    Alert,
    Anchor,
    Button,
    PasswordInput,
    Text,
    TextInput,
} from "@mantine/core";
import { trpc } from "./trpc";
import { AuthCard } from "./AuthCard";
import {
    MIN_PASSWORD_LENGTH,
    validatePassword,
} from "../shared/password-policy";
import { DATA_NOTICE_TEXT, DATA_NOTICE_URL } from "@shared/data-notice";

/** Shown at /invite#<token> — lets an invitee create their account and join. */
export function AcceptInvite({ token }: { token: string }) {
    // `invitations.info` is a read declared as a mutation so the token goes in the
    // POST body rather than a logged URL (#176) — hence a manual fire on mount
    // instead of useQuery. `mutate` is referentially stable, so this runs once.
    const info = trpc.invitations.info.useMutation();
    const accept = trpc.invitations.accept.useMutation();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");

    const loadInfo = info.mutate;
    useEffect(() => {
        loadInfo({ token });
    }, [loadInfo, token]);

    // Idle counts as loading: the mutation hasn't fired yet on the first render,
    // and a "not valid" alert there would be wrong.
    const checking = info.isIdle || info.isPending;
    // Only asked for when this instance requires an address and the invite didn't
    // already carry one (#199) — otherwise joining a household is how an account
    // ends up with no recovery route at all.
    const needsEmail = info.data?.needsEmail ?? false;

    async function submit() {
        setError("");
        const weak = validatePassword(password);
        if (weak) return setError(weak);
        if (!username.trim() || !displayName.trim())
            return setError("Fill in your name and a username.");
        if (needsEmail && !email.trim())
            return setError("Enter an email address.");
        try {
            await accept.mutateAsync({
                token,
                username: username.trim(),
                displayName: displayName.trim(),
                password,
                email: email.trim() || null,
            });
            window.location.href = "/";
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not accept the invitation."
            );
        }
    }

    return (
        <AuthCard>
            {checking ? (
                <Text size="sm" c="dimmed" ta="center">
                    Checking your invitation…
                </Text>
            ) : !info.data ? (
                <Alert color="red" title="Invitation not valid">
                    This invite link is invalid, already used, or expired. Ask
                    whoever invited you for a fresh one.
                </Alert>
            ) : (
                <>
                    <Text size="sm" c="dimmed" ta="center">
                        You&apos;ve been invited to join{" "}
                        <b>{info.data.householdName}</b> as {info.data.role}.
                        Create an account to continue.
                    </Text>
                    <TextInput
                        label="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.currentTarget.value)}
                        autoFocus
                    />
                    <TextInput
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.currentTarget.value)}
                        autoComplete="username"
                    />
                    {needsEmail && (
                        <TextInput
                            label="Email"
                            description="Where a password-reset link would go. We'll send a confirmation link to check it's yours."
                            value={email}
                            onChange={(e) => setEmail(e.currentTarget.value)}
                            type="email"
                            autoComplete="email"
                        />
                    )}
                    <PasswordInput
                        label="Password"
                        description={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && void submit()}
                        autoComplete="new-password"
                    />
                    {error && (
                        <Alert color="red" title="Error">
                            {error}
                        </Alert>
                    )}
                    {/* Mail is optional, so this screen — not the invite email —
                        is the copy every invitee sees before joining (#229). */}
                    <Text size="xs" c="dimmed">
                        <b>Before you accept:</b> {DATA_NOTICE_TEXT}{" "}
                        <Anchor
                            href={DATA_NOTICE_URL}
                            target="_blank"
                            rel="noreferrer"
                            inherit
                        >
                            What happens to your data here
                        </Anchor>
                        .
                    </Text>
                    <Button
                        onClick={() => void submit()}
                        loading={accept.isPending}
                        fullWidth
                    >
                        Join {info.data.householdName}
                    </Button>
                </>
            )}
        </AuthCard>
    );
}
