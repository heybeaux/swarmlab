# Exp62 — Compiled rule binding integrity

Pre-registered design: [Spec68](../../specs/68-compiled-rule-binding-integrity.md). No results yet.

 (same baseline/repeat/postfix)
From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-10-12-exp62`:
```bash
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 install --frozen-lockfile
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62/packages/aegis/dist/index.js node experiments/62-compiled-rule-binding-integrity/dist/main.js
# repeat unchanged once before Aegis patch; same invocation after warranted patch commit + rebuild
```
Baseline red warrants minimal boundary validation plus focused tests. Baseline null => no patch, honest-null. Post-novel regression only: npm run verify:evidence; full Aegis pnpm release:check; relevant exp58 async config and exp59 receipt regression runs, not novelty. Preserve previous main CI failure uncertainty. Linked PRs, clean mergeability/real CI pass required; pending exit safely. No .acr change planned, Territory refresh only if changed.
