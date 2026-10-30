import { useState } from "react";
import { trpc } from "@/trpc";
import { Separator } from "@/components/shadcn/separator";
import { Button } from "@/components/ui/Button";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { TextField } from "@/components/ui/TextField";
import type { MemberEdit } from "./MemberEditDialog";
import { MemberRow } from "./MemberRow";

/** The people money is planned around — distinct from the logins with access,
 *  though an admin can link the two. */
export const MembersSection = () => {
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const addPerson = trpc.members.addPerson.useMutation();
    const updateMember = trpc.members.update.useMutation();
    const archive = trpc.members.archive.useMutation();
    const linkUser = trpc.members.linkUser.useMutation();
    const me = trpc.users.me.useQuery();

    const isAdmin = me.data?.role === "admin" || me.data?.role === "owner";
    // Accounts to map members onto (admin-only endpoint).
    const accounts = trpc.access.list.useQuery(undefined, { enabled: isAdmin });

    const [newName, setNewName] = useState("");

    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const accountOptions = (accounts.data ?? []).map((a) => ({
        value: a.userId,
        label: `${a.displayName} (@${a.username})`,
    }));

    const refresh = async () => {
        await Promise.all([
            utils.members.list.invalidate(),
            utils.bootstrap.context.invalidate(),
            utils.users.me.invalidate(),
            // Colours and names show up on the Overview's charts.
            utils.dashboard.summary.invalidate(),
        ]);
    };

    const save = async (id: string, edit: MemberEdit) => {
        const target = members.find((m) => m.id === id);
        if (!target) return;
        if (
            edit.displayName !== target.displayName ||
            (edit.color && edit.color !== target.color)
        ) {
            await updateMember.mutateAsync({
                id,
                expectedUpdatedAt: target.updatedAt,
                displayName: edit.displayName,
                ...(edit.color ? { color: edit.color } : {}),
            });
        }
        if (edit.userId !== target.userId) {
            await linkUser.mutateAsync({ memberId: id, userId: edit.userId });
        }
        await refresh();
    };

    const handleAdd = async () => {
        if (!newName.trim()) return;
        await addPerson.mutateAsync({ displayName: newName.trim() });
        await refresh();
        setNewName("");
    };

    return (
        <SettingsSection
            title="Members"
            description="The people money is planned around. Each person's colour is used for them in charts."
        >
            <ul className="flex flex-col divide-y divide-border">
                {members.map((m) => (
                    <MemberRow
                        key={m.id}
                        member={m}
                        accounts={isAdmin ? accountOptions : undefined}
                        onSave={(edit) => save(m.id, edit)}
                        onArchive={async () => {
                            await archive.mutateAsync({ id: m.id });
                            await refresh();
                        }}
                    />
                ))}
            </ul>
            <Separator />
            <div className="flex items-end gap-2">
                <TextField
                    label="Add person"
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
                    className="flex-1"
                />
                <Button
                    variant="outline"
                    disabled={addPerson.isPending || !newName.trim()}
                    onClick={() => void handleAdd()}
                >
                    Add
                </Button>
            </div>
        </SettingsSection>
    );
};
