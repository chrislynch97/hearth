import { useState } from "react";
import { CalendarCheck, CalendarClock, TriangleAlert } from "lucide-react";
import { todayIso } from "@shared/dates";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { ArchivedGroup } from "@/components/ui/ArchivedGroup";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { RecordRow } from "@/components/ui/RecordRow";
import { Spinner } from "@/components/ui/Spinner";
import { MaintenanceDoneForm } from "@/features/maintenance/components/MaintenanceDoneForm";
import { MaintenanceHistory } from "@/features/maintenance/components/MaintenanceHistory";
import { MaintenanceJobForm } from "@/features/maintenance/components/MaintenanceJobForm";
import { MaintenanceJobs } from "@/features/maintenance/components/MaintenanceJobs";
import { MaintenanceRecent } from "@/features/maintenance/components/MaintenanceRecent";
import { MaintenanceStarters } from "@/features/maintenance/components/MaintenanceStarters";
import {
    groupJobs,
    type MaintenanceJobWithLog,
    type MaintenanceLogRow,
} from "@/features/maintenance/model";

type Editor =
    | { kind: "add" }
    | { kind: "edit"; job: MaintenanceJobWithLog }
    | { kind: "done"; job: MaintenanceJobWithLog }
    | { kind: "entry"; job: MaintenanceJobWithLog; entry: MaintenanceLogRow };

const editorTitle = (editor: Editor): string => {
    switch (editor.kind) {
        case "add":
            return "New job";
        case "edit":
            return "Edit job";
        case "done":
            return "Mark done";
        case "entry":
            return "Edit entry";
    }
};

/** The house's recurring jobs, by how soon they're due, with what upkeep has
 *  cost alongside. */
export const MaintenancePage = () => {
    const jobsQuery = trpc.maintenance.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const pushConfig = trpc.notifications.config.useQuery();
    const formatDate = useFormatDate();

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);

    const jobs = jobsQuery.data ?? [];
    const today = todayIso();
    const groups = groupJobs(jobs, today);
    const members = membersQuery.data ?? [];
    const persons = members.filter(
        (m) => m.kind === "person" && m.archivedAt === null
    );
    const personName = (id: string | null) =>
        members.find((m) => m.id === id && m.kind === "person")?.displayName ??
        null;

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };
    const edit = (job: MaintenanceJobWithLog) =>
        setEditor({ kind: "edit", job });
    const done = (job: MaintenanceJobWithLog) =>
        setEditor({ kind: "done", job });

    const bands = [
        {
            key: "overdue",
            title: "Overdue",
            icon: <TriangleAlert />,
            jobs: groups.overdue,
        },
        {
            key: "soon",
            title: "Due soon",
            icon: <CalendarClock />,
            jobs: groups.soon,
        },
        {
            key: "later",
            title: "Later",
            icon: <CalendarCheck />,
            jobs: groups.later,
        },
    ].filter((band) => band.jobs.length > 0);

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-6 text-base">
            <PageHeader
                title="Maintenance"
                description="The jobs that only come round once a year, on a schedule so they still happen."
                actions={
                    <Button
                        icon={<PlusIcon />}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => setEditor({ kind: "add" })}
                    >
                        Add job
                    </Button>
                }
            />

            {jobsQuery.isLoading && <Spinner label="Loading maintenance" />}

            {!jobsQuery.isLoading && jobs.length === 0 && (
                <MaintenanceStarters />
            )}

            {jobs.length > 0 && (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
                    <div className="flex min-w-0 flex-col gap-6">
                        {bands.map((band) => (
                            <MaintenanceJobs
                                key={band.key}
                                title={band.title}
                                icon={band.icon}
                                jobs={band.jobs}
                                today={today}
                                personName={personName}
                                onEdit={edit}
                                onDone={done}
                            />
                        ))}
                        {bands.length === 0 && (
                            <p className="text-base text-text-muted">
                                Everything’s archived. Add a job to start the
                                list again.
                            </p>
                        )}
                        {groups.archived.length > 0 && (
                            <ArchivedGroup count={groups.archived.length}>
                                {groups.archived.map((job) => (
                                    <RecordRow
                                        key={job.id}
                                        title={job.name}
                                        details={
                                            job.log[0]
                                                ? `Last done ${formatDate(job.log[0].doneOn)}`
                                                : "Never done"
                                        }
                                        value=""
                                        onClick={() => edit(job)}
                                    />
                                ))}
                            </ArchivedGroup>
                        )}
                    </div>

                    <MaintenanceRecent jobs={jobs} today={today} />
                </div>
            )}

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={
                        editor.kind === "add" ? undefined : editor.job.name
                    }
                    exiting={exiting}
                    focusField={editor.kind === "add" || editor.kind === "done"}
                    onExited={finishClose}
                    onClose={close}
                >
                    {(editor.kind === "add" || editor.kind === "edit") && (
                        <MaintenanceJobForm
                            job={
                                editor.kind === "edit" ? editor.job : undefined
                            }
                            persons={persons}
                            canRemind={pushConfig.data?.enabled ?? false}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "edit" && editor.job.log.length > 0 && (
                        <MaintenanceHistory
                            log={editor.job.log}
                            personName={personName}
                            onPick={(entry) =>
                                setEditor({
                                    kind: "entry",
                                    job: editor.job,
                                    entry,
                                })
                            }
                        />
                    )}
                    {(editor.kind === "done" || editor.kind === "entry") && (
                        <MaintenanceDoneForm
                            key={
                                editor.kind === "entry"
                                    ? editor.entry.id
                                    : "done"
                            }
                            job={editor.job}
                            entry={
                                editor.kind === "entry"
                                    ? editor.entry
                                    : undefined
                            }
                            persons={persons}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
