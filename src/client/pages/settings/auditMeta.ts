import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

export type AuditEntry = inferRouterOutputs<AppRouter>["audit"]["list"][number];

// The parsed `changes` payload the mutation layer writes (trpc/audit.ts). Dates
// inside the snapshots/diffs arrive as ISO strings (JSON round-trip), not Date
// objects — only the row's top-level `createdAt` is a real Date.
export type Snapshot = Record<string, unknown>;
export type FieldDiff = Record<string, { before: unknown; after: unknown }>;
export type AuditChanges =
    | { kind: "create"; after: Snapshot }
    | { kind: "archive"; before: Snapshot }
    | { kind: "delete"; before: Snapshot }
    | { kind: "update"; fields: FieldDiff }
    // Security / access-control events (issue #49): no row diff, just a curated,
    // secret-free payload.
    | { kind: "event"; details: Record<string, unknown> }
    | null;

/** Green for things added or let in, apricot for anything removed or touching
 *  security, neutral for the rest. */
export type AuditTone = "tint" | "attention" | "secondary";

// Data mutations (issue #35) plus security / access-control events (issue #49).
export const ACTION_META: Record<string, { tone: AuditTone; label: string }> = {
    create: { tone: "tint", label: "Created" },
    update: { tone: "secondary", label: "Updated" },
    archive: { tone: "secondary", label: "Archived" },
    delete: { tone: "attention", label: "Deleted" },
    login: { tone: "tint", label: "Signed in" },
    login_failed: { tone: "attention", label: "Failed sign-in" },
    logout: { tone: "secondary", label: "Signed out" },
    password_changed: { tone: "attention", label: "Password changed" },
    password_removed: { tone: "attention", label: "Password removed" },
    password_reset: { tone: "attention", label: "Password reset" },
    password_reset_requested: {
        tone: "attention",
        label: "Password reset requested",
    },
    email_verification_sent: {
        tone: "secondary",
        label: "Verification email sent",
    },
    email_verified: { tone: "tint", label: "Email verified" },
    mfa_enroll_started: { tone: "secondary", label: "MFA enrolment started" },
    mfa_enabled: { tone: "tint", label: "MFA enabled" },
    mfa_disabled: { tone: "attention", label: "MFA disabled" },
    sessions_revoked: { tone: "attention", label: "Sessions revoked" },
    registration_changed: { tone: "secondary", label: "Registration setting" },
    role_changed: { tone: "secondary", label: "Role changed" },
    access_removed: { tone: "attention", label: "Access removed" },
    invite_created: { tone: "tint", label: "Invite created" },
    invite_emailed: { tone: "tint", label: "Invite emailed" },
    invite_revoked: { tone: "secondary", label: "Invite revoked" },
    invite_accepted: { tone: "tint", label: "Invite accepted" },
    household_erased: { tone: "attention", label: "Household erased" },
    account_deleted: { tone: "attention", label: "Account deleted" },
    restored_from_offsite: {
        tone: "attention",
        label: "Restored from off-site",
    },
};

/** camelCase entity type → a human "Income source" label. */
export const entityLabel = (entityType: string): string => {
    const spaced = entityType
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

/** A single stored value rendered readably: blanks, booleans and objects all get
 *  a sensible shape rather than a bare `null`/`[object Object]`. */
export const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};
