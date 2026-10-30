import { downloadBlob } from "@/csv";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Notice } from "@/components/ui/Notice";

export interface RecoveryCodesProps {
    codes: string[];
    onDone: () => void;
}

/** The one-time recovery codes, shown once straight after two-factor goes on. */
export const RecoveryCodes = ({ codes, onDone }: RecoveryCodesProps) => (
    <>
        <Notice
            tone="positive"
            title="Two-factor is on — save your recovery codes"
        >
            Each code works once if you lose access to your authenticator. Store
            them somewhere safe; you won&apos;t see them again.
        </Notice>
        <CopyField label="Recovery codes" value={codes.join("\n")} multiline />
        <div className="flex flex-wrap justify-end gap-2">
            <Button
                onClick={() =>
                    downloadBlob(
                        "hearth-recovery-codes.txt",
                        new Blob([codes.join("\n") + "\n"], {
                            type: "text/plain",
                        })
                    )
                }
            >
                Download
            </Button>
            <Button variant="solid" onClick={onDone}>
                I&apos;ve saved these
            </Button>
        </div>
    </>
);
