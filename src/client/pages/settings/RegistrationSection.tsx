import { Card, Switch, Title } from "@mantine/core";
import { trpc } from "@/trpc";

/** Instance-wide registration toggle (System scope) — it governs the whole
 *  instance, not one household. */
export const RegistrationSection = () => {
    const utils = trpc.useUtils();
    const regOpen = trpc.auth.registrationOpen.useQuery();
    const setRegOpen = trpc.auth.setRegistrationOpen.useMutation();
    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Registration
            </Title>
            <Switch
                label="Allow anyone to register"
                description="Instance-wide: when on, the sign-in screen lets new people create their own account and household. Leave off to stay invite-only."
                checked={regOpen.data?.allowOpenRegistration ?? false}
                onChange={async (e) => {
                    await setRegOpen.mutateAsync({
                        open: e.currentTarget.checked,
                    });
                    await utils.auth.registrationOpen.invalidate();
                }}
            />
        </Card>
    );
};
