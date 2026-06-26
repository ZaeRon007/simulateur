# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # dev server (default Angular CLI port)
npm run build    # production build (esbuild)
npm run watch    # build in watch mode
npm test         # run unit tests with Vitest
```

No dedicated lint script exists; TypeScript strict checks run as part of the build.

## Architecture

Angular 21 SPA — a **driving distraction simulator** game. The backend API runs at `http://localhost:8080` (configured in `src/app/core/api.config.ts`).

### Key directories

```
src/app/
  core/           # Services, models, guards, interceptors
  components/     # Reusable/game UI components
  pages/          # Route-level components (landing, auth, login, register, game, profile)
```

### Data flow

1. `AuthService` handles JWT login/register and token storage. The `AuthInterceptor` appends `Bearer <token>` to requests targeting `/me` and `/score`.
2. `authGuard` / `unauthGuard` protect routes accordingly.
3. `ProfileService` fetches user data and submits scores after a game session.

### Game loop

The game lives in `pages/game` and orchestrates two main sub-components:

- **`RoadComponent`** (`components/road/road.component.ts`, ~550 lines) — Canvas-based physics engine. Handles player car (arrow-key acceleration/braking), oncoming traffic spawning (10–45 s after start), and collision detection. Emits events back to the game page on collision or distraction timeout.
- **`DistractionService`** (`core/distraction.service.ts`) — Randomly generates timed distraction events (SMS, calls, battery alerts, photos, music, location, reminders). The player has **2.5 s** to react before game-over.

Supporting components under `components/`: `phone`, `notification-overlay`, `conversations`, `incoming-call`, `sms-thread`.

On game end (collision or timeout), `GameComponent` calls `ProfileService.submitScore()`.

### Angular patterns in use

- **Standalone components** everywhere — no `NgModule`.
- **Signals** (`signal`, `computed`, `effect`) for reactive state; prefer them over BehaviorSubjects for new state.
- **`inject()`** function for DI (not constructor injection).
- **`takeUntilDestroyed()`** to auto-unsubscribe RxJS streams.
- **OnPush** change detection throughout.
- Lazy-loaded routes defined in `app.routes.ts`.

## Style

- Prettier (100-char print width) — run `npx prettier --write <file>` before committing.
- All UI text and SMS content is in **French**.
