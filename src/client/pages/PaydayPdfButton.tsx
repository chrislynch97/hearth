import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { downloadBlob } from "@/csv";
import { trpc } from "@/trpc";

/** Downloads the payday sheet: the funding plan as a one-page PDF to read
 *  through before payday, built fresh on the server each time. */
export const PaydayPdfButton = () => {
    const utils = trpc.useUtils();
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);

    const download = async () => {
        setPending(true);
        setFailed(false);
        try {
            // staleTime 0: the sheet is stamped with when it was made, so never reuse one.
            const { filename, base64 } = await utils.plan.paydayPdf.fetch(undefined, { staleTime: 0 });
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        } catch {
            setFailed(true);
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex items-center gap-3">
            {failed && <span className="text-xs text-danger">Couldn't make the PDF. Try again.</span>}
            <Button onClick={() => void download()} disabled={pending}>
                {pending ? "Making PDF…" : "Export PDF"}
            </Button>
        </div>
    );
};
