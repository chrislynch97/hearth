import { isServerPgUrl } from "./db/target";
import { appVersion } from "./version";

// Phase 1 of the self-host update flow (issue #81): tell the owner what version
// they're running, whether a newer GitHub *release* exists, and the exact host
// commands to apply it. The app never touches Docker — it can't rebuild its own
// container without the socket — so "apply" stays a copy-pasteable command.

const REPO = "chrislynch97/hearth";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateStatus {
    current: string;
    /** Latest release tag, or null when GitHub is unreachable / has no releases. */
    latest: string | null;
    updateAvailable: boolean;
    /** Whether the check itself succeeded (false ⇒ offline / GitHub error). */
    checked: boolean;
    releaseUrl: string | null;
    releaseName: string | null;
    publishedAt: string | null;
    /** Copy-pasteable host commands for this deployment's compose file. */
    commands: string;
}

const normalise = (v: string): string => v.replace(/^v/, "").trim();

/** The exact host-side update commands for the running deployment. PGlite and
 *  Postgres use different compose files; pick the one that matches. */
const updateCommands = (): string => {
    const composeFile = isServerPgUrl(process.env.DATABASE_URL)
        ? "docker-compose.postgres.yml"
        : "docker-compose.yml";
    const up =
        composeFile === "docker-compose.yml"
            ? "docker compose up -d --build"
            : `docker compose -f ${composeFile} up -d --build`;
    return `git pull\n${up}`;
};

interface GithubRelease {
    tag_name?: string;
    html_url?: string;
    name?: string;
    published_at?: string;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
    const current = appVersion();
    const commands = updateCommands();

    let release: GithubRelease | null = null;
    try {
        const res = await fetch(LATEST_RELEASE_URL, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "hearth-update-check",
            },
            signal: AbortSignal.timeout(5000),
        });
        // 404 == the repo has no published releases yet; treat as "nothing to
        // compare against" rather than an error.
        if (res.ok) release = (await res.json()) as GithubRelease;
        else if (res.status === 404) release = {};
    } catch {
        // Offline or GitHub unreachable — degrade gracefully (checked: false).
    }

    if (!release) {
        return {
            current,
            latest: null,
            updateAvailable: false,
            checked: false,
            releaseUrl: null,
            releaseName: null,
            publishedAt: null,
            commands,
        };
    }

    const latest = release.tag_name ?? null;
    // Can't assert an update when we don't know our own version, or when there's
    // no release to compare against.
    const updateAvailable =
        !!latest &&
        current !== "unknown" &&
        normalise(current) !== normalise(latest);

    return {
        current,
        latest,
        updateAvailable,
        checked: true,
        releaseUrl: release.html_url ?? `https://github.com/${REPO}/releases`,
        releaseName: release.name ?? null,
        publishedAt: release.published_at ?? null,
        commands,
    };
}
