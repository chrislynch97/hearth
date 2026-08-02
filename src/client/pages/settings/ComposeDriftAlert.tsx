import { Alert, Anchor, Code, Text } from "@mantine/core";

/** Where the Updating docs explain re-copying the compose file. */
const DOCS_UPDATING_URL =
    "https://github.com/chrislynch97/hearth/blob/main/docs/deployment.md#updating--three-ways";

export interface ComposeDriftAlertProps {
    /** `HEARTH_*` settings this build reads that the container's environment
     *  never defines — see `missingComposeSettings` on the server. */
    settings: string[];
}

/** Warns that the compose file this instance runs is older than the image, so
 *  the settings listed can't be set from `.env` at all (#241). Sits in the
 *  Updates card because updating the image is what causes it: the pull replaces
 *  the image and leaves the compose file exactly as it was, and the failure is
 *  otherwise silent — the setting is simply ignored. */
export const ComposeDriftAlert = ({ settings }: ComposeDriftAlertProps) => {
    if (settings.length === 0) return null;

    return (
        <Alert
            color="orange"
            variant="light"
            title="Your compose file is older than this version"
            mb="sm"
        >
            <Text size="sm">
                {settings.length === 1
                    ? "This setting is not passed into the container, so it cannot be set in .env:"
                    : `These ${settings.length} settings are not passed into the container, so they cannot be set in .env:`}
            </Text>
            <Code block my="xs">
                {settings.join("\n")}
            </Code>
            <Text size="sm">
                Updating the image does not update the compose file. Re-copy it
                from the release you're running — keeping any changes you made
                to it — then run <Code>docker compose up -d</Code>.{" "}
                <Anchor
                    href={DOCS_UPDATING_URL}
                    target="_blank"
                    rel="noreferrer"
                >
                    How to update
                </Anchor>
            </Text>
        </Alert>
    );
};
