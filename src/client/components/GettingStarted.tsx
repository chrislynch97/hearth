import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import type { AppRoutePath } from "@/layout/nav-config";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonClass";
import { CheckDot } from "@/components/ui/CheckDot";

interface Step {
    key: "pots" | "payslips" | "setAsides";
    label: string;
    description: string;
    to: AppRoutePath;
    cta: string;
}

const STEPS: Step[] = [
    {
        key: "pots",
        label: "Add a pot",
        description:
            "Pots are the buckets you divide your money into — bills, groceries, savings.",
        to: "/plan",
        cta: "Add a pot",
    },
    {
        key: "payslips",
        label: "Record a payslip",
        description:
            "Enter what you're paid so Hearth knows what there is to budget each period.",
        to: "/payslips",
        cta: "Record a payslip",
    },
    {
        key: "setAsides",
        label: "Create a set-aside",
        description:
            "Set aside a regular amount into a pot so it's funded a bit each period.",
        to: "/plan",
        cta: "Set one up",
    },
];

/** First-run getting-started checklist (#62). A dismissible dashboard card that
 *  ticks off orientation steps as the household is filled in. Renders nothing
 *  once the user hides it, so it never reappears. */
export const GettingStarted = () => {
    const utils = trpc.useUtils();
    const status = trpc.onboarding.status.useQuery();
    const dismiss = trpc.onboarding.dismiss.useMutation();

    const hide = async () => {
        await dismiss.mutateAsync();
        await utils.onboarding.status.invalidate();
    };

    if (!status.data || status.data.dismissed) return null;

    const { steps } = status.data;
    const doneCount = STEPS.filter((s) => steps[s.key]).length;
    const allDone = doneCount === STEPS.length;

    return (
        <Card className="border-primary/25 bg-primary-tint-weak">
            <CardHeader>
                <CardTitle>
                    {allDone ? "You're all set" : "Getting started"}
                </CardTitle>
                <CardDescription>
                    {allDone
                        ? "You've set up the essentials. Explore the rest at your own pace."
                        : `A few things to set up first · ${doneCount} of ${STEPS.length} done`}
                </CardDescription>
                <CardAction>
                    <Button variant="ghost" compact onClick={() => void hide()}>
                        {allDone ? "Dismiss" : "Skip"}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <ul className="flex flex-col gap-3">
                    {STEPS.map((step) => {
                        const done = steps[step.key];
                        return (
                            <li
                                key={step.key}
                                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <CheckDot done={done} />
                                    <div className="min-w-0">
                                        <p
                                            className={
                                                done
                                                    ? "text-base font-semibold text-text-muted line-through"
                                                    : "text-base font-semibold text-text"
                                            }
                                        >
                                            {step.label}
                                        </p>
                                        <p className="text-sm text-text-muted">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                                {!done && (
                                    <Link
                                        to={step.to}
                                        // Under the step on a phone, lined up
                                        // with its text past the tick.
                                        className={buttonClass({
                                            variant: "outline",
                                            compact: true,
                                            className: "self-start max-sm:ml-9",
                                        })}
                                    >
                                        {step.cta}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </CardContent>
        </Card>
    );
};
