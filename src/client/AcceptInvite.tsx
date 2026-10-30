import { useEffect, useState } from "react";
import { DATA_NOTICE_TEXT, DATA_NOTICE_URL } from "@shared/data-notice";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { AuthCard } from "@/AuthCard";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";
import { trpc } from "@/trpc";

export interface AcceptInviteProps {
    token: string;
}

/** Shown at /invite#<token> — lets an invitee create their account and join. */
export const AcceptInvite = ({ token }: AcceptInviteProps) => {
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
    const invite = info.data;
    // Only asked for when this instance requires an address and the invite didn't
    // already carry one (#199) — otherwise joining a household is how an account
    // ends up with no recovery route at all.
    const needsEmail = invite?.needsEmail ?? false;

    const submit = async () => {
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
    };

    if (checking) {
        return <AuthCard lead="Checking your invitation…" />;
    }

    if (!invite) {
        return (
            <AuthCard>
                <Notice tone="danger" title="Invitation not valid">
                    This invite link is invalid, already used, or expired. Ask
                    whoever invited you for a fresh one.
                </Notice>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            lead={
                <>
                    You've been invited to join{" "}
                    <strong className="font-semibold text-text">
                        {invite.householdName}
                    </strong>{" "}
                    as {invite.role}. Create an account to continue.
                </>
            }
        >
            <AuthForm onSubmit={() => void submit()}>
                <TextField
                    label="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.currentTarget.value)}
                    autoFocus
                />
                <TextField
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    autoComplete="username"
                />
                {needsEmail && (
                    <TextField
                        label="Email"
                        description="Where a password-reset link would go. We'll send a confirmation link to check it's yours."
                        value={email}
                        onChange={(e) => setEmail(e.currentTarget.value)}
                        type="email"
                        autoComplete="email"
                    />
                )}
                <PasswordField
                    label="Password"
                    description={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    autoComplete="new-password"
                />
                {error && <Notice tone="danger" title={error} />}
                {/* Mail is optional, so this screen — not the invite email — is
                    the copy every invitee sees before joining (#229). */}
                <p className="text-sm text-text-muted">
                    <strong className="font-semibold text-text-secondary">
                        Before you accept:
                    </strong>{" "}
                    {DATA_NOTICE_TEXT}{" "}
                    <a
                        href={DATA_NOTICE_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                        What happens to your data here
                    </a>
                    .
                </p>
                <Button
                    type="submit"
                    variant="solid"
                    className="w-full"
                    disabled={accept.isPending}
                >
                    Join {invite.householdName}
                </Button>
            </AuthForm>
        </AuthCard>
    );
};
