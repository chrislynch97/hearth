import type { ReactNode } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import { Button } from "@/components/ui/Button";
import { entityLabel, formatValue, type AuditChanges } from "./auditMeta";

export interface AuditChangeDetailProps {
    changes: AuditChanges;
}

const fieldLine = (name: string, value: ReactNode) => (
    <p key={name} className="text-sm">
        <span className="font-medium text-text">{entityLabel(name)}:</span>{" "}
        {value}
    </p>
);

/** The readable body of one audit entry: a field-by-field diff for updates, the
 *  curated details of a security event, and a collapsed snapshot for
 *  create/archive/delete. */
export const AuditChangeDetail = ({ changes }: AuditChangeDetailProps) => {
    if (!changes) {
        return <p className="text-sm text-text-muted">No details recorded.</p>;
    }

    if (changes.kind === "update") {
        const fields = Object.entries(changes.fields);
        if (fields.length === 0) {
            return (
                <p className="text-sm text-text-muted">No fields changed.</p>
            );
        }
        return (
            <div className="flex flex-col gap-0.5">
                {fields.map(([name, { before, after }]) =>
                    fieldLine(
                        name,
                        <>
                            <span className="text-text-muted line-through">
                                {formatValue(before)}
                            </span>{" "}
                            →{" "}
                            <span className="text-text">
                                {formatValue(after)}
                            </span>
                        </>
                    )
                )}
            </div>
        );
    }

    // Never a raw row, so shown inline rather than collapsed.
    if (changes.kind === "event") {
        const details = Object.entries(changes.details ?? {});
        if (details.length === 0) {
            return (
                <p className="text-sm text-text-muted">No further details.</p>
            );
        }
        return (
            <div className="flex flex-col gap-0.5">
                {details.map(([name, value]) =>
                    fieldLine(
                        name,
                        <span className="text-text">{formatValue(value)}</span>
                    )
                )}
            </div>
        );
    }

    // A whole-row snapshot, collapsed by default since it can be wide.
    const snapshot = changes.kind === "create" ? changes.after : changes.before;
    const entries = Object.entries(snapshot);
    return (
        <Collapsible className="group/details flex flex-col gap-0.5">
            <CollapsibleTrigger asChild>
                <Button variant="link" className="self-start text-sm">
                    <span className="group-data-[state=open]/details:hidden">
                        Show details ({entries.length} fields)
                    </span>
                    <span className="hidden group-data-[state=open]/details:inline">
                        Hide details
                    </span>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-0.5">
                {entries.map(([name, value]) =>
                    fieldLine(
                        name,
                        <span className="break-all text-text">
                            {formatValue(value)}
                        </span>
                    )
                )}
            </CollapsibleContent>
        </Collapsible>
    );
};
