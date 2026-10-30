import { useState } from "react";
import { trpc } from "@/trpc";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { PasswordField } from "@/components/ui/PasswordField";
import { MfaEnrolment } from "./MfaEnrolment";
import { RecoveryCodes } from "./RecoveryCodes";

export const MfaSection = () => {
    const utils = trpc.useUtils();
    const statusQuery = trpc.auth.status.useQuery();
    const enrollMfa = trpc.auth.enrollMfa.useMutation();
    const confirmMfa = trpc.auth.confirmMfa.useMutation();
    const disableMfa = trpc.auth.disableMfa.useMutation();

    const [enroll, setEnroll] = useState<{
        secret: string;
        qrSvg: string;
    } | null>(null);
    const [code, setCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [disableOpen, setDisableOpen] = useState(false);
    const [disablePassword, setDisablePassword] = useState("");
    const [error, setError] = useState("");

    const passwordSet = statusQuery.data?.passwordSet ?? false;
    const mfaEnabled = statusQuery.data?.mfaEnabled ?? false;

    const handleEnable = async () => {
        setError("");
        try {
            const result = await enrollMfa.mutateAsync();
            setEnroll({ secret: result.secret, qrSvg: result.qrSvg });
            setCode("");
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not start enrolment."
            );
        }
    };

    const handleConfirm = async () => {
        setError("");
        try {
            const result = await confirmMfa.mutateAsync({ code: code.trim() });
            setRecoveryCodes(result.recoveryCodes);
            setEnroll(null);
            // Enabling MFA revokes every other session (#50), so the sessions list is
            // now stale as well as the auth status.
            await Promise.all([
                utils.auth.status.invalidate(),
                utils.sessions.list.invalidate(),
            ]);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not verify the code."
            );
        }
    };

    const handleDisable = async () => {
        setError("");
        try {
            await disableMfa.mutateAsync({ currentPassword: disablePassword });
            setDisableOpen(false);
            setDisablePassword("");
            await utils.auth.status.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not disable two-factor."
            );
        }
    };

    return (
        <SettingsSection
            title="Two-factor"
            description="A one-time code from an authenticator app (1Password, Aegis, Google Authenticator…) on top of your password. Strongly recommended if this instance is reachable from the internet."
        >
            {!passwordSet && (
                <p className="text-base text-text-muted">
                    Set a password above first — two-factor builds on it.
                </p>
            )}

            {passwordSet && recoveryCodes && (
                <RecoveryCodes
                    codes={recoveryCodes}
                    onDone={() => {
                        setRecoveryCodes(null);
                        setCode("");
                    }}
                />
            )}

            {passwordSet && !recoveryCodes && enroll && (
                <MfaEnrolment
                    secret={enroll.secret}
                    qrSvg={enroll.qrSvg}
                    code={code}
                    onCodeChange={setCode}
                    error={error}
                    pending={confirmMfa.isPending}
                    onConfirm={() => void handleConfirm()}
                    onCancel={() => {
                        setEnroll(null);
                        setError("");
                    }}
                />
            )}

            {passwordSet && !recoveryCodes && !enroll && (
                <>
                    <SettingsRow
                        title={
                            <span className="flex items-center gap-2">
                                Authenticator app
                                <Badge
                                    variant={mfaEnabled ? "tint" : "secondary"}
                                >
                                    {mfaEnabled ? "On" : "Off"}
                                </Badge>
                            </span>
                        }
                        description={
                            mfaEnabled
                                ? "You'll be asked for a code whenever you sign in."
                                : "Only your password protects this account."
                        }
                    >
                        {mfaEnabled ? (
                            <Button
                                variant="danger"
                                onClick={() => {
                                    setError("");
                                    setDisableOpen(true);
                                }}
                            >
                                Disable
                            </Button>
                        ) : (
                            <Button
                                variant="solid"
                                disabled={enrollMfa.isPending}
                                onClick={() => void handleEnable()}
                            >
                                Enable two-factor
                            </Button>
                        )}
                    </SettingsRow>
                    {error && !disableOpen && (
                        <Notice tone="danger" title={error} />
                    )}
                </>
            )}

            <ConfirmDialog
                open={disableOpen}
                onOpenChange={setDisableOpen}
                title="Disable two-factor?"
                description="Enter your password to turn off two-factor authentication."
                tone="danger"
                confirm={{
                    label: "Disable",
                    onClick: () => void handleDisable(),
                    pending: disableMfa.isPending,
                    disabled: !disablePassword,
                }}
            >
                <PasswordField
                    label="Password"
                    autoComplete="current-password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleDisable()}
                    autoFocus
                />
                {error && <Notice tone="danger" title={error} />}
            </ConfirmDialog>
        </SettingsSection>
    );
};
