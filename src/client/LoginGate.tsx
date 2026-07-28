import { useState } from "react";
import { Anchor, Button, PasswordInput, Text, TextInput } from "@mantine/core";
import { trpc } from "./trpc";
import { AuthCard } from "./AuthCard";
import { ForgotPassword } from "./ForgotPassword";
import {
    MIN_PASSWORD_LENGTH,
    validatePassword,
} from "../shared/password-policy";

/** Shown when the instance is locked and this session isn't authenticated. Also
 *  offers self-registration when the instance has open registration enabled. */
export function LoginGate() {
    const utils = trpc.useUtils();
    const login = trpc.auth.login.useMutation();
    const register = trpc.auth.register.useMutation();
    const regOpen = trpc.auth.registrationOpen.useQuery();
    const status = trpc.auth.status.useQuery();

    const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [householdName, setHouseholdName] = useState("");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [mfaRequired, setMfaRequired] = useState(false);
    const [error, setError] = useState("");

    const canRegister = regOpen.data?.allowOpenRegistration ?? false;
    // Only offered when the instance can send mail (#111); self-host without a
    // relay resets the owner password from the CLI instead.
    const canReset = status.data?.passwordResetAvailable ?? false;
    // A hosted instance can't recover an addressless account by any route, so it
    // asks for one up front (#199). A LAN install doesn't, and doesn't show the
    // field at all — the owner resets from a shell there.
    const emailRequired = status.data?.emailRequired ?? false;

    async function submit() {
        setError("");
        try {
            const result = await login.mutateAsync({
                username: username.trim(),
                password,
                code: mfaRequired ? code : undefined,
            });
            if (result.ok) {
                await utils.invalidate();
                return;
            }
            // Password accepted; server now wants the second factor.
            setMfaRequired(true);
        } catch {
            if (mfaRequired) {
                setError("Incorrect code");
                setCode("");
            } else {
                setError("Incorrect username or password");
                setPassword("");
            }
        }
    }

    async function submitRegister() {
        setError("");
        if (emailRequired && !email.trim()) {
            return setError("Enter an email address.");
        }
        const weak = validatePassword(password);
        if (weak) return setError(weak);
        try {
            await register.mutateAsync({
                username: username.trim(),
                displayName: displayName.trim(),
                password,
                householdName: householdName.trim(),
                email: email.trim() || null,
            });
            await utils.invalidate();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not create your account."
            );
        }
    }

    return (
        <AuthCard w={360}>
            {mode !== "forgot" && (
                <Text size="sm" c="dimmed" ta="center">
                    {mode === "register"
                        ? "Create your account and household."
                        : mfaRequired
                          ? "Enter the code from your authenticator app."
                          : "Sign in to your household."}
                </Text>
            )}

            {mode === "forgot" ? (
                <ForgotPassword onBack={() => setMode("login")} />
            ) : mode === "register" ? (
                <>
                    <TextInput
                        label="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.currentTarget.value)}
                        autoComplete="name"
                        autoFocus
                    />
                    <TextInput
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.currentTarget.value)}
                        autoComplete="username"
                    />
                    {emailRequired && (
                        <TextInput
                            label="Email"
                            description="Where a password-reset link would go. We'll send a confirmation link to check it's yours."
                            value={email}
                            onChange={(e) => setEmail(e.currentTarget.value)}
                            type="email"
                            autoComplete="email"
                        />
                    )}
                    <TextInput
                        label="Household name"
                        description="Your new household — you'll be its owner."
                        value={householdName}
                        onChange={(e) =>
                            setHouseholdName(e.currentTarget.value)
                        }
                    />
                    <PasswordInput
                        label="Password"
                        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        onKeyDown={(e) =>
                            e.key === "Enter" && void submitRegister()
                        }
                        error={error || undefined}
                        autoComplete="new-password"
                    />
                    <Button
                        onClick={() => void submitRegister()}
                        loading={register.isPending}
                        fullWidth
                    >
                        Create account
                    </Button>
                    <Text size="xs" c="dimmed" ta="center">
                        Already have an account?{" "}
                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            onClick={() => {
                                setMode("login");
                                setError("");
                            }}
                        >
                            Sign in
                        </Anchor>
                    </Text>
                </>
            ) : mfaRequired ? (
                <>
                    <TextInput
                        label="Authentication code"
                        description="6-digit code, or one of your recovery codes"
                        value={code}
                        onChange={(e) => setCode(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && void submit()}
                        error={error || undefined}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                    />
                    <Button
                        onClick={() => void submit()}
                        loading={login.isPending}
                        fullWidth
                    >
                        Unlock
                    </Button>
                </>
            ) : (
                <>
                    <TextInput
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && void submit()}
                        autoComplete="username"
                        autoFocus
                    />
                    <PasswordInput
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && void submit()}
                        error={error || undefined}
                        autoComplete="current-password"
                    />
                    <Button
                        onClick={() => void submit()}
                        loading={login.isPending}
                        fullWidth
                    >
                        Unlock
                    </Button>
                    {canReset && (
                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            ta="center"
                            onClick={() => {
                                setMode("forgot");
                                setError("");
                            }}
                        >
                            Forgot your password?
                        </Anchor>
                    )}
                    {canRegister && (
                        <Text size="xs" c="dimmed" ta="center">
                            New here?{" "}
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                onClick={() => {
                                    setMode("register");
                                    setError("");
                                }}
                            >
                                Create an account
                            </Anchor>
                        </Text>
                    )}
                </>
            )}
        </AuthCard>
    );
}
