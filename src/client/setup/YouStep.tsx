import { useState } from "react";
import {
    chosenOrBlank,
    SEEDED_OWNER_DISPLAY_NAME,
    SEEDED_OWNER_USERNAME,
    suggestUsername,
} from "@shared/setup";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { Notice } from "@/components/ui/Notice";
import { PasswordField } from "@/components/ui/PasswordField";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { StepCard } from "@/setup/StepCard";
import { trpc } from "@/trpc";

export interface YouStepProps {
    onNext: () => void;
    onBack: () => void;
}

const QUIET = { meta: { suppressErrorToast: true } };

/** Name the account you're logged in as, and give it a member to be. Everything
 *  here is also reachable from Settings later; this is the front door (#61). */
export const YouStep = ({ onNext, onBack }: YouStepProps) => {
    const utils = trpc.useUtils();
    const { data: me } = trpc.users.me.useQuery();
    const { data: members } = trpc.members.list.useQuery();
    const { data: status } = trpc.auth.status.useQuery();
    const updateProfile = trpc.users.updateProfile.useMutation(QUIET);
    const addPerson = trpc.members.addPerson.useMutation(QUIET);
    const linkUser = trpc.members.linkUser.useMutation(QUIET);
    const updateMember = trpc.members.update.useMutation(QUIET);

    const [edits, setForm] = useState<{
        displayName: string;
        username: string;
    } | null>(null);
    // A username the account holder typed is theirs to keep; until then it tracks
    // the name field, the way most sign-up forms suggest one.
    const [usernameEdited, setUsernameEdited] = useState<boolean | null>(null);
    const [currentPassword, setCurrentPassword] = useState("");
    const [error, setError] = useState("");

    const form =
        edits ??
        (me
            ? {
                  displayName: chosenOrBlank(
                      me.displayName,
                      SEEDED_OWNER_DISPLAY_NAME
                  ),
                  username: chosenOrBlank(me.username, SEEDED_OWNER_USERNAME),
              }
            : null);
    // An account already carrying a real username counts as edited from the start.
    const isUsernameEdited =
        usernameEdited ?? (me ? me.username !== SEEDED_OWNER_USERNAME : false);

    if (!form || !me) {
        return <Spinner label="Loading your account" />;
    }

    const displayName = form.displayName.trim();
    const username = form.username.trim();

    const setName = (value: string) =>
        setForm({
            displayName: value,
            username: isUsernameEdited ? form.username : suggestUsername(value),
        });

    // Renaming a username is identity-bearing, so the server wants the password when
    // one is set (#50) — which it is if FirstRunGate ran before the wizard. Mirror
    // that condition rather than letting Next fail on a password we never asked for.
    const needsPassword =
        Boolean(status?.passwordSet) && username.toLowerCase() !== me.username;

    const handleNext = async () => {
        if (!displayName) return setError("Please enter your name.");
        if (!username) return setError("Please choose a username.");
        setError("");
        try {
            await updateProfile.mutateAsync({
                displayName,
                username,
                currentPassword: needsPassword ? currentPassword : undefined,
            });

            // Re-entering the step renames the member already linked instead of
            // stacking up a second one.
            const linked = (members ?? []).find(
                (m) => m.userId === me.id && m.archivedAt === null
            );
            if (linked) {
                await updateMember.mutateAsync({ id: linked.id, displayName });
            } else {
                const created = await addPerson.mutateAsync({ displayName });
                await linkUser.mutateAsync({
                    memberId: created.id,
                    userId: me.id,
                });
            }

            await Promise.all([
                utils.users.me.invalidate(),
                utils.members.list.invalidate(),
            ]);
            onNext();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save your account."
            );
        }
    };

    const pending =
        updateProfile.isPending ||
        addPerson.isPending ||
        linkUser.isPending ||
        updateMember.isPending;

    return (
        <StepCard
            title="About you"
            description="This names the account you're signed in as, and adds you to the household as a person."
        >
            <AuthForm onSubmit={() => void handleNext()}>
                <TextField
                    label="Your name"
                    description="Shown around the app and used for your member."
                    value={form.displayName}
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Your name"
                />
                <TextField
                    label="Username"
                    description="What you sign in with."
                    value={form.username}
                    onChange={(e) => {
                        const { value } = e.currentTarget;
                        setUsernameEdited(true);
                        setForm({ ...form, username: value });
                    }}
                    placeholder="username"
                />
                {needsPassword && (
                    <PasswordField
                        label="Current password"
                        description="Changing the username you sign in with needs the password you just set."
                        value={currentPassword}
                        onChange={(e) =>
                            setCurrentPassword(e.currentTarget.value)
                        }
                    />
                )}
                {error && <Notice tone="danger" title={error} />}
                <FormFooter aside={<Button onClick={onBack}>Back</Button>}>
                    <Button
                        type="submit"
                        variant="solid"
                        disabled={
                            pending || (needsPassword && !currentPassword)
                        }
                        className="max-sm:w-full"
                    >
                        Next
                    </Button>
                </FormFooter>
            </AuthForm>
        </StepCard>
    );
};
