/**
 * Bundles the operational scripts (migrate, seed) into plain JS so they run in the slim
 * production image without tsx / TypeScript:  node dist-scripts/migrate.cjs
 *
 * - esbuild is not a direct dependency; it is resolved through tsx (which depends on it).
 * - `react-server` condition → `server-only` resolves to its empty module.
 * - `@/*` path alias is resolved from tsconfig.json by esbuild.
 * - Native @node-rs/argon2 stays external; it is resolved at runtime from the standalone node_modules.
 *
 * Usage: pnpm build:scripts   (outputs ./dist-scripts/*.cjs)
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx/package.json"))("esbuild");

const entries = ["migrate", "seed"];

await esbuild.build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(entries.map((e) => [e, `scripts/${e}.ts`])),
  outdir: process.env.SCRIPTS_OUT_DIR || "dist-scripts",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  conditions: ["react-server"],
  tsconfig: "tsconfig.json",
  external: ["@node-rs/argon2", "sharp"],
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
});

console.log(`✔ bundled ${entries.join(", ")} → dist-scripts/`);
