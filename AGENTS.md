# SmartWater v0.2 business development

## Current scope and sources

- Preserve the existing four-unit assets and read-only Agent while replacing browser-generated business data with authenticated backend records. Existing foundation: aeration basin, clarifier, blower and lift pump. Vue/TypeScript/Three.js dashboard, unified simulated data, Demo/LLM execution, local Node model gateway, IndexedDB task history and Markdown/JSON reports.
- Use `src/scene/units.ts` for model identities and `src/agent/contracts.ts` for the seven existing tools. Business devices, metrics, telemetry and alarm rules live in PostgreSQL; `src/data/mockDataProvider.ts` remains an explicitly selected offline-demo source. Extend these sources rather than creating another registry, data source or tool executor.
- Current authorized work is the v0.2 business system. Implement the first vertical slice with Spring Boot, PostgreSQL, an independent simulated collector, device/telemetry/alarm APIs and API-backed dashboard data. Add server-side authentication, permissions, transaction/idempotency and audit where this flow needs them. Work orders and server-side Agent task orchestration follow this usable slice; never describe the slice as the completed six-module business system. Industrial control remains outside scope.
- Keep the default unit view, interaction-priority rendering and four-unit trial label. Existing evidence does not establish full-plant production performance.

## Execution and evidence

- Keep Demo and LLM modes distinct. Demo is deterministic; LLM chooses its calls through the shared validator/dispatcher. Requirement extraction constrains completion; it must not synthesize LLM tool calls or model replies.
- Freeze device/metric/time-window/display requirements when a task starts. Validate actual same-task, same-snapshot receipts against them before success. Unsupported or ambiguous requirements cannot become verified whole-task success merely because a tool returned.
- Aggregate every successful metric query by device and metric; retain distinct historical windows and evidence references. Conflicting evidence remains uncertain. Current cards and newly generated reports share the aggregation implementation.
- Preserve SIMULATED/source and quality as separate fields. Missing data is not zero; absent alarms or a loaded model do not establish operational health. Reports preserve limits and the original task/model/data time.
- Keep one camera executor and one Three runtime. Camera success requires arrival, matching selection and a rendered frame; chart success requires the correct version/window to be submitted. Preserve cancellation, timeouts, idempotency, page-hidden behavior and late-result guards.
- Viewing/exporting history executes no tools or model requests and does not move the camera. Old frozen reports remain historical objects; never recompute them against current data or rules. Reexecution is explicit and creates a new task/snapshot linked to the original.
- Task execution status and persistence status are independent. Preserve memory results on storage failure and use isolated test libraries for fault injection. Retain the active-tab lock and interrupted/unconfirmed recovery semantics.

## Protected files, assets and secrets

- Work in this project. Preserve reference images, old screenshots, failed baselines and acceptance records. Do not modify global Git identity, system/browser/Blender configuration or other projects.
- Leave existing Blend/GLB/materials/layout unchanged unless the requested change needs them. When modeling is requested, use a separate background Blender process, reproducible scripts/config, project-managed roots and staged validated exports. Preserve the live unsaved Blender scene and its Cube/Camera/Light. Aeration generation retains scene `SmartWater_M0`, collection `SW_M0_GENERATED` and device root `SW_BIO_AERATION_001`.
- Preserve asset provenance/licenses in `docs/asset-register.json`, relative or packed textures and the previous successful export on failure. Demonstration dimensions are not engineering designs.
- Secrets belong only in the ignored server-side local configuration. Never print or commit API keys, headers or environment contents; client builds, history and exports must remain secret-free. Before a requested public GitHub push, inspect staged content and keep caches/dependencies/builds/private configuration excluded.
- Use existing package scripts for relevant tests, type checking and production build. Capture UI evidence from the actual running webpage in a new acceptance directory. State what was implemented, verified and not verified; do not expand performance or production claims from a short check.
