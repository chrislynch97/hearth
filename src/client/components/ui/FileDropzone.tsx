import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface FileDropzoneProps {
    /** The button's words before a file is chosen. */
    label: string;
    /** File types for the picker, as in `<input accept>`. */
    accept: string;
    /** The chosen file's name, which then takes over the button. */
    filename?: string;
    onFile: (file: File) => void;
}

/** A file picker that also takes a dropped file. The dropping is desktop-only,
 *  so a phone just sees the button. */
export const FileDropzone = ({
    label,
    accept,
    filename,
    onFile,
}: FileDropzoneProps) => {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const drop = (event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
    };

    return (
        <div
            onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 transition-colors duration-[140ms] ease-out sm:p-6 ${dragging ? "border-primary bg-primary-tint" : "border-border-strong"}`}
        >
            <input
                ref={input}
                type="file"
                accept={accept}
                className="sr-only"
                tabIndex={-1}
                aria-label={label}
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) onFile(file);
                    // So choosing the same file again still fires a change.
                    event.currentTarget.value = "";
                }}
            />
            <Button
                icon={<Upload />}
                className="max-w-full max-sm:h-9 max-sm:w-full"
                onClick={() => input.current?.click()}
            >
                <span className="truncate">{filename ?? label}</span>
            </Button>
            <span className="hidden text-sm text-text-muted sm:block">
                {filename ? "Or drop another here" : "Or drop it here"}
            </span>
        </div>
    );
};
