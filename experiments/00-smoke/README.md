# 00-smoke — substrate proof

> Faculty under test: core substrate (spawn, bus, score, trace)

The trivial experiment that proves `core/` works end to end. It spawns two agents
(alice and bob), passes one greeting message across the bus, scores delivery, and
kills both agents — writing every event to a JSONL trace that `replay()` reads back.

## What it tests

Not a faculty per se — this is the wind tunnel's calibration run. If the smoke trace
is valid and replayable, every downstream experiment can trust spawn/bus/score/trace.

## Observed

Two spawns, one delivered message, `{ messages: 1, delivered: 1 }`, two kills.
Deterministic, boring, green — exactly what a smoke test should be.

## Run it

```sh
npm run smoke   # from the repo root
```

Traces land in `runs/*.jsonl`.
