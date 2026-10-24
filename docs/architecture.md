# Architecture

React + Vite + TypeScript browser client; native Node HTTP server. No hosted database is required for single-player play. Local game state and timelines are versioned JSON with runtime validation.

- `src/game/` is the pure seeded narrative/relationship engine: choice resolution, age progression, NPC identities, memories, local speech and model enrichment validation.
- `src/simulation/` wraps the engine with independently sourced country conditions, weighted birth, demographics, education, occupation, annual accounts, investment, migration, probabilistic mortality, peer lifetimes and yearly records.
- `src/pixel/` 从真实游戏与模拟状态推导场景，再生成原生像素RGBA；React画布只负责显示，绘制不推进时间或修改存档。
- `src/lib/clock.ts` manages fractional-year elapsed time and interruption; `storage.ts` preserves full state+simulation pairs and rewind points before a decision.
- `src/App.tsx` composes the visible flow, asynchronous generation, authenticated API calls and transactional save updates. Late responses can only commit against their original exact snapshot.
- `server/` exposes `/api/status`, `/api/turn`, `/api/chat`, and secure static serving. DeepSeek secrets are read from server environment only. Generated JSON is validated and effects bounded before return.

The simulation owns time, finance, roles, milestones and mortality. Model output enriches prose and conversations; it cannot invent or bypass a tuition payment, change a resolved choice, or advance time. The full single-player simulation remains available without a key.

World threads advance through contributions in distinct years, with recorded delays and explicit completed/withdrawn/lapsed/interrupted outcomes. A bounded factual ledger preserves actual paid actions, settled choices, relationship changes and reviews independently of active-story capacity. `worldContext` mirrors current simulation resources and obligations. Optional model relationship assessments must reference a current-year fact for the same living NPC; local intent-specific evidence checks, bounded values and per-evidence deduplication own the actual consequences.

Production build uses `dist/`; the server is configured to provide SPA routing plus the same-origin API. Shared hosting can require `GAME_ACCESS_TOKEN` and should set an exact `GAME_PUBLIC_ORIGIN` behind HTTPS.
