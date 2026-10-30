import { useState } from "react";
import { trpc } from "@/trpc";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { PasswordField } from "@/components/ui/PasswordField";

export const SecuritySection = () => {
    const utils = trpc.useUtils();
    const statusQuery = trpc.auth.status.useQuery();
    const setPassword = trpc.auth.setPassword.useMutation();
    const clearPassword = trpc.auth.clearPassword.useMutation();

    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const passwordSet = statusQuery.data?.passwordSet ?? false;

    const reset = () => {
        setCurrent("");
        setNext("");
        setConfirm("");
    };

    const handleSet = async () => {
        setError("");
        setMessage("");
        const weak = validatePassword(next);
        if (weak) return setError(weak);
        if (next !== confirm) return setError("Passwords do not match.");
        try {
            await setPassword.mutateAsync({
                currentPassword: current || undefined,
                newPassword: next,
            });
            await utils.auth.status.invalidate();
            setMessage(passwordSet ? "Password changed." : "Password set.");
            reset();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not update password."
            );
        }
    };

    const handleClear = async () => {
        setError("");
        setMessage("");
        try {
            await clearPassword.mutateAsync({ currentPassword: current });
            await utils.auth.status.invalidate();
            setMessage("Password removed.");
            reset();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not remove password."
            );
        }
    };

    return (
        <SettingsSection
            title="Password"
            description={
                <>
                    While it&apos;s unset the app is open on your network;
                    setting one turns on login, and anyone you invite signs in
                    with their own account. For internet exposure, also put it
                    behind a reverse proxy or Tailscale.
                </>
            }
        >
            {passwordSet && (
                <PasswordField
                    label="Current password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.currentTarget.value)}
                />
            )}
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <PasswordField
                    label={passwordSet ? "New password" : "Password"}
                    description={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    autoComplete="new-password"
                    value={next}
                    onChange={(e) => setNext(e.currentTarget.value)}
                />
                <PasswordField
                    label="Confirm"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.currentTarget.value)}
                />
            </div>
            {message && <Notice tone="positive" title={message} />}
            {error && <Notice tone="danger" title={error} />}
            <div className="flex flex-wrap justify-end gap-2">
                {passwordSet && (
                    <Button
                        variant="danger"
                        disabled={clearPassword.isPending}
                        onClick={() => void handleClear()}
                    >
                        Remove password
                    </Button>
                )}
                <Button
                    variant="solid"
                    disabled={setPassword.isPending}
                    onClick={() => void handleSet()}
                >
                    {passwordSet ? "Change password" : "Set password"}
                </Button>
            </div>
        </SettingsSection>
    );
};
