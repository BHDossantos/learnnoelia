import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit/action tests and isolated PGlite SQL/RLS regressions. These do not
// substitute for browser acceptance or a full hosted Supabase migration run.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
