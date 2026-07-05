import { appendFileSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { RunRecord, TraceEvent } from '../types.js';

/**
 * Append-only JSONL event log for a single run. One TraceEvent per line.
 * Writes are synchronous so the trace survives a crash mid-run.
 */
export class TraceWriter {
  readonly filePath: string;
  readonly runId: string;
  readonly experiment: string;
  readonly startedAt: number;
  #events: TraceEvent[] = [];
  #closed = false;

  constructor(filePath: string, opts: { runId?: string; experiment?: string } = {}) {
    this.filePath = filePath;
    this.runId = opts.runId ?? `run-${Date.now().toString(36)}`;
    this.experiment = opts.experiment ?? 'unknown';
    this.startedAt = Date.now();
    writeFileSync(filePath, '');
  }

  append(event: TraceEvent): void {
    if (this.#closed) throw new Error(`TraceWriter for ${this.filePath} is closed`);
    this.#events.push(event);
    appendFileSync(this.filePath, JSON.stringify(event) + '\n');
  }

  /** In-memory view of everything written so far, as a RunRecord for scoring. */
  toRunRecord(): RunRecord {
    const record: RunRecord = {
      runId: this.runId,
      experiment: this.experiment,
      events: [...this.#events],
      startedAt: this.startedAt,
    };
    if (this.#closed) record.endedAt = Date.now();
    return record;
  }

  close(): void {
    this.#closed = true;
  }
}

const EVENT_TYPES = new Set(['spawn', 'message', 'score', 'kill']);

function parseTraceLine(line: string, lineNo: number): TraceEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`Invalid JSON on trace line ${lineNo}`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('t' in parsed) ||
    typeof (parsed as { t: unknown }).t !== 'string' ||
    !EVENT_TYPES.has((parsed as { t: string }).t) ||
    !('ts' in parsed) ||
    typeof (parsed as { ts: unknown }).ts !== 'number'
  ) {
    throw new Error(`Not a TraceEvent on trace line ${lineNo}`);
  }
  return parsed as TraceEvent;
}

/** Stream a JSONL trace file back as TraceEvents, in write order. */
export async function* replay(traceFile: string): AsyncIterable<TraceEvent> {
  const rl = createInterface({
    input: createReadStream(traceFile, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (line.trim() === '') continue;
    yield parseTraceLine(line, lineNo);
  }
}

/** Convenience: replay a full trace file into a RunRecord. */
export async function readRunRecord(
  traceFile: string,
  opts: { runId?: string; experiment?: string } = {},
): Promise<RunRecord> {
  const events: TraceEvent[] = [];
  for await (const event of replay(traceFile)) events.push(event);
  const first = events[0];
  const last = events[events.length - 1];
  const record: RunRecord = {
    runId: opts.runId ?? 'replayed',
    experiment: opts.experiment ?? 'unknown',
    events,
    startedAt: first?.ts ?? 0,
  };
  if (last) record.endedAt = last.ts;
  return record;
}
