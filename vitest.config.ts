import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests only, for now.
 *
 * Everything under tests/unit runs with no database and no network, so the
 * suite is safe to run anywhere — including CI and a fresh checkout with no
 * DATABASE_URL. Integration tests (which need a throwaway Postgres) get their
 * own project here once that database exists; scripts/smoke-test.ts remains
 * the stopgap until then.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    reporters: "dot",
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      // The engines this suite is actually about; the rest of src/lib is
      // database or network bound and is covered by integration tests later.
      exclude: ["src/lib/**/*.d.ts", "src/lib/db.ts", "src/lib/adapter.ts"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
