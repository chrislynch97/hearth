import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Spinner } from "@/components/ui/Spinner";

/** Turn a raw user-agent into something a person can recognise their own device
 *  by. Deliberately crude: this only has to be good enough to tell "the laptop I
 *  am on" from "something I don't recognise", and a full UA parser would be a
 *  dependency and a maintenance burden for a label. Unknown agents fall back to
 *  the raw string rather than a confident-sounding guess. */
const describeUserAgent = (ua: string | null): string => {
    if (!ua) return "Unknown device";
    const browser = /Edg\//.test(ua)
        ? "Edge"
        : /OPR\//.test(ua)
          ? "Opera"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : null;
    const os = /Windows/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad|iOS/.test(ua)
            ? "iOS"
            : /Mac OS X/.test(ua)
              ? "macOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
    if (!browser && !os) return ua.slice(0, 60);
    return [browser, os].filter(Boolean).join(" on ");
};

const isPhone = (ua: string | null) => !!ua && /Android|iPhone|iPad/.test(ua);

export const SessionsSection = () => {
    const utils = trpc.useUtils();
    const sessions = trpc.sessions.list.useQuery();
    const revoke = trpc.sessions.revoke.useMutation();
    const revokeOthers = trpc.sessions.revokeOthers.useMutation();
    const formatDate = useFormatDate();

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const rows = sessions.data ?? [];
    const others = rows.filter((s) => !s.current).length;

    const refresh = async () => {
        await Promise.all([
            utils.sessions.list.invalidate(),
            utils.auth.status.invalidate(),
        ]);
    };

    const handleRevoke = async (ref: string) => {
        setError("");
        setMessage("");
        try {
            const res = await revoke.mutateAsync({ ref });
            // Ending the session you're on is a logout: the cookie is already
            // gone, so send the app back through the front door.
            if (res.endedCurrent) {
                window.location.assign("/");
                return;
            }
            await refresh();
            setMessage("Session ended.");
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not end that session."
            );
        }
    };

    const handleRevokeOthers = async () => {
        setError("");
        setMessage("");
        try {
            const { count } = await revokeOthers.mutateAsync();
            await refresh();
            setMessage(
                count === 0
                    ? "No other sessions to end."
                    : `Ended ${count} other session(s).`
            );
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not sign out your other sessions."
            );
        }
    };

    return (
        <SettingsSection
            title="Active sessions"
            description="Every device signed in as you. A session ends on its own after 14 days of inactivity, and after 90 days regardless. If you don’t recognise one, end it — then change your password."
        >
            {sessions.isLoading ? (
                <Spinner label="Loading sessions" />
            ) : rows.length === 0 ? (
                <p className="text-base text-text-muted">
                    No signed-in sessions. Until a password is set, this
                    instance is open on your network without one.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-border">
                    {rows.map((s) => {
                        const Icon = isPhone(s.userAgent)
                            ? Smartphone
                            : Monitor;
                        return (
                            <li
                                key={s.ref}
                                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                            >
                                <Icon
                                    size={18}
                                    strokeWidth={1.5}
                                    className="shrink-0 text-text-muted"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 text-base text-text">
                                        {describeUserAgent(s.userAgent)}
                                        {s.current && (
                                            <Badge variant="tint">
                                                This device
                                            </Badge>
                                        )}
                                    </p>
                                    <p className="text-sm text-text-muted">
                                        {s.ip ?? "Unknown address"} ·{" "}
                                        {/* en-CA renders as YYYY-MM-DD, which is
                                            what the household date formatter
                                            parses. The time matters here —
                                            "yesterday" isn't enough to
                                            recognise a session by. */}
                                        {formatDate(
                                            s.lastSeenAt.toLocaleDateString(
                                                "en-CA"
                                            )
                                        )}{" "}
                                        {s.lastSeenAt.toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                                <Button
                                    variant="danger"
                                    compact
                                    disabled={revoke.isPending}
                                    onClick={() => void handleRevoke(s.ref)}
                                >
                                    {s.current ? "Sign out" : "End"}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {error && <Notice tone="danger" title={error} />}
            {message && <Notice tone="positive" title={message} />}
            {others > 0 && (
                <div className="flex justify-end">
                    <Button
                        variant="danger"
                        disabled={revokeOthers.isPending}
                        onClick={() => void handleRevokeOthers()}
                    >
                        Sign out everywhere else
                    </Button>
                </div>
            )}
        </SettingsSection>
    );
};
