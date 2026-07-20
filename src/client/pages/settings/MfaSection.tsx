import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Code,
    CopyButton,
    Group,
    Modal,
    PasswordInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { downloadBlob } from "@/csv";

export const MfaSection = () => {
    const utils = trpc.useUtils();
    const statusQuery = trpc.auth.status.useQuery();
    const enrollMfa = trpc.auth.enrollMfa.useMutation();
    const confirmMfa = trpc.auth.confirmMfa.useMutation();
    const disableMfa = trpc.auth.disableMfa.useMutation();

    const passwordSet = statusQuery.data?.passwordSet ?? false;
    const mfaEnabled = statusQuery.data?.mfaEnabled ?? false;

    const [enroll, setEnroll] = useState<{
        secret: string;
        qrSvg: string;
    } | null>(null);
    const [code, setCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [disableOpen, setDisableOpen] = useState(false);
    const [disablePassword, setDisablePassword] = useState("");
    const [error, setError] = useState("");

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

    const finishRecovery = () => {
        setRecoveryCodes(null);
        setCode("");
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Two-factor authentication
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                An extra one-time code from an authenticator app (Google
                Authenticator, 1Password, Aegis…) on top of the password.
                Strongly recommended if this instance is reachable from the
                internet.
            </Text>

            {!passwordSet && (
                <Text size="sm" c="dimmed">
                    Set a password above first — two-factor builds on it.
                </Text>
            )}

            {/* Recovery codes, shown once after enabling. */}
            {passwordSet && recoveryCodes && (
                <Stack gap="sm">
                    <Alert
                        color="moss"
                        variant="light"
                        title="Two-factor is on — save your recovery codes"
                    >
                        Each code works once if you lose access to your
                        authenticator. Store them somewhere safe; you won&apos;t
                        see them again.
                    </Alert>
                    <SimpleGrid cols={2} spacing="xs">
                        {recoveryCodes.map((c) => (
                            <Code key={c} fz="sm" p={6}>
                                {c}
                            </Code>
                        ))}
                    </SimpleGrid>
                    <Group justify="flex-end" gap="sm">
                        <CopyButton value={recoveryCodes.join("\n")}>
                            {({ copied, copy }) => (
                                <Button variant="default" onClick={copy}>
                                    {copied ? "Copied" : "Copy codes"}
                                </Button>
                            )}
                        </CopyButton>
                        <Button
                            variant="default"
                            onClick={() =>
                                downloadBlob(
                                    "hearth-recovery-codes.txt",
                                    new Blob(
                                        [recoveryCodes.join("\n") + "\n"],
                                        {
                                            type: "text/plain",
                                        }
                                    )
                                )
                            }
                        >
                            Download
                        </Button>
                        <Button onClick={finishRecovery}>
                            I&apos;ve saved these
                        </Button>
                    </Group>
                </Stack>
            )}

            {/* Enrolment: QR + manual secret + confirmation code. */}
            {passwordSet && !recoveryCodes && enroll && (
                <Stack gap="sm">
                    <Text size="sm">
                        Scan this with your authenticator app, then enter the
                        6-digit code it shows.
                    </Text>
                    <Text size="sm" c="dimmed">
                        Turning this on signs you out on every other device, so
                        anyone already signed in as you is locked out too.
                        You&apos;ll stay signed in here.
                    </Text>
                    <Group align="flex-start" gap="lg">
                        {/* Render the server-generated SVG as an image (a data URI) rather than
                            injecting raw HTML, so it can't introduce markup into the page. */}
                        <img
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(enroll.qrSvg)}`}
                            alt="Two-factor authentication QR code"
                            width={200}
                            height={200}
                            style={{ flexShrink: 0 }}
                        />
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <Text size="xs" c="dimmed">
                                Can&apos;t scan? Enter this key manually:
                            </Text>
                            <Group gap="xs">
                                <Code fz="sm">{enroll.secret}</Code>
                                <CopyButton value={enroll.secret}>
                                    {({ copied, copy }) => (
                                        <Button
                                            size="compact-xs"
                                            variant="subtle"
                                            onClick={copy}
                                        >
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                    )}
                                </CopyButton>
                            </Group>
                            <TextInput
                                label="Verification code"
                                value={code}
                                onChange={(e) => setCode(e.currentTarget.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" && void handleConfirm()
                                }
                                inputMode="numeric"
                                maw={160}
                                autoFocus
                            />
                        </Stack>
                    </Group>
                    {error && (
                        <Alert color="red" title="Error">
                            {error}
                        </Alert>
                    )}
                    <Group justify="flex-end" gap="sm">
                        <Button
                            variant="default"
                            onClick={() => {
                                setEnroll(null);
                                setError("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            loading={confirmMfa.isPending}
                            onClick={() => void handleConfirm()}
                        >
                            Verify &amp; enable
                        </Button>
                    </Group>
                </Stack>
            )}

            {/* Steady state: on/off toggle. */}
            {passwordSet && !recoveryCodes && !enroll && (
                <Group justify="space-between">
                    <Text size="sm">
                        {mfaEnabled
                            ? "Two-factor authentication is on."
                            : "Two-factor authentication is off."}
                    </Text>
                    {mfaEnabled ? (
                        <Button
                            variant="light"
                            color="red"
                            onClick={() => setDisableOpen(true)}
                        >
                            Disable
                        </Button>
                    ) : (
                        <Button
                            loading={enrollMfa.isPending}
                            onClick={() => void handleEnable()}
                        >
                            Enable two-factor
                        </Button>
                    )}
                </Group>
            )}

            {passwordSet && !recoveryCodes && !enroll && error && (
                <Alert color="red" title="Error" mt="sm">
                    {error}
                </Alert>
            )}

            <Modal
                opened={disableOpen}
                onClose={() => setDisableOpen(false)}
                title="Disable two-factor?"
                size="sm"
            >
                <Stack gap="md">
                    <Text size="sm">
                        Enter your password to turn off two-factor
                        authentication.
                    </Text>
                    <PasswordInput
                        label="Password"
                        value={disablePassword}
                        onChange={(e) =>
                            setDisablePassword(e.currentTarget.value)
                        }
                        onKeyDown={(e) =>
                            e.key === "Enter" && void handleDisable()
                        }
                        autoFocus
                    />
                    {error && (
                        <Alert color="red" title="Error">
                            {error}
                        </Alert>
                    )}
                    <Group justify="flex-end" gap="sm">
                        <Button
                            variant="default"
                            onClick={() => setDisableOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={disableMfa.isPending}
                            onClick={() => void handleDisable()}
                        >
                            Disable
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
