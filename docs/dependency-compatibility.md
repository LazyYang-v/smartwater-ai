# M0 dependency compatibility

Registry metadata checked before installation during the 2026-11-15–16 implementation session (Asia/Shanghai).

Environment: Node 24.21.0, pnpm 11.25.0. No system tool version changed.

| Package | Exact version | Compatibility evidence |
|---|---|---|
| Vue | 3.5.45 | Vue 3; plugin accepts ^3.2.25 |
| Vite | 8.3.8 | Node ^20.19.0 or >=22.12.0 |
| @vitejs/plugin-vue | 6.0.11 | Accepts Vite ^8.0.0; same Node range |
| Three.js / @types/three | 0.187.0 | Matching release |
| TypeScript | 5.9.3 | Project-local stable compiler; Node >=14.17 |
| vue-tsc | 3.3.14 | TypeScript >=5.0.0; actual typecheck passed |
| @phosphor-icons/vue | 2.2.1 | Vue >=3.2.39 |

Sources: official npm registry package metadata (`https://registry.npmjs.org/<package>/latest`, TypeScript `/5.9.3`). Installed using strict peer dependency validation, with project-local `.pnpm-store`. Exact resolutions and integrity hashes are in `pnpm-lock.yaml`.
