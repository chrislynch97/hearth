import { useState } from "react";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { AuthCard } from "@/AuthCard";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";
import { ForgotPassword } from "@/ForgotPassword";
import { trpc } from "@/trpc";

/** Shown when the instance is locked and this session isn't authenticated. Also
 *  offers self-registration when the instance has open registration enabled. */
export const LoginGate = () => {
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
    // asks for one up front (#199). A LAN install doesn't show the field at all.
    const emailRequired = status.data?.emailRequired ?? false;

    const switchTo = (next: typeof mode) => {
        setMode(next);
        setError("");
    };

    const submit = async () => {
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
    };

    const submitRegister = async () => {
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
    };

    if (mode === "forgot") {
        return <ForgotPassword onBack={() => switchTo("login")} />;
    }

    if (mode === "register") {
        return (
            <AuthCard lead="Create your account and household.">
                <AuthForm onSubmit={() => void submitRegister()}>
                    <TextField
                        label="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.currentTarget.value)}
                        autoComplete="name"
                        autoFocus
                    />
                    <TextField
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.currentTarget.value)}
                        autoComplete="username"
                    />
                    {emailRequired && (
                        <TextField
                            label="Email"
                            description="Where a password-reset link would go. We'll send a confirmation link to check it's yours."
                            value={email}
                            onChange={(e) => setEmail(e.currentTarget.value)}
                            type="email"
                            autoComplete="email"
                        />
                    )}
                    <TextField
                        label="Household name"
                        description="Your new household — you'll be its owner."
                        value={householdName}
                        onChange={(e) =>
                            setHouseholdName(e.currentTarget.value)
                        }
                    />
                    <PasswordField
                        label="Password"
                        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        error={error || undefined}
                        autoComplete="new-password"
                    />
                    <Button
                        type="submit"
                        variant="solid"
                        className="w-full"
                        disabled={register.isPending}
                    >
                        Create account
                    </Button>
                </AuthForm>
                <p className="text-center text-base text-text-muted">
                    Already have an account?{" "}
                    <Button variant="link" onClick={() => switchTo("login")}>
                        Sign in
                    </Button>
                </p>
            </AuthCard>
        );
    }

    if (mfaRequired) {
        return (
            <AuthCard lead="Enter the code from your authenticator app.">
                <AuthForm onSubmit={() => void submit()}>
                    <TextField
                        label="Authentication code"
                        description="6-digit code, or one of your recovery codes"
                        value={code}
                        onChange={(e) => setCode(e.currentTarget.value)}
                        error={error || undefined}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                    />
                    <Button
                        type="submit"
                        variant="solid"
                        className="w-full"
                        disabled={login.isPending}
                    >
                        Unlock
                    </Button>
                </AuthForm>
            </AuthCard>
        );
    }

    return (
        <AuthCard lead="Sign in to your household.">
            <AuthForm onSubmit={() => void submit()}>
                <TextField
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    autoComplete="username"
                    autoFocus
                />
                <PasswordField
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    error={error || undefined}
                    autoComplete="current-password"
                />
                <Button
                    type="submit"
                    variant="solid"
                    className="w-full"
                    disabled={login.isPending}
                >
                    Unlock
                </Button>
            </AuthForm>
            {canReset && (
                <Button
                    variant="link"
                    className="self-center"
                    onClick={() => switchTo("forgot")}
                >
                    Forgot your password?
                </Button>
            )}
            {canRegister && (
                <p className="text-center text-base text-text-muted">
                    New here?{" "}
                    <Button variant="link" onClick={() => switchTo("register")}>
                        Create an account
                    </Button>
                </p>
            )}
        </AuthCard>
    );
};
