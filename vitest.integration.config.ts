import { defineConfig } from "vitest/config";

// Tests sur l'API réelle : coûtent des tokens, lancés à la demande, jamais en boucle.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
