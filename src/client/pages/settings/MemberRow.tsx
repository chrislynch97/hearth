import { useState } from "react";
import { Pencil } from "lucide-react";
import { PersonAvatar } from "@/layout/PersonAvatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { MemberEditDialog, type MemberEdit } from "./MemberEditDialog";

export interface MemberRowProps {
    member: MemberEdit & { id: string; kind: string };
    /** Accounts this member can be linked to; absent when the viewer can't. */
    accounts?: Array<{ value: string; label: string }>;
    onSave: (edit: MemberEdit) => Promise<void>;
    onArchive: () => Promise<void>;
}

/** One person (or the joint "member") in the household, with an Edit that opens
 *  their name, colour and login in a dialog. */
export const MemberRow = ({
    member,
    accounts,
    onSave,
    onArchive,
}: MemberRowProps) => {
    const [editing, setEditing] = useState(false);

    const person = member.kind === "person";
    const account = accounts?.find((a) => a.value === member.userId)?.label;
    const caption = !person
        ? "Shared bills and pots"
        : member.userId
          ? account
              ? `Signs in as ${account}`
              : "Has an account"
          : "No account";

    return (
        <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <PersonAvatar
                name={member.displayName}
                color={member.color}
                size={36}
            />
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-md font-semibold text-text">
                    <span className="truncate">{member.displayName}</span>
                    {!person && <Badge variant="secondary">Joint</Badge>}
                </p>
                <p className="truncate text-sm text-text-muted">{caption}</p>
            </div>
            <Button
                variant="outline"
                compact
                icon={<Pencil />}
                aria-label={`Edit ${member.displayName}`}
                onClick={() => setEditing(true)}
            >
                Edit
            </Button>
            {editing && (
                <MemberEditDialog
                    member={member}
                    accounts={accounts}
                    open
                    onOpenChange={setEditing}
                    onSave={onSave}
                    onArchive={onArchive}
                />
            )}
        </li>
    );
};
