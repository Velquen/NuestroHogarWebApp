# AGENTS.md

Guidance for coding agents working in `nuestroHogarV2`.

## Project Snapshot

- Stack: React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3.
- Data/auth: Supabase client (`@supabase/supabase-js`).
- Server state: TanStack Query v5.
- Charts: Recharts.
- Package manager: npm (`package-lock.json` is present).
- Language used in UI/errors is mostly Spanish. Preserve that tone.

## Repository Layout

- `src/main.tsx`: app bootstrap, QueryClient setup, cache hydration/persistence.
- `src/App.tsx`: primary UI and most feature logic.
- `src/api/*.ts`: Supabase data access functions.
- `src/types/*.ts`: shared domain types.
- `src/lib/*.ts(x)`: infra helpers (Supabase client, profile icons, etc.).
- `src/index.css`: design tokens, component utility classes, and base behavior.
- `supabase/`: database-related assets/workflows.

## Setup

1. Install deps: `npm install`
2. Create env file: copy `.env.example` to `.env`
3. Set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Start dev server: `npm run dev`

## Build, Lint, Test Commands

### Available scripts (from `package.json`)

- `npm run dev` -> start Vite dev server.
- `npm run build` -> TypeScript check (`tsc --noEmit`) + production bundle.
- `npm run preview` -> preview the built app.

### Linting status

- No ESLint/Prettier/Biome script is currently configured in `package.json`.
- Do not invent a lint command in automation; rely on `npm run build` for type safety.

### Test status

- No test runner (Vitest/Jest/Cypress/Playwright) is configured currently.
- There is no command for "run all tests" or "run a single test" yet.
- For now, use:
  - `npm run build` for strict type checks.
  - Manual verification in `npm run dev`.

### If/when tests are added

- Add explicit scripts in `package.json` and update this file.
- Ensure there is a single-test command, e.g. pattern-based or file-based.

## TypeScript and Types

- `strict: true` is enabled; keep code fully type-safe.
- Prefer explicit interfaces/types for API rows and domain objects.
- Keep API response mapping functions small and typed (see `toTask`, `toRecentTaskLog`).
- Use narrow unions for app states (`'light' | 'dark' | 'system'`, etc.).
- Favor type guards for runtime validation (`isThemeMode`, `isValidProfileIconKey`).
- Avoid `any`; use `unknown` + narrowing when needed.

## Imports and Module Conventions

- Use ESM syntax everywhere.
- Import order convention used in repo:
  1. React / third-party packages
  2. Internal modules
  3. Types (`import type` or inline `type` specifiers)
- Keep import paths:
  - Relative for nearby modules (current convention in `src`).
  - `@/*` alias is available via `tsconfig.json` and Vite.
- Prefer `type` imports where values are not needed at runtime.

## Naming Conventions

- Components, interfaces, and type aliases: `PascalCase`.
- Variables/functions/hooks: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for app-wide constants and storage keys.
- Query keys: array form with stable string root first, e.g. `['community-dashboard', ...]`.
- Use descriptive names over abbreviations, especially in API/data mapping code.

## React Patterns

- Functional components and hooks only.
- Keep derived data in `useMemo` when computed from large arrays/objects.
- Use `useCallback` for handlers passed deeply or reused in effects.
- Always clean up side effects (`addEventListener`, timers, subscriptions).
- Guard browser APIs with runtime checks when needed (`typeof window !== 'undefined'`).
- Prefer early returns for guard clauses in handlers/effects.

## State and Data Fetching

- Use TanStack Query for server data, invalidation, and cache lifecycle.
- Keep query keys consistent and centralized by naming pattern.
- Use `enabled` flags to gate queries on auth/config readiness.
- Invalidate only impacted query roots after mutations.
- For local UI feedback, use concise state flags (`isLoading`, `isSavingProfile`, etc.).

## Error Handling

- Throw `Error` with actionable, user-meaningful messages in API layer.
- In UI layer, catch unknown errors and narrow with `instanceof Error`.
- Provide fallback messages when error shape is unknown.
- Preserve Spanish copy style in user-facing errors/toasts.
- Swallow only intentionally non-critical failures (e.g. localStorage persistence) and document with brief comments.

## Styling and UI System

- Tailwind is primary, with substantial custom CSS in `src/index.css`.
- Reuse existing design tokens and utility/component classes before adding new ones.
- Keep theming compatible with light/dark + CSS custom properties.
- Respect existing typography choices (Manrope/Fraunces) and visual language.
- Keep motion subtle; honor reduced-motion behavior.
- Maintain cursor behavior policy defined in `src/index.css`.

## Formatting and Code Style

- Follow existing style in the file being edited.
- Current conventions observed:
  - 2-space indentation.
  - Semicolons enabled.
  - Single quotes for strings.
  - Trailing commas in multiline literals/imports.
  - Prefer small helper functions for repeated logic.
- Keep functions focused; extract helpers instead of deep nesting.

## Environment and Secrets

- Never hardcode Supabase URLs/keys.
- Use `import.meta.env` for Vite env vars.
- Required vars are documented in `.env.example`.
- Treat `.env` as local-only and non-committable.

## Agent Workflow Expectations

- Before editing, read nearby code and match local patterns.
- Make minimal, targeted changes; avoid opportunistic refactors.
- If adding a new command/tooling, update `README.md` and this file.
- Validate with `npm run build` after meaningful code changes.
- If you cannot run a command, state that explicitly and explain why.

## Cursor/Copilot Rules Check

- `.cursorrules`: not present.
- `.cursor/rules/`: not present.
- `.github/copilot-instructions.md`: not present.
- No external Cursor/Copilot rule files were found at this time.

## Definition of Done (Agent)

- Code compiles with `npm run build`.
- Changes are type-safe under strict TypeScript.
- New behavior is manually sanity-checked in dev mode when relevant.
- Documentation is updated when commands or conventions change.
