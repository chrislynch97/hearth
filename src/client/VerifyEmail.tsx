import { useEffect } from "react";
import { AuthCard } from "@/AuthCard";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { trpc } from "@/trpc";

export interface VerifyEmailProps {
    token: string;
}

/** Shown at `/verify-email#<token>` — claims the token and reports the result.
 *  Reached from an email, so often in a browser with no session; the token is
 *  the whole proof, so no login is required either way. */
export const VerifyEmail = ({ token }: VerifyEmailProps) => {
    const verify = trpc.email.verify.useMutation({
        meta: { suppressErrorToast: true },
    });

    // A mutation, not a query, so the token travels in the POST body rather than
    // a logged URL (#176) — hence a manual fire on mount. `mutate` is
    // referentially stable, so this runs once.
    const claim = verify.mutate;
    useEffect(() => {
        claim({ token });
    }, [claim, token]);

    const checking = verify.isIdle || verify.isPending;

    return (
        <AuthCard lead={checking ? "Confirming your address…" : undefined}>
            {checking ? (
                <Spinner label="Confirming your address" />
            ) : verify.isError ? (
                <Notice tone="danger" title="Link not valid">
                    {verify.error.message}
                </Notice>
            ) : (
                <Notice tone="positive" title="Address confirmed">
                    <strong className="font-semibold">
                        {verify.data?.email}
                    </strong>{" "}
                    is confirmed. You can now use it to reset your password if
                    you ever lose it.
                </Notice>
            )}
            <Button asChild className="w-full">
                <a href="/">Go to Hearth</a>
            </Button>
            {verify.isError && (
                <p className="text-center text-base text-text-muted">
                    Sign in and ask for a new link from{" "}
                    <Button asChild variant="link">
                        <a href="/settings/account">Settings → Account</a>
                    </Button>
                    .
                </p>
            )}
        </AuthCard>
    );
};
