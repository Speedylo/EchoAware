import { defineConfig } from 'vitest/config';

// Root config: scope vitest to the extension test suite only.
// The Worker has its own package.json + vitest config under worker/ and is
// tested by `cd worker && npm test`. Without this, root-level `vitest run`
// scans the whole tree and tries to run worker/test/*.test.ts against the
// root install, which doesn't have the Worker's deps (zod, etc.).
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'worker'],
  },
});
