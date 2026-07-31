import { useState } from "react";
import { trpc } from "@/trpc";

export interface EmailConfirmation {
    /** This instance can send mail at all — nothing below is worth showing
     *  without it, since there would be no way to confirm anything. */
    enabled: boolean;
    email: string | null;
    verified: boolean;
    /** This instance requires accounts to carry an address (#199). */
    required: boolean;
    /** Address the last successful send went to; drives the "check your inbox"
     *  note. Empty until something has actually been sent. */
    sentTo: string;
    error: string;
    sending: boolean;
    send: (to?: string) => Promise<boolean>;
}

/** The account's email confirmation state plus the send that changes it (#111).
 *  One hook so the settings card, the confirm-on-save dialog and the reminder
 *  banner (#198) all read the same status and report the same outcome. */
export const useEmailConfirmation = (): EmailConfirmation => {
    const status = trpc.email.status.useQuery();
    const sendVerification = trpc.email.sendVerification.useMutation();

    const [sentTo, setSentTo] = useState("");
    const [error, setError] = useState("");

    // `to` only names the address in the confirmation note — the server always
    // mails whatever is on the account. Callers pass it when they've just
    // changed the address and the cached status hasn't caught up yet.
    const send = async (to?: string) => {
        setError("");
        try {
            await sendVerification.mutateAsync();
            setSentTo(to ?? status.data?.email ?? "");
            return true;
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not send the confirmation email."
            );
            return false;
        }
    };

    return {
        enabled: status.data?.enabled ?? false,
        email: status.data?.email ?? null,
        verified: status.data?.verified ?? false,
        required: status.data?.required ?? false,
        sentTo,
        error,
        sending: sendVerification.isPending,
        send,
    };
};
