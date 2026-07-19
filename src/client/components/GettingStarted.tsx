import {
    Anchor,
    Box,
    Button,
    Card,
    Group,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { hearthTokens } from "@/theme";
import type { AppRoutePath } from "@/layout/nav-config";

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
        to: "/pots",
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
        to: "/pots",
        cta: "Set one up",
    },
];

const CheckDot = ({ done }: { done: boolean }) => (
    <Box
        style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: done ? hearthTokens.brand.moss : "transparent",
            border: done
                ? "none"
                : `2px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))`,
        }}
    >
        {done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <polyline
                    points="5,13 10,18 19,7"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        )}
    </Box>
);

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
        <Card
            padding="lg"
            radius="lg"
            style={{
                backgroundColor: `light-dark(${hearthTokens.surface.warmTint}, var(--mantine-color-dark-6))`,
                border: `1px solid ${hearthTokens.brand.moss}33`,
            }}
        >
            <Group justify="space-between" align="flex-start" mb="md">
                <Stack gap={2}>
                    <Title
                        order={3}
                        style={{
                            fontFamily: "var(--mantine-font-family-headings)",
                        }}
                    >
                        {allDone ? "You're all set" : "Getting started"}
                    </Title>
                    <Text size="sm" c="dimmed">
                        {allDone
                            ? "You've set up the essentials. Explore the rest at your own pace."
                            : `A few things to set up first · ${doneCount} of ${STEPS.length} done`}
                    </Text>
                </Stack>
                <Anchor
                    component="button"
                    type="button"
                    size="sm"
                    c="dimmed"
                    onClick={() => void hide()}
                >
                    {allDone ? "Dismiss" : "Skip"}
                </Anchor>
            </Group>

            <Stack gap="sm">
                {STEPS.map((step) => {
                    const done = steps[step.key];
                    return (
                        <Group
                            key={step.label}
                            justify="space-between"
                            align="center"
                            wrap="nowrap"
                        >
                            <Group gap="sm" align="flex-start" wrap="nowrap">
                                <CheckDot done={done} />
                                <Stack gap={0}>
                                    <Text
                                        size="sm"
                                        fw={600}
                                        td={done ? "line-through" : undefined}
                                        c={done ? "dimmed" : undefined}
                                    >
                                        {step.label}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {step.description}
                                    </Text>
                                </Stack>
                            </Group>
                            {!done && (
                                <Button
                                    component={Link}
                                    to={step.to}
                                    size="xs"
                                    variant="light"
                                    style={{ flexShrink: 0 }}
                                >
                                    {step.cta}
                                </Button>
                            )}
                        </Group>
                    );
                })}
            </Stack>
        </Card>
    );
};
