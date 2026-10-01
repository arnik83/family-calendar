import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchAction } from "./actions";
import { seedIfEmpty } from "./seed";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..", "..", "client", "dist");

await seedIfEmpty();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // JSON-RPC endpoint: { action: "listMembers", args: {...} }
    if (url.pathname === "/api/actions" && req.method === "POST") {
      try {
        const body = (await req.json()) as { action?: unknown; args?: unknown };
        if (typeof body.action !== "string") throw new Error("Missing action name.");
        const result = await dispatchAction(body.action, body.args ?? {});
        return Response.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "The action failed.";
        return Response.json({ error: message }, { status: 400 });
      }
    }

    // Static files, with an SPA fallback to index.html.
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(distDir, pathname));
    if (await file.exists()) {
      return new Response(file, {
        headers: { "content-type": MIME[extname(pathname)] ?? "application/octet-stream" },
      });
    }
    return new Response(Bun.file(join(distDir, "index.html")), {
      headers: { "content-type": MIME[".html"] ?? "text/html" },
    });
  },
});

console.log(`Family Calendar is running at http://localhost:${port}`);
