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

export type DeployMode = "image" | "source";

/** How this instance is deployed. The managed image deploy sets HEARTH_DEPLOY=image
 *  (compose uses `image: ghcr.io/…:latest`); anything else is a from-source build. */
export const deployMode = (): DeployMode =>
    process.env.HEARTH_DEPLOY === "image" ? "image" : "source";

/** The exact host-side update commands for the running deployment. An image
 *  deploy pulls the new image; a source deploy rebuilds. PGlite and Postgres use
 *  different compose files; pick the one that matches. */
export const updateCommands = (): string => {
    const isPg = isServerPgUrl(process.env.DATABASE_URL);
    if (deployMode() === "image") {
        // The managed image deploy uses the ghcr compose variants (neither is the
        // default docker-compose.yml, so both need an explicit -f).
        const flag = isPg
            ? " -f docker-compose.postgres.ghcr.yml"
            : " -f docker-compose.ghcr.yml";
        return `docker compose${flag} pull\ndocker compose${flag} up -d`;
    }
    const flag = isPg ? " -f docker-compose.postgres.yml" : "";
    return `git pull\ndocker compose${flag} up -d --build`;
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
