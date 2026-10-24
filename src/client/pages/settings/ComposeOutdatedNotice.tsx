import { Callout } from "@/components/ui/Callout";

/** Where the Updating docs explain the one-time compose file switch. */
const DOCS_UPDATING_URL =
    "https://github.com/chrislynch97/hearth/blob/main/docs/deployment.md#updating--three-ways";

export interface ComposeOutdatedNoticeProps {
    /** The compose file predates this image's layout — see `composeOutdated`
     *  on the server. */
    outdated: boolean;
}

/** Tells the owner their compose file is older than this version expects
 *  (#241). Amber, not red: nothing is broken, but settings in .env may not
 *  arrive until the file is replaced. Sits in the Updates card because
 *  updating is what exposes it. */
export const ComposeOutdatedNotice = ({
    outdated,
}: ComposeOutdatedNoticeProps) => {
    if (!outdated) return null;

    return (
        <Callout
            tone="attention"
            title="Your compose file is older than this version"
            className="mb-3"
        >
            <p>
                Some settings in <code className="font-mono">.env</code> may
                not reach Hearth until it's replaced with the one from this
                release. This is a one-time step: move any changes you made to
                the file into <code className="font-mono">.env</code> or a{" "}
                <code className="font-mono">compose.override.yml</code>,
                replace it, then run{" "}
                <code className="font-mono">docker compose up -d</code>. After
                that, the host updater keeps it current for you.{" "}
                <a
                    href={DOCS_UPDATING_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                >
                    How to update
                </a>
            </p>
        </Callout>
    );
};
