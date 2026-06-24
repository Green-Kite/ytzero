import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { api } from "./routes";
import { startScheduler } from "./refresher";
import { log } from "./logger";

const app = new Hono();

app.route("/api", api);

// Serve the built UI (ui/dist is copied to ./public in the Docker image,
// or set UI_DIST when running locally).
const uiDir = process.env.UI_DIST ?? "./public";
app.use("/*", serveStatic({ root: uiDir }));
app.get("*", serveStatic({ path: `${uiDir}/index.html` }));

startScheduler();

const port = Number(process.env.PORT ?? 3001);
const idleTimeout = Number(process.env.IDLE_TIMEOUT_SECONDS ?? 120);
const server = Bun.serve({ port, idleTimeout, fetch: app.fetch });
log.info("app.listen", { url: String(server.url), port, uiDir, idleTimeout });
