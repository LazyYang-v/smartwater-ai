# SmartWater M0

- Scope: one aeration basin, Vue 3 + TypeScript + Vite + Three.js, simulated data, deterministic Demo Agent. Only `scene.focus_device` and `scene.reset_view` are Agent tools. Stop at M0; no backend, database, real LLM, remote repository, or industrial connection.
- Work only in this project. Preserve `docs/references/dashboard-target.png`. Do not change global Git identity, system tools, Blender preferences, or other projects.
- Generate with an independent background Blender process. Preserve the live MCP scene and its Cube, Camera and Light. Never clear that interactive scene.
- Generated scene: `SmartWater_M0`; collection: `SW_M0_GENERATED`; unique device root: `SW_BIO_AERATION_001`. Site context has a separate root. Parameters live in `config/aeration.json`.
- Modeling changes must be reproducible from the script/config. Export selected managed content to staged files; validate before replacing successful artifacts. Preserve the previous successful pair on failure.
- Resource provenance, authors, license, timestamps, dimensions and SHA-256 belong in `docs/asset-register.json`. Decode actual files before using them. Keep textures project-local and pack the Blend.
- Agent success requires actual camera arrival, shared registry selection and an updated render. One camera executor; cancellation, idempotency and explicit failures are required.
- Capture evidence from the running webpage. Distinguish implementation, verification, unverified work and pending human visual acceptance. Dimensions are demonstration parameters, not construction specifications.
