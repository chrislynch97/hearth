import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The running app's version. In a built/containerised deploy this is read from
// dist/version.json (baked by scripts/gen-version.mjs at build time — see there
// for why it can't be resolved live). In `tsx` dev there's no build, so fall
// back to git; failing that, "unknown".
const readBuiltVersion = (): string | null => {
    try {
        const raw = readFileSync(
            resolve(process.cwd(), "dist", "version.json"),
            "utf8"
        );
        const parsed = JSON.parse(raw) as { version?: unknown };
        return typeof parsed.version === "string" && parsed.version
            ? parsed.version
            : null;
    } catch {
        return null;
    }
};

const readGitVersion = (): string | null => {
    try {
        return (
            execSync("git describe --tags --always --dirty", {
                stdio: ["ignore", "pipe", "ignore"],
            })
                .toString()
                .trim() || null
        );
    } catch {
        return null;
    }
};

let cached: string | undefined;

/** The version string the running instance reports (e.g. `v1.2.0`, a git SHA,
 *  or `unknown`). Resolved once and memoised. */
export function appVersion(): string {
    if (cached === undefined) {
        cached =
            process.env.HEARTH_VERSION?.trim() ||
            readBuiltVersion() ||
            readGitVersion() ||
            "unknown";
    }
    return cached;
}
