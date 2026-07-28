import { useEffect } from "react";
import { Alert, Anchor, Button, Loader, Text } from "@mantine/core";
import { trpc } from "@/trpc";
import { AuthCard } from "@/AuthCard";

export interface VerifyEmailProps {
    token: string;
}

/** Shown at `/verify-email#<token>` — claims the token and reports the result.
 *  Reached from an email, so often in a browser with no session; the token is
 *  the whole proof, so no login is required either way. */
export const VerifyEmail = ({ token }: VerifyEmailProps) => {
    const verify = trpc.email.verify.useMutation();

    // A mutation, not a query, so the token travels in the POST body rather than
    // a logged URL (#176) — hence a manual fire on mount. `mutate` is
    // referentially stable, so this runs once.
    const claim = verify.mutate;
    useEffect(() => {
        claim({ token });
    }, [claim, token]);

    return (
        <AuthCard w={400}>
            {verify.isIdle || verify.isPending ? (
                <>
                    <Loader size="sm" mx="auto" />
                    <Text size="sm" c="dimmed" ta="center">
                        Confirming your address…
                    </Text>
                </>
            ) : verify.isError ? (
                <Alert color="red" title="Link not valid">
                    {verify.error.message}
                </Alert>
            ) : (
                <Alert color="moss" variant="light" title="Address confirmed">
                    <Text size="sm">
                        <b>{verify.data?.email}</b> is confirmed. You can now
                        use it to reset your password if you ever lose it.
                    </Text>
                </Alert>
            )}
            <Button component="a" href="/" variant="default" fullWidth>
                Go to Hearth
            </Button>
            {verify.isError && (
                <Text size="xs" c="dimmed" ta="center">
                    Sign in and ask for a new link from{" "}
                    <Anchor href="/settings/account" size="xs">
                        Settings → Account
                    </Anchor>
                    .
                </Text>
            )}
        </AuthCard>
    );
};
