# exp61 — Package-default policy isolation

Pre-registration and all frozen terms: [Spec67](../../specs/67-package-default-policy-isolation.md). Results pending.

## RT-51 — Package-default policy isolation (exp61 / Spec67)

Pre-registration `5271a6f0a95728cfc74e18ed2e102501554cd229` preceded all implementation/output. Fetched current main Aegis `4be84ed` let edits to exported severity/threshold/Set recipes silently become unrelated consumers' implicit policy: **9/9** hazards influenced decisions, **6/6** weakening hazards escaped their required default classification, exact scenario accuracy **7/16**. Baselines `dpi-mv4vqk63` / `dpi-mv4vqkba` have identical full scenario bodies/artifact manifests. Captured-host and explicit-template controls both **16/16**; no fixture or LLM decided success.

Aegis runtime `186cc3541218ca0a591bc36fd02bc7708f0d65bd` separates private implicit severity/prediction/safe defaults from publicly editable recipe copies, including strict async effective options. SAME immutable harness/scenario/seed `dpi-mv4vti3m`: influence **0/9**, weakening failures **0/6**, accuracy **16/16**, every secondary/control metric **1**. Three committed53-event replay traces pin package/source/full artifact hashes; 14 focused unit regressions transition11 red/3 pass to14 green. Public names/types/editability preserved; passing edited recipes explicitly still selects host policy. No frozen caller data or fixture-specific branching.

This is between-call ambient policy isolation, distinct from RT48 in-flight configuration/RT49 output ownership/RT50 numeric validation. RT50 remains separately reserved in prior unmerged draft PRs66/49; no cherry-pick or false combined claim. Hosts using ambient DEFAULT_* mutation must migrate to existing explicit options. Lattice/host owns distributing/selecting overrides; Aegis owns private defaults. Arbitrary process compromise/getters/proxies, malformed policy and signed/transactional execution unproven. No tuning; holdout unused. Local green is not CI/merge proof; candidate status recorded in nightly ledger and linked PRs. Existing exp55–59 unchanged neighbor checks are regression ONLY, not novelty.

Run with explicit real package:
```bash
AEGIS_REPO=<built-aegis> AEGIS_DIST=<built-aegis>/packages/aegis/dist/index.js node experiments/61-package-default-policy-isolation/dist/main.js
```
A valid red run exits0: inspect metrics, not only process status. Cache-busted real bundled module per scenario isolates intentional template writes.

### Regression-only / release results
SwarmLab build+typecheck+verify:evidence pass (49 claims,105 traces,995 assertions). Aegis release:check passes build+typecheck+1139 tests (628+146+22+86+54+203) and50/50 evidence mappings implemented in candidate source, NOT remote-main certification. Neighbor exp55/56/57/58/59 exact accuracy1/unsafe0 replay71/59/65/68/68events against runtime186cc35; committed traces/receipts do not rewrite their historical claims. First release attempt exposed evidence-accounting test assertions, repaired before full green rerun. No runtime/scenario/threshold tuning.

**Merge HOLD / draft:** implicit policy isolation intentionally removes undocumented ambient DEFAULT_* configuration. Beaux should review migration to explicit options before adoption. CI can be green without resolving that policy decision. Prior RT50 draft remains separate. Source .acr unchanged; Territory not refreshed.

Paired draft candidates: [Aegis67](https://github.com/heybeaux/aegis/pull/67) / [SwarmLab50](https://github.com/heybeaux/swarmlab/pull/50). Owner migration review HOLD applies even with green checks; no merged-main claim.
