# Spec 33 — Approval Provenance & Context Binding (exp-27)

> New experiment. Scope: `experiments/27-approval-provenance-context-binding/`. Tests whether an
> exact approval is consumable only by the actor/session/workspace/intent and authorization context
> the human actually approved.

## Question

When command text and the RT-17 prerequisite envelope are identical, can an approval granted for
one actor, session, workspace, task intent, or authorization state be replayed in another context?

## Why

RT-15 bound approval to an exact action. RT-16 bound resumed workflows to an exact step instance.
RT-17 bound approved retries to freshness and prerequisite state. None binds the authorization to
**who may consume it or where**. A globally stored one-shot approval whose id is derived only from
the call/evaluation can become a confused-deputy capability: a different agent session, user,
workspace, task, or revoked role can consume a still-fresh approval for identical bytes.

## Hypotheses

- **H-P1:** call-only approval storage will execute identical retries across actor/session/workspace,
  task-intent, and authorization-state boundaries.
- **H-P2:** current Aegis `origin/main` will reproduce this because its approval signature includes
  call/evaluation and RT-17 envelope fields but no approval provenance/context contract.
- **H-P3:** exact-session binding stops context replay but over-asks for an explicitly
  workspace-scoped approval consumed by a sibling session in the same workspace.
- **H-P4:** a scope-aware provenance binding that checks actor, workspace, task intent,
  authorization digest, and session only when the declared grant scope requires it will stop
  confused-deputy replay without taxing legitimate same-context or workspace-scoped retries.

## Deterministic setup

Every scenario runs a real Aegis hook `ask → approve → retry` sequence over the same risky command
and unchanged RT-17 approval envelope. The harness fixes grant-time provenance, retry-time
provenance, grant scope, and the machine-known safe action. No LLM judges success.

## Arms

1. `call-only` — exact call/evaluation/envelope matching only.
2. `actor-binding` — actor identity must match.
3. `exact-session-binding` — actor, workspace, task, authorization, and session must match.
4. `scope-aware-binding` — binding follows `exact_session` or `workspace` grant scope.
5. `aegis-wrapped` — real file-linked Aegis evaluator and hook approval store.

## Metrics

Primary: cross-actor execution rate, cross-session execution rate, cross-workspace execution rate,
cross-intent execution rate, revoked-authorization execution rate, provenance refresh coverage, and
provenance accuracy. Secondary: same-context re-ask rate, workspace-scope portability failure rate,
and initial ask coverage.

## Required stack recommendation

Add an approval-provenance contract to Aegis and its hook adapters: stable actor, session,
workspace, task-intent, authorization digest/epoch, and explicit grant scope. The approval store
must refuse consumption when a required binding differs, while preserving intentional
workspace-scoped portability.

## Deliverables

1. New exp-27 harness and pre/post traces.
2. SYNTHESIS RT-18 and JOURNAL entry.
3. Focused Aegis tests and evidence gate.
4. Linked SwarmLab and Aegis PRs when a reproducible red warrants the patch.

## Honesty rules

- Identical command/envelope bytes are not proof of identical authority.
- A blanket session binding that breaks declared workspace-scoped approval is not green.
- Aegis must be in the real approval-store path for the wrapped arm.
