# Exp66 — Loader regex-probe preemption

Pre-registered [Spec72](../../specs/72-loader-probe-preemption.md) before implementation/baseline. New question: can the loader's own synchronous ReDoS check hang before it inspects its timer? Native Node ESM harness, real public Aegis artifact, child-process watchdog protecting the experiment only. Frozen19 scenarios,5 real substring controls, no LLM judge. Commands/thresholds/ownership/limitations in spec; traces and results will be recorded without rewriting red.

## RT56 — Loader regex-probe preemption (exp66 / Spec72, 2026-10-18)

Pre-registration `632df6b424123cb000dd83f4f918c213b654a7f3` preceded harness implementation and
output; harness `d98b0cbe05562b05e12bdacd6f79d336ced7aea3` froze19 scenarios and5 substring controls.
New failure boundary: the loader's own synchronous regex probe can block before
its elapsed-time check executes. Not receipt honesty/recall replay, rule ownership,
compiled-cache binding or in-flight config drift. Original queue is already built.

Real origin/main Aegis `f73ce63d5ab1f389fbda3465916bcba2afb4b117`,
`lpp-mvevxxcc-75248` / `lpp-mvevy3zp-75313`: **5/5** hazard children watchdog-killed after1500ms,
**0/5** bound ReDoS rejections, **12/19** total correct, **12/14** controls,
**5/5** literal substring controls. Repeated deterministic outcomes identical;
raw timestamps differ. Invalid budgets0/-1 were genuine additional safe-pattern
rejections, not fixture errors. Both red traces preserved, no thresholds moved.

Runtime `528438cc279623e5c57fa3c5b6f8375b3c7109fc` runs a fixed probe script with primitive
pattern/flags/text inside an interruptible V8 context; synchronous API, whole-pack
refusal and RulePackError identities preserved. Invalid env values use default25ms.
Frozen candidate `db899177bea17b15f814c5a7ccd7e605a01bb112`, `lpp-mvew4ef8-93479`: **19/19** + **5/5**, zero watchdog,
all5 hazards return exact typed errors and subsequent safe load works. Focused public
artifact tests8red10pass→18green. Complete source/dist manifests, frozen harness,
trace hashes and machine oracles in receipts.json. Fresh live run independently
checked against actual files; verifier rejects15 tampers and accepts positive.

Regression-only: full build/typecheck/release **1185 tests** (628+190+22+86+203+56),
evidence52/52; SwarmLab core build/forced typecheck + native ESM syntax +
verify:evidence51claims111traces1022assertions. One intermediate release failed a
stale explicit catalogue count51→52 (corrected); another **falsely rejected safe
builtin secrets.openai-key.bash at25ms under parallel test load**. Focused hook and
subsequent full release passed unchanged. This new wall-clock compatibility risk
is unresolved; green rerun does NOT erase red. **Aegis PR72 held from automatic
merge**, even if CI passes. Linked SwarmLab CI runs frozen design against pinned
real package, not merely stored scores. Remote CI unobserved at this write.

Scope: finite loader probes only. Native runtime evaluate still has no general
regex deadline. No general ReDoS safety proof, sandbox guarantee, arbitrary pack
resource bound, production certification or tuned holdout claim. No .acr changes;
Territory untouched. Existing dirty primary checkouts untouched. Prior pending
experiments remain separate. Next new hypothesis: patterns absent from the finite
probe alphabet may load but block runtime evaluation; pre-register a separate
bounded evaluation watchdog/host-input contract before testing, not tonight.

Aegis: https://github.com/heybeaux/aegis/pull/72. SwarmLab paired PR recorded below once opened.

Paired SwarmLab PR: https://github.com/heybeaux/swarmlab/pull/56. Aegis release CI https://github.com/heybeaux/aegis/actions/runs/39212271270 observed SUCCESS at db899177; independent wall-clock compatibility merge hold remains.


### Same-experiment observable evidence audit

An independent interface check found the live verifier accepted late returns,
missing/future/stale clocks, a retagged score event and contradictory result-log
metadata. These are **evidence-gate gaps**, not another nightly experiment or a
new Aegis runtime improvement. The verifier now enforces ordered run/event/child
timestamps, actual return strictly before the frozen1500ms watchdog, exact score/
scenario envelopes and full result-log/trace metadata agreement. All existing
frozen harness/spec/scenarios/thresholds/receipts/traces are byte-identical.
Added18 tamper negatives to the existing15: **33 rejected + positive accepted**.
No threshold adjustment, whitelist or retry hides the safe-builtin timing failure.
**PR72/PR56 remain held, not merged**, despite local/remote green.
