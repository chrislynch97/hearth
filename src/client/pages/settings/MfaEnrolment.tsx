import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";

export interface MfaEnrolmentProps {
    secret: string;
    qrSvg: string;
    code: string;
    onCodeChange: (code: string) => void;
    error: string;
    pending: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Turning two-factor on: scan the QR (or type the key), then prove it with a
 *  code from the app. */
export const MfaEnrolment = ({
    secret,
    qrSvg,
    code,
    onCodeChange,
    error,
    pending,
    onConfirm,
    onCancel,
}: MfaEnrolmentProps) => (
    <>
        <div>
            <p className="text-base text-text">
                Scan this with your authenticator app, then enter the 6-digit
                code it shows.
            </p>
            <p className="mt-1 text-sm text-text-muted">
                Turning this on signs you out on every other device, so anyone
                already signed in as you is locked out too. You&apos;ll stay
                signed in here.
            </p>
        </div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* The server's SVG goes in as an image (a data URI) rather than raw
                HTML, so it can't introduce markup into the page. A white
                backing keeps it scannable in dark mode. */}
            <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
                alt="Two-factor authentication QR code"
                width={180}
                height={180}
                className="shrink-0 self-center rounded-md bg-white p-2 sm:self-start"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div>
                    <p className="mb-1.5 text-sm text-text-muted">
                        Can&apos;t scan? Enter this key manually:
                    </p>
                    <CopyField label="Authenticator key" value={secret} />
                </div>
                <TextField
                    label="Verification code"
                    value={code}
                    onChange={(e) => onCodeChange(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && onConfirm()}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    className="max-w-40"
                />
            </div>
        </div>
        {error && <Notice tone="danger" title={error} />}
        <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
                Cancel
            </Button>
            <Button variant="solid" disabled={pending} onClick={onConfirm}>
                Verify &amp; enable
            </Button>
        </div>
    </>
);
