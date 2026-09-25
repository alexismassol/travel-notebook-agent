import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { apiPort } from "./src/server/config";

// Le même calcul des deux côtés : l'interface doit chercher l'API là où elle écoute vraiment.
const API_PORT = apiPort();

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    // "/api/" et non "/api" : le préfixe seul capturait aussi le module front /api.ts (page blanche).
    proxy: { "/api/": `http://localhost:${API_PORT}` },
  },
});
