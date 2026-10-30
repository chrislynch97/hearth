import { useState } from "react";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { AuthCard } from "@/AuthCard";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PasswordField } from "@/components/ui/PasswordField";
import { trpc } from "@/trpc";

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
                <Notice tone="positive" title="Password changed">
                    Sign in with your new password. Every other device has been
                    signed out.
                </Notice>
                <Button asChild variant="solid" className="w-full">
                    <a href="/">Sign in</a>
                </Button>
            </AuthCard>
        );
    }

    return (
        <AuthCard lead="Choose a new password for your Hearth account.">
            <AuthForm onSubmit={() => void submit()}>
                <PasswordField
                    label="New password"
                    description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    autoComplete="new-password"
                    autoFocus
                />
                <PasswordField
                    label="Confirm new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.currentTarget.value)}
                    error={error || undefined}
                    autoComplete="new-password"
                />
                <Button
                    type="submit"
                    variant="solid"
                    className="w-full"
                    disabled={reset.isPending}
                >
                    Set new password
                </Button>
            </AuthForm>
        </AuthCard>
    );
};
