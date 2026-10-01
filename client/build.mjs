// Client build: bundles the React app with Bun.build and compiles the
// Tailwind CSS with the Tailwind CLI, then writes dist/index.html.
// Run with: bun ./client/build.mjs   (or: bun run build)
import { $ } from "bun";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const assets = join(dist, "assets");
await mkdir(assets, { recursive: true });

// 1. JavaScript bundle.
const build = await Bun.build({
  entrypoints: [join(here, "src", "main.tsx")],
  outdir: assets,
  naming: "app-[hash].[ext]",
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
const jsOutput = build.outputs.find((o) => o.path.endsWith(".js"));
if (!jsOutput) {
  console.error("No JS output produced.");
  process.exit(1);
}
const jsFile = jsOutput.path.split("/").pop();

// 2. CSS via the Tailwind CLI (handles @import "tailwindcss").
await $`bun x @tailwindcss/cli -i ${join(here, "src", "theme.css")} -o ${join(assets, "app.css")} --minify`.quiet();

// 3. index.html wiring it together.
await writeFile(
  join(dist, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="data:," />
    <title>Family Calendar</title>
    <link rel="stylesheet" href="./assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./assets/${jsFile}" type="module"></script>
  </body>
</html>
`,
);

console.log(`Built client/dist (js: ${jsFile})`);
