import { Alert, Anchor, Button, Group } from "@mantine/core";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";

// Dismissal is keyed on the address it was shown for, so moving to a new
// (again unconfirmed) address brings the nudge back rather than staying hidden
// on a decision made about a different address.
const DISMISS_KEY = "hearth:email-nudge-dismissed";
const NO_ADDRESS = "none";

/** Nudges an account that predates the require-an-address rule into getting a
 *  confirmed one (#199). Deliberately a prompt and not a gate: these accounts
 *  work fine today, and locking someone out of their own finances to make a
 *  recovery point would be worse than the gap it closes.
 *
 *  Only on an instance that both requires an address and can send mail — without
 *  a relay there is nothing to confirm with, and asking would be nonsense. */
export const AccountEmailBanner = () => {
    const status = trpc.email.status.useQuery();
    const send = trpc.email.sendVerification.useMutation();
    const [dismissed, setDismissed] = useState(() =>
        localStorage.getItem(DISMISS_KEY)
    );
    const [sent, setSent] = useState(false);

    const data = status.data;
    const address = data?.email ?? null;

    if (
        !data?.enabled ||
        !data.required ||
        data.verified ||
        dismissed === (address ?? NO_ADDRESS)
    ) {
        return null;
    }

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, address ?? NO_ADDRESS);
        setDismissed(address ?? NO_ADDRESS);
    };

    const confirm = async () => {
        await send.mutateAsync();
        setSent(true);
    };

    return (
        <Alert
            color="orange"
            variant="light"
            withCloseButton
            onClose={dismiss}
            title={
                address ? "Confirm your email address" : "Add an email address"
            }
            mb="lg"
        >
            <Group gap="sm">
                <span>
                    {sent
                        ? `Check ${address} for the confirmation link.`
                        : address
                          ? "Until it's confirmed, it can't reset your password if you lose it."
                          : "Without one there's no way to reset your password if you lose it."}
                </span>
                {!sent &&
                    (address ? (
                        <Button
                            size="xs"
                            loading={send.isPending}
                            onClick={() => void confirm()}
                        >
                            Send confirmation email
                        </Button>
                    ) : (
                        <Anchor component={Link} to="/settings/account">
                            Add one
                        </Anchor>
                    ))}
            </Group>
        </Alert>
    );
};
