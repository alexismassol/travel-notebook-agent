import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `scripts/` aussi : le rejeu des scénarios est la seule commande qui dépense de
    // l'argent, son estimation de coût mérite un test comme le reste.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
