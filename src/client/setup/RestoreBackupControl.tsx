import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/trpc";

/** Restoring a backup skips the wizard entirely. */
export const RestoreBackupControl = () => {
    const utils = trpc.useUtils();
    const importMut = trpc.data.import.useMutation({
        meta: { suppressErrorToast: true },
    });
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState("");

    const handleFile = async (file: File) => {
        setError("");
        try {
            const parsed = JSON.parse(await file.text());
            await importMut.mutateAsync(parsed);
            await utils.invalidate();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Restore failed — is this a valid Hearth backup?"
            );
        }
    };

    return (
        <div className="flex w-full flex-col gap-1 sm:items-end">
            <Button
                disabled={importMut.isPending}
                className="max-sm:w-full"
                onClick={() => fileRef.current?.click()}
            >
                Restore from backup
            </Button>
            <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void handleFile(file);
                    e.currentTarget.value = "";
                }}
            />
            {error && (
                <p className="text-xs text-danger sm:text-right">{error}</p>
            )}
        </div>
    );
};
