// no-op shim — "server-only" throws unconditionally when imported outside
// Next's own bundler (it can't tell a Vitest run from a real client
// bundle), so every module under test that starts with `import
// "server-only"` needs this aliased in instead. See vitest.config.ts.
export {};
