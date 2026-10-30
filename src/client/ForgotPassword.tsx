import { useState } from "react";
import { AuthCard } from "@/AuthCard";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { trpc } from "@/trpc";

export interface ForgotPasswordProps {
    onBack: () => void;
}

/** The "email me a reset link" step of the login screen.
 *
 *  The server answers identically whether or not the account exists, so this
 *  screen can only ever say "if there's an account, we've sent a link" — telling
 *  the person more would tell an attacker the same thing. */
export const ForgotPassword = ({ onBack }: ForgotPasswordProps) => {
    const request = trpc.auth.requestPasswordReset.useMutation();
    const [username, setUsername] = useState("");

    const submit = async () => {
        // A failure here is a transport problem, not an answer about the
        // account; the confirmation below is shown either way.
        await request
            .mutateAsync({ username: username.trim() })
            .catch(() => {});
    };

    const back = (
        <Button variant="link" className="self-center" onClick={onBack}>
            Back to sign in
        </Button>
    );

    if (request.isSuccess || request.isError) {
        return (
            <AuthCard>
                <Notice tone="positive" title="Check your email">
                    If that account exists and has a confirmed email address, a
                    reset link is on its way. It expires in an hour.
                </Notice>
                {back}
            </AuthCard>
        );
    }

    return (
        <AuthCard lead="Enter your username and we'll email a reset link to the address on your account.">
            <AuthForm onSubmit={() => void submit()}>
                <TextField
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    autoComplete="username"
                    autoFocus
                />
                <Button
                    type="submit"
                    variant="solid"
                    className="w-full"
                    disabled={request.isPending || !username.trim()}
                >
                    Email me a link
                </Button>
            </AuthForm>
            {back}
        </AuthCard>
    );
};
