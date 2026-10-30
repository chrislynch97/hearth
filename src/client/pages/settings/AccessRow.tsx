import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { PersonAvatar } from "@/layout/PersonAvatar";

export type AccessRole = "owner" | "admin" | "member" | "viewer";

export interface AccessRowProps {
    person: {
        displayName: string;
        username: string;
        role: string;
        mfaEnabled: boolean;
        isYou: boolean;
    };
    /** The viewer may change this person's role and access. */
    canManage: boolean;
    roleOptions: Array<{ value: AccessRole; label: string }>;
    onRole: (role: AccessRole) => void;
    onSignOut: () => void;
    onResetPassword: () => void;
    onRemove: () => void;
}

/** One login with access to the household, and what an admin can do about it. */
export const AccessRow = ({
    person,
    canManage,
    roleOptions,
    onRole,
    onSignOut,
    onResetPassword,
    onRemove,
}: AccessRowProps) => (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
            <PersonAvatar name={person.displayName} size={32} />
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-md font-semibold text-text">
                    <span className="truncate">{person.displayName}</span>
                    {person.isYou && <Badge variant="tint">You</Badge>}
                    {person.mfaEnabled && (
                        <Badge variant="secondary">2FA on</Badge>
                    )}
                </p>
                <p className="truncate text-sm text-text-muted">
                    @{person.username} · {person.role}
                </p>
            </div>
        </div>
        {canManage ? (
            // Four controls don't fit beside a name on a phone, so they drop
            // under it and wrap rather than clipping the last one out of reach.
            <div className="flex flex-wrap items-center gap-1 md:justify-end">
                <ChoiceField
                    label={`Role for ${person.displayName}`}
                    hideLabel
                    options={roleOptions}
                    value={person.role as AccessRole}
                    onChange={(role) => role !== person.role && onRole(role)}
                    className="w-32"
                />
                <Button variant="ghost" compact onClick={onSignOut}>
                    Sign out
                </Button>
                <Button variant="ghost" compact onClick={onResetPassword}>
                    Reset password
                </Button>
                <Button variant="danger" compact onClick={onRemove}>
                    Remove
                </Button>
            </div>
        ) : (
            !person.isYou && (
                <span className="text-sm text-text-muted">Owner-managed</span>
            )
        )}
    </li>
);
