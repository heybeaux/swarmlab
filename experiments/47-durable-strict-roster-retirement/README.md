# Experiment 47 - Durable strict-roster policy retirement

**Pre-registered:** 2026-09-25T06:36:00Z, before implementation or baseline execution.  
**Spec:** [`specs/53-durable-strict-roster-retirement.md`](../../specs/53-durable-strict-roster-retirement.md)  
**Seed:** `durable-strict-roster-retirement-v1`

RT-37 proved exact active marker continuity but intentionally left lifecycle and retention host-owned.
This experiment asks the next distinct question: whether an exact terminal-bound retirement
transition can reclaim active marker state while retaining enough tombstone truth to classify late
retries and prevent ABA/reselection authority.

The three arms are naive delete-on-terminal, a deterministic retirement-tombstone fixture, and the
real built Aegis hook public API. Machine-owned exact lifecycle outcomes judge success; no LLM does.
The 16 frozen scenarios, metrics, thresholds, holdout discipline, ownership boundary and exact
baseline/post-fix commands are in Spec 53. The holdout seed is reserved and unused.

**Status:** pre-registered; no baseline result observed yet.

## Result

Baseline `dsrt-muglbjj3` against Aegis `942e7be0c34d28c56d4833c64279bcc20d263d68`
was reproducibly red: retirement failure detection `0`, unsafe authority restoration `1`, exact
accuracy `0`, and public retirement API availability `0`; the fixture was fully green.

Aegis `b287816a0734e2590fc1371186f5fcfd647318c9` adds exact terminal-bound atomic retirement,
validated retained tombstones, late resolve classification, and late begin/ABA blocking. The same
frozen scenarios reran against merged Aegis `403727c` as `dsrt-muglrcuu`: detection `1`, authority
restoration `0`, accuracy/API `1`, and every secondary metric `1`. The earlier `dsrt-mugleqyl`
trace is superseded: it ran patched uncommitted source while its metadata still reported baseline
HEAD, so it is not used by the RT-38 claim.
