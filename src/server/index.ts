import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { warmUp } from "./agent/warm-up";
import { createApp } from "./app";
import { API_PORT, loadConfig } from "./config";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY manquante. Copiez .env.example en .env et renseignez la clé, puis relancez.",
  );
  process.exit(1);
}

const config = loadConfig();
// Un tour ne doit pas laisser le voyageur attendre des minutes : délai court, une seule reprise.
const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
const app = createApp({ client, config });

// En mode `npm start`, le serveur sert aussi l'interface compilée.
if (existsSync("dist/web/index.html")) {
  app.use("/*", serveStatic({ root: "dist/web" }));
}

serve({ fetch: app.fetch, port: API_PORT }, (info) => {
  console.log(`API prête sur http://localhost:${info.port} (modèle : ${config.model})`);
  void warmUp(client, config);
});
