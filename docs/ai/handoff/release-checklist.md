# Release Checklist — Smart Algorithms

- [ ] Scope matches task
- [ ] No unrelated files changed
- [ ] `npm run lint` passed
- [ ] `npx tsc --noEmit` passed
- [ ] `npm run build` passed
- [ ] API shape checked if relevant
- [ ] Empty/loading/error states checked if relevant
- [ ] Provider partial-failure behavior checked if relevant
- [ ] SSE/live update behavior checked if relevant
- [ ] Env/secrets verified
- [ ] No accidental performance regression spotted
- [ ] Rollback path is clear