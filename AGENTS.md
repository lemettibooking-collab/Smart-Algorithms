# AGENTS.md — Smart Algorithms (Next.js/TS)

## Working rules
- Act as a senior engineer and debugging agent.
- Prefer minimal, high-confidence changes. Avoid refactors unless requested.
- Never change public API contracts or UI behavior unless explicitly asked.
- Keep code style consistent with the repo. Respect TypeScript types.
- If you add dependencies, justify them and keep them minimal.

## Workflow (must follow)
1) Read relevant files and summarize the suspected root cause in 5–10 bullets.
2) Propose a plan (3–7 steps) and choose the best approach.
3) Implement the fix.
4) Run checks:
   - npm run lint (if exists)
   - npm run typecheck (if exists)
   - npm test (if exists)
   - npm run dev sanity check if applicable
5) Provide a clean output:
   - What changed and why
   - Unified diff (preferred) OR full files (only if user asks)
   - Commands used
   - Manual test checklist

## Output format
- Use sections: Root cause / Plan / Patch / Verification / Notes.
- For patches, use unified diff with file paths.
- If something blocks progress, request the minimal missing info (1–2 items).

# Agent Rules (Smart Algorithms)

## Safety / Scope
- NO refactors, NO renames, NO formatting-only changes unless explicitly requested.
- NO API shape changes unless explicitly requested.
- Keep diffs minimal and localized.

## Workflow
- Always output a unified diff (git-style).
- Always list commands you ran and their outputs (short).
- Always include a manual test checklist.

## Debugging
- Add logs only if gated by env var DEBUG_HOT=1 (or similar).
- Remove debug logs before final.

## Constraints
- Do not introduce new dependencies unless requested.
- If dependency is necessary, justify it and keep it minimal.