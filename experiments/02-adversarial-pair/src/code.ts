/**
 * The artifact the coder owns. We model `solution.ts` as an ordered list of
 * guarded rules rather than a free-text blob, for two honest reasons:
 *
 *  1. It COMPILES to real behavior — `toClassifier()` returns an executable
 *     function the harness runs for real. No model ever claims a test outcome.
 *  2. It RENDERS to readable TypeScript source — `toSource()` gives the exact
 *     text stored in the trace, so the README and observatory show real code.
 *
 * The coder mutates this rule set; churn is measured on the rendered source.
 * A rule is a predicate over n plus the label it emits. Precedence is list
 * order with "later wins" (the coder can reorder / add / drop rules), which is
 * exactly the fragile-cargo dimension the oracle stresses.
 */

export type Guard =
  | { kind: 'div'; by: number }
  | { kind: 'divBoth'; a: number; b: number }
  | { kind: 'prime' }
  | { kind: 'neg' }
  | { kind: 'zero' }
  | { kind: 'eq'; value: number }
  | { kind: 'always' };

export interface Rule {
  guard: Guard;
  label: string;
}

/** A candidate implementation: ordered rules, later match wins. */
export interface CodeModel {
  rules: Rule[];
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) {
    if (n % d === 0) return false;
  }
  return true;
}

function guardMatches(g: Guard, n: number): boolean {
  switch (g.kind) {
    case 'div':
      return g.by !== 0 && n % g.by === 0;
    case 'divBoth':
      return g.a !== 0 && g.b !== 0 && n % g.a === 0 && n % g.b === 0;
    case 'prime':
      return isPrime(n);
    case 'neg':
      return n < 0;
    case 'zero':
      return n === 0;
    case 'eq':
      return n === g.value;
    case 'always':
      return true;
  }
}

/** Compile the rule set to a real, executable classifier (later match wins). */
export function toClassifier(model: CodeModel): (n: number) => string {
  const rules = model.rules;
  return (n: number): string => {
    let label = String(n);
    for (const rule of rules) {
      if (guardMatches(rule.guard, n)) label = rule.label;
    }
    return label;
  };
}

function guardSource(g: Guard): string {
  switch (g.kind) {
    case 'div':
      return `n % ${g.by} === 0`;
    case 'divBoth':
      return `n % ${g.a} === 0 && n % ${g.b} === 0`;
    case 'prime':
      return `isPrime(n)`;
    case 'neg':
      return `n < 0`;
    case 'zero':
      return `n === 0`;
    case 'eq':
      return `n === ${g.value}`;
    case 'always':
      return `true`;
  }
}

/** Render the rule set as readable TypeScript source (stored in the trace). */
export function toSource(model: CodeModel): string {
  const lines = ['export function classify(n: number): string {', '  let label = String(n);'];
  for (const rule of model.rules) {
    lines.push(`  if (${guardSource(rule.guard)}) label = ${JSON.stringify(rule.label)};`);
  }
  lines.push('  return label;', '}');
  return lines.join('\n');
}

/** The coder's naive starting point: common cases right, all edges wrong. */
export function initialCode(): CodeModel {
  return {
    rules: [
      { guard: { kind: 'div', by: 3 }, label: 'fizz' },
      { guard: { kind: 'div', by: 5 }, label: 'buzz' },
      { guard: { kind: 'divBoth', a: 3, b: 5 }, label: 'fizzbuzz' },
    ],
  };
}

export function cloneCode(model: CodeModel): CodeModel {
  return { rules: model.rules.map((r) => ({ guard: { ...r.guard }, label: r.label })) };
}
