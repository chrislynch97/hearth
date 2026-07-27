import { useState } from "react";
import { Alert, Anchor, Button, Text, TextInput } from "@mantine/core";
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

    if (request.isSuccess || request.isError) {
        return (
            <>
                <Alert color="moss" variant="light" title="Check your email">
                    <Text size="sm">
                        If that account exists and has a confirmed email
                        address, a reset link is on its way. It expires in an
                        hour.
                    </Text>
                </Alert>
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    ta="center"
                    onClick={onBack}
                >
                    Back to sign in
                </Anchor>
            </>
        );
    }

    return (
        <>
            <Text size="sm" c="dimmed" ta="center">
                Enter your username and we&apos;ll email a reset link to the
                address on your account.
            </Text>
            <TextInput
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                autoComplete="username"
                autoFocus
            />
            <Button
                onClick={() => void submit()}
                loading={request.isPending}
                disabled={!username.trim()}
                fullWidth
            >
                Email me a link
            </Button>
            <Anchor
                component="button"
                type="button"
                size="xs"
                ta="center"
                onClick={onBack}
            >
                Back to sign in
            </Anchor>
        </>
    );
};
