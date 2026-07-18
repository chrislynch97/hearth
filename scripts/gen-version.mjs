// Bakes the running version into dist/version.json at build time. The runtime
// image ships no git and no source tree (.git is dockerignored), so the version
// can't be resolved live — it has to be captured here, while we still can.
//
// Priority: HEARTH_VERSION env (set by the release CI's --build-arg) → a local
// `git describe` (host dev builds) → "unknown". The checker treats "unknown"
// honestly rather than guessing.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const fromGit = () => {
    try {
        return execSync("git describe --tags --always --dirty", {
            cwd: root,
            stdio: ["ignore", "pipe", "ignore"],
        })
            .toString()
            .trim();
    } catch {
        return "";
    }
};

const version = process.env.HEARTH_VERSION?.trim() || fromGit() || "unknown";

const out = resolve(root, "dist", "version.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
    out,
    JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2) +
        "\n"
);

console.log(`gen-version: ${version}`);
