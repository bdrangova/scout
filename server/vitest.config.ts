import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/testing/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Each file owns a temp git repo plus filesystem watchers; in parallel, macOS FSEvents drops
    // events under the load (libuv recreates its stream on every added watch), so the SSE tests flake.
    fileParallelism: false,
  },
})
