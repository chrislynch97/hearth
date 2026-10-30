import { useState } from "react";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { AuthCard } from "@/AuthCard";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PasswordField } from "@/components/ui/PasswordField";
import { trpc } from "@/trpc";

/** First-run recovery screen for an instance that's open (no owner password) yet
 *  exposed off-box with no `HEARTH_ALLOW_OPEN` opt-in. The server's HTTP gate 403s
 *  every protected procedure then, so setting a password here is the only way in
 *  (#34). `auth.setPassword` is allowlisted and sent unbatched (see providers.tsx),
 *  so a blocked batch can't drag it down. */
export const FirstRunGate = () => {
    const utils = trpc.useUtils();
    const setPassword = trpc.auth.setPassword.useMutation();

    const [password, setPassword_] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        const weak = validatePassword(password);
        if (weak) return setError(weak);
        if (password !== confirm) return setError("Passwords do not match.");
        try {
            // No `currentPassword`: the owner account is still password-less on first run.
            await setPassword.mutateAsync({ newPassword: password });
            // That locks the instance and logs the owner in via the session cookie,
            // so re-read everything to render the authenticated view.
            await utils.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not set your password."
            );
        }
    };

    return (
        <AuthCard lead="Set an owner password to secure this instance.">
            <Notice tone="attention" title="This instance is locked down">
                It's reachable from the network with no password set, so anyone
                who can reach this address would otherwise have full access.
                Choose an owner password to unlock it.
            </Notice>
            <AuthForm onSubmit={() => void submit()}>
                <PasswordField
                    label="Owner password"
                    description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    value={password}
                    onChange={(e) => setPassword_(e.currentTarget.value)}
                    autoComplete="new-password"
                    autoFocus
                />
                <PasswordField
                    label="Confirm password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.currentTarget.value)}
                    error={error || undefined}
                    autoComplete="new-password"
                />
                <Button
                    type="submit"
                    variant="solid"
                    className="w-full"
                    disabled={setPassword.isPending}
                >
                    Set password &amp; unlock
                </Button>
            </AuthForm>
        </AuthCard>
    );
};
