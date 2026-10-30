import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { ImportReview } from "@/features/spending/components/ImportReview";
import { ImportStatementCard } from "@/features/spending/components/ImportStatementCard";

/** Bring a bank statement in: pick the file, review its rows, then import. */
export const ImportPage = () => {
    const money = useMoney();
    const membersQuery = trpc.members.list.useQuery();
    const profilesQuery = trpc.imports.profiles.useQuery();
    const preview = trpc.imports.preview.useMutation();
    const [chosenOwner, setChosenOwner] = useState<string | null>(null);
    const [chosenSource, setChosenSource] = useState<string | null>(null);
    const [file, setFile] = useState<{ name: string; text: string } | null>(
        null
    );
    const [previewRun, setPreviewRun] = useState(0);
    const [result, setResult] = useState<{
        imported: number;
        skipped: number;
    } | null>(null);

    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const profiles = profilesQuery.data ?? [];
    // Both pickers sit on the first option until someone chooses another.
    const ownerId = chosenOwner ?? members[0]?.id ?? null;
    const source = chosenSource ?? profiles[0]?.id ?? null;

    const runPreview = (
        csvText: string,
        owner: string | null,
        bank: string | null
    ) => {
        if (!owner || !bank) return;
        setResult(null);
        preview.mutate(
            { ownerId: owner, csvText, source: bank },
            { onSuccess: () => setPreviewRun((run) => run + 1) }
        );
    };

    const chooseFile = async (chosen: File) => {
        const text = await chosen.text();
        setFile({ name: chosen.name, text });
        runPreview(text, ownerId, source);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Import"
                description="You'll review everything before anything is saved."
            />
            <ImportStatementCard
                profiles={profiles}
                members={members}
                source={source}
                ownerId={ownerId}
                filename={file?.name}
                error={preview.error?.message}
                onSource={(next) => {
                    setChosenSource(next);
                    if (file) runPreview(file.text, ownerId, next);
                }}
                onOwner={(next) => {
                    setChosenOwner(next);
                    if (file) runPreview(file.text, next, source);
                }}
                onFile={(chosen) => void chooseFile(chosen)}
            />
            {result && (
                <Notice
                    tone="positive"
                    title={`Imported ${result.imported} ${result.imported === 1 ? "transaction" : "transactions"}${result.skipped > 0 ? `, skipped ${result.skipped}` : ""}`}
                    action={
                        <Button asChild>
                            <Link to="/spending">Go to Spending</Link>
                        </Button>
                    }
                >
                    They&apos;re on the Spending register, ready to reconcile.
                </Notice>
            )}
            {preview.isPending && <Spinner label="Reading the statement" />}
            {preview.data && ownerId && file && !preview.isPending && (
                <ImportReview
                    key={previewRun}
                    preview={preview.data}
                    ownerId={ownerId}
                    filename={file.name}
                    money={money}
                    onImported={(imported) => {
                        setResult(imported);
                        setFile(null);
                        preview.reset();
                    }}
                />
            )}
        </div>
    );
};
