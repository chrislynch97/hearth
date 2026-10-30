import { Badge } from "@/components/shadcn/badge";
import { AuditChangeDetail } from "./AuditChangeDetail";
import {
    ACTION_META,
    entityLabel,
    type AuditChanges,
    type AuditEntry,
} from "./auditMeta";

export interface AuditEntryRowProps {
    entry: AuditEntry;
    formatDate: (date: string) => string;
}

/** One line of the trail: what happened to what, who did it, when, and the
 *  change itself. */
export const AuditEntryRow = ({ entry, formatDate }: AuditEntryRowProps) => {
    const meta = ACTION_META[entry.action] ?? {
        tone: "secondary" as const,
        label: entry.action,
    };
    const when = entry.createdAt;

    return (
        <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant={meta.tone}>{meta.label}</Badge>
                <span className="text-base font-semibold text-text">
                    {entityLabel(entry.entityType)}
                </span>
                <span className="ml-auto text-sm text-text-muted">
                    {formatDate(when.toLocaleDateString("en-CA"))}{" "}
                    {when.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            </div>
            <p className="text-sm text-text-muted">
                by {entry.actorLabel ?? "Unknown"}
            </p>
            <AuditChangeDetail changes={entry.changes as AuditChanges} />
        </li>
    );
};
