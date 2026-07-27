import { useState } from "react";
import { Alert, Button, PasswordInput, Text } from "@mantine/core";
import { trpc } from "@/trpc";
import { AuthCard } from "@/AuthCard";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";

export interface ResetPasswordProps {
    token: string;
}

/** Shown at `/reset-password#<token>` — sets a new password from an emailed
 *  link. Deliberately doesn't sign you in: the server revokes every session and
 *  sends you back through the login screen, so a reset can't step around MFA. */
export const ResetPassword = ({ token }: ResetPasswordProps) => {
    const reset = trpc.auth.resetPassword.useMutation();

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        const weak = validatePassword(password);
        if (weak) return setError(weak);
        if (password !== confirm) return setError("The passwords don't match.");
        try {
            await reset.mutateAsync({ token, newPassword: password });
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not reset your password."
            );
            setPassword("");
            setConfirm("");
        }
    };

    if (reset.isSuccess) {
        return (
            <AuthCard>
                <Alert color="moss" variant="light" title="Password changed">
                    <Text size="sm">
                        Sign in with your new password. Every other device has
                        been signed out.
                    </Text>
                </Alert>
                <Button component="a" href="/" fullWidth>
                    Sign in
                </Button>
            </AuthCard>
        );
    }

    return (
        <AuthCard>
            <Text size="sm" c="dimmed" ta="center">
                Choose a new password for your Hearth account.
            </Text>
            <PasswordInput
                label="New password"
                description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                autoComplete="new-password"
                autoFocus
            />
            <PasswordInput
                label="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                error={error || undefined}
                autoComplete="new-password"
            />
            <Button
                onClick={() => void submit()}
                loading={reset.isPending}
                fullWidth
            >
                Set new password
            </Button>
        </AuthCard>
    );
};
