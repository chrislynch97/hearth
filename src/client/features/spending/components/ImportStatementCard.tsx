import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Notice } from "@/components/ui/Notice";
import type { ImportProfile } from "../importModel";

export interface ImportStatementCardProps {
    profiles: ImportProfile[];
    members: Array<{ id: string; displayName: string }>;
    source: string | null;
    ownerId: string | null;
    filename?: string;
    error?: string;
    onSource: (source: string) => void;
    onOwner: (ownerId: string) => void;
    onFile: (file: File) => void;
}

/** Whose statement it is, and the file itself. */
export const ImportStatementCard = ({
    profiles,
    members,
    source,
    ownerId,
    filename,
    error,
    onSource,
    onOwner,
    onFile,
}: ImportStatementCardProps) => {
    const profile = profiles.find((p) => p.id === source);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Bank statement</CardTitle>
                {profile && (
                    <CardDescription>{profile.instructions}</CardDescription>
                )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <ChoiceField
                        label="Bank"
                        options={profiles.map((p) => ({
                            value: p.id,
                            label: p.label,
                        }))}
                        value={source}
                        onChange={onSource}
                    />
                    <ChoiceField
                        label="Whose account"
                        options={members.map((m) => ({
                            value: m.id,
                            label: m.displayName,
                        }))}
                        value={ownerId}
                        onChange={onOwner}
                    />
                </div>
                <FileDropzone
                    label="Choose CSV file"
                    accept="text/csv,.csv"
                    filename={filename}
                    onFile={onFile}
                />
                {error && (
                    <Notice tone="danger" title="Couldn't read that file">
                        {error}
                    </Notice>
                )}
            </CardContent>
        </Card>
    );
};
