import type { RepoState, Scenario, TaskPlan, ValidationResult } from './types.js';

export const SEED = process.env.MERGE_RACE_SEED ?? 'merge-race-v1';

function plan(mode: TaskPlan['mode'], summary: string, patches: TaskPlan['patches']): TaskPlan {
  return { mode, summary, patches };
}

function cloneFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content]));
}

function countMatches(files: Record<string, string>, needle: string): number {
  return Object.values(files).reduce((total, content) => total + content.split(needle).length - 1, 0);
}

function parseRuntimeConfig(state: RepoState): { maxRetries: number; timeoutMs: number } | null {
  const raw = state.files['config/runtime.json'];
  if (state.unresolvedConflict || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as { maxRetries?: unknown; timeoutMs?: unknown };
    if (typeof parsed.maxRetries !== 'number' || typeof parsed.timeoutMs !== 'number') return null;
    return { maxRetries: parsed.maxRetries, timeoutMs: parsed.timeoutMs };
  } catch {
    return null;
  }
}

function validateDocs(state: RepoState): ValidationResult {
  return {
    visibleBuildPass: !state.unresolvedConflict,
    hiddenInvariantPass: !state.unresolvedConflict,
    duplicateIntent: false,
    summary: 'Unrelated docs edits stay green.',
  };
}

function validateConfigConflict(state: RepoState): ValidationResult {
  const config = parseRuntimeConfig(state);
  const visibleBuildPass = config !== null;
  const hiddenInvariantPass =
    config !== null && config.maxRetries === 5 && config.timeoutMs === 1500;
  return {
    visibleBuildPass,
    hiddenInvariantPass,
    duplicateIntent: false,
    summary:
      config === null
        ? 'Runtime config remained in conflict or invalid JSON.'
        : `runtime=${config.maxRetries}/${config.timeoutMs}`,
  };
}

function validateApiCaller(state: RepoState): ValidationResult {
  if (state.unresolvedConflict) {
    return {
      visibleBuildPass: false,
      hiddenInvariantPass: false,
      duplicateIntent: false,
      summary: 'Repo stayed in conflict.',
    };
  }

  const receipt = state.files['src/receipt.js'] ?? '';
  const usesObjectApi = receipt.includes('input.status') && receipt.includes('input.locale');
  const oldCallPresent = Object.entries(state.files)
    .filter(([path]) => path.endsWith('.js'))
    .some(([, content]) => content.includes("formatReceipt('"));

  const visibleBuildPass = usesObjectApi ? !oldCallPresent : true;
  return {
    visibleBuildPass,
    hiddenInvariantPass: visibleBuildPass,
    duplicateIntent: false,
    summary: usesObjectApi
      ? oldCallPresent
        ? 'Old formatReceipt call remained after API drift.'
        : 'All call sites refreshed to object API.'
      : 'Legacy API still active.',
  };
}

function validateWebhookRegistration(state: RepoState): ValidationResult {
  const registrations = countMatches(state.files, 'registerInvoiceWebhook();');
  return {
    visibleBuildPass: !state.unresolvedConflict,
    hiddenInvariantPass: !state.unresolvedConflict && registrations === 1,
    duplicateIntent: state.landedIntents.filter((intent) => intent === 'invoice-webhook').length > 1,
    summary: `invoiceWebhookRegistrations=${registrations}`,
  };
}

function validateBatchInvariant(state: RepoState): ValidationResult {
  if (state.unresolvedConflict) {
    return {
      visibleBuildPass: false,
      hiddenInvariantPass: false,
      duplicateIntent: false,
      summary: 'Repo stayed in conflict.',
    };
  }

  const limits = state.files['src/limits.js'] ?? '';
  const nightly = state.files['src/nightly.js'] ?? '';
  const maxMatch = limits.match(/MAX_BATCH = (\d+)/);
  const maxBatch = maxMatch ? Number(maxMatch[1]) : NaN;
  const hardcodedBatch = nightly.match(/runNightly\((\d+)\)/);
  const usesSharedConstant = nightly.includes('runNightly(MAX_BATCH)');
  const visibleBuildPass = Number.isFinite(maxBatch);
  const hiddenInvariantPass =
    visibleBuildPass &&
    ((usesSharedConstant && maxBatch === 200) ||
      (hardcodedBatch !== null && Number(hardcodedBatch[1]) <= maxBatch));

  return {
    visibleBuildPass,
    hiddenInvariantPass,
    duplicateIntent: false,
    summary: usesSharedConstant
      ? `runner uses MAX_BATCH=${maxBatch}`
      : `runner hardcodes ${hardcodedBatch?.[1] ?? 'missing'} against MAX_BATCH=${maxBatch}`,
  };
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'clean-parallel-docs',
    task: 'Land two unrelated docs updates in parallel.',
    overlapClass: 'none',
    branchFreshness: 'current',
    verificationCoverageAtRisk: 'none',
    clean: true,
    baseFiles: cloneFiles({
      'README.md': '# Receipt Runner\nShips nightly receipts safely.\n',
      'docs/release.md': 'Run npm test before release.\n',
    }),
    first: {
      id: 'docs-readme',
      intentId: 'readme-copy',
      label: 'Refresh the README tagline.',
      invariantTags: [],
      naive: plan('apply', 'update README tagline', [
        {
          path: 'README.md',
          before: '# Receipt Runner\nShips nightly receipts safely.\n',
          after: '# Receipt Runner\nShips nightly receipts with verified receipts.\n',
        },
      ]),
    },
    second: {
      id: 'docs-release',
      intentId: 'release-doc',
      label: 'Clarify release steps.',
      invariantTags: [],
      naive: plan('apply', 'update release docs', [
        {
          path: 'docs/release.md',
          before: 'Run npm test before release.\n',
          after: 'Run npm test and npm run verify:evidence before release.\n',
        },
      ]),
    },
    notes: 'Safe control: no overlap, no stale branch, no hidden invariant risk.',
    validate: validateDocs,
  },
  {
    id: 'same-line-config-conflict',
    task: 'Merge two config edits that can coexist semantically but collide textually.',
    overlapClass: 'text_conflict',
    branchFreshness: 'current',
    verificationCoverageAtRisk: 'none',
    clean: false,
    baseFiles: cloneFiles({
      'config/runtime.json': '{"maxRetries":3,"timeoutMs":1000}\n',
    }),
    first: {
      id: 'config-retries',
      intentId: 'raise-retries',
      label: 'Raise max retries to 5.',
      invariantTags: ['runtime-config'],
      naive: plan('apply', 'raise retries', [
        {
          path: 'config/runtime.json',
          before: '{"maxRetries":3,"timeoutMs":1000}\n',
          after: '{"maxRetries":5,"timeoutMs":1000}\n',
        },
      ]),
    },
    second: {
      id: 'config-timeout',
      intentId: 'raise-timeout',
      label: 'Raise timeout to 1500ms.',
      invariantTags: ['runtime-config'],
      naive: plan('apply', 'raise timeout from stale base', [
        {
          path: 'config/runtime.json',
          before: '{"maxRetries":3,"timeoutMs":1000}\n',
          after: '{"maxRetries":3,"timeoutMs":1500}\n',
        },
      ]),
      refreshed: plan('apply', 'raise timeout on refreshed config', [
        {
          path: 'config/runtime.json',
          before: '{"maxRetries":5,"timeoutMs":1000}\n',
          after: '{"maxRetries":5,"timeoutMs":1500}\n',
        },
      ]),
      reviewed: plan('apply', 'same as refreshed after coordination', [
        {
          path: 'config/runtime.json',
          before: '{"maxRetries":5,"timeoutMs":1000}\n',
          after: '{"maxRetries":5,"timeoutMs":1500}\n',
        },
      ]),
    },
    notes: 'File locks or a queue fix this cheaply; raw parallel merge does not.',
    validate: validateConfigConflict,
  },
  {
    id: 'stale-api-caller',
    task: 'Merge a stale new call site after the exported API changed upstream.',
    overlapClass: 'api_drift',
    branchFreshness: 'stale',
    verificationCoverageAtRisk: 'visible',
    clean: false,
    baseFiles: cloneFiles({
      'src/receipt.js':
        "export function formatReceipt(status, id) {\n  return `${status}:${id}`;\n}\n",
      'src/main.js':
        "import { formatReceipt } from './receipt.js';\nexport const preview = formatReceipt('sent', 'r1');\n",
    }),
    first: {
      id: 'api-upgrade',
      intentId: 'receipt-api-v2',
      label: 'Upgrade formatReceipt to object input.',
      invariantTags: ['receipt-api'],
      naive: plan('apply', 'upgrade exported API', [
        {
          path: 'src/receipt.js',
          before: "export function formatReceipt(status, id) {\n  return `${status}:${id}`;\n}\n",
          after:
            "export function formatReceipt(input) {\n  return `${input.status}:${input.id}:${input.locale}`;\n}\n",
        },
        {
          path: 'src/main.js',
          before:
            "import { formatReceipt } from './receipt.js';\nexport const preview = formatReceipt('sent', 'r1');\n",
          after:
            "import { formatReceipt } from './receipt.js';\nexport const preview = formatReceipt({ status: 'sent', id: 'r1', locale: 'en-US' });\n",
        },
      ]),
    },
    second: {
      id: 'worker-caller',
      intentId: 'worker-preview',
      label: 'Add a worker call site.',
      invariantTags: ['receipt-api'],
      naive: plan('apply', 'add stale call site', [
        {
          path: 'src/worker.js',
          after:
            "import { formatReceipt } from './receipt.js';\nexport const workerPreview = formatReceipt('queued', 'r2');\n",
        },
      ]),
      refreshed: plan('apply', 'refresh caller to new API', [
        {
          path: 'src/worker.js',
          after:
            "import { formatReceipt } from './receipt.js';\nexport const workerPreview = formatReceipt({ status: 'queued', id: 'r2', locale: 'en-US' });\n",
        },
      ]),
      reviewed: plan('apply', 'same as refreshed after queued merge', [
        {
          path: 'src/worker.js',
          after:
            "import { formatReceipt } from './receipt.js';\nexport const workerPreview = formatReceipt({ status: 'queued', id: 'r2', locale: 'en-US' });\n",
        },
      ]),
    },
    notes: 'Different files avoid a Git conflict, but the stale branch still breaks the repo.',
    validate: validateApiCaller,
  },
  {
    id: 'duplicate-webhook-registration',
    task: 'Prevent two agents from landing the same webhook registration twice.',
    overlapClass: 'duplicate_intent',
    branchFreshness: 'current',
    verificationCoverageAtRisk: 'visible',
    clean: false,
    baseFiles: cloneFiles({
      'src/shared.js':
        'export function registerInvoiceWebhook() {\n  return "invoice-webhook-registered";\n}\n',
      'src/server.js': "export function bootServer() {\n  return 'server-ready';\n}\n",
      'src/bootstrap.js': "export function bootBootstrap() {\n  return 'bootstrap-ready';\n}\n",
    }),
    first: {
      id: 'server-webhook',
      intentId: 'invoice-webhook',
      label: 'Register the invoice webhook in the server boot path.',
      invariantTags: ['invoice-webhook'],
      naive: plan('apply', 'register webhook from server path', [
        {
          path: 'src/server.js',
          before: "export function bootServer() {\n  return 'server-ready';\n}\n",
          after:
            "import { registerInvoiceWebhook } from './shared.js';\nexport function bootServer() {\n  registerInvoiceWebhook();\n  return 'server-ready';\n}\n",
        },
      ]),
    },
    second: {
      id: 'bootstrap-webhook',
      intentId: 'invoice-webhook',
      label: 'Register the same webhook in the bootstrap path.',
      invariantTags: ['invoice-webhook'],
      naive: plan('apply', 'duplicate webhook registration', [
        {
          path: 'src/bootstrap.js',
          before: "export function bootBootstrap() {\n  return 'bootstrap-ready';\n}\n",
          after:
            "import { registerInvoiceWebhook } from './shared.js';\nexport function bootBootstrap() {\n  registerInvoiceWebhook();\n  return 'bootstrap-ready';\n}\n",
        },
      ]),
      refreshed: plan('apply', 'merge queue still lands duplicate intent', [
        {
          path: 'src/bootstrap.js',
          before: "export function bootBootstrap() {\n  return 'bootstrap-ready';\n}\n",
          after:
            "import { registerInvoiceWebhook } from './shared.js';\nexport function bootBootstrap() {\n  registerInvoiceWebhook();\n  return 'bootstrap-ready';\n}\n",
        },
      ]),
      reviewed: plan('skip', 'skip duplicate intent after lease/ledger review', []),
    },
    notes: 'Build stays green while the side effect lands twice unless intent is deduped.',
    validate: validateWebhookRegistration,
  },
  {
    id: 'shared-batch-invariant',
    task: 'Catch a stale runner that violates a lowered shared batch invariant.',
    overlapClass: 'shared_invariant',
    branchFreshness: 'stale',
    verificationCoverageAtRisk: 'visible',
    clean: false,
    baseFiles: cloneFiles({
      'src/limits.js': 'export const MAX_BATCH = 500;\n',
      'src/sync.js':
        "import { MAX_BATCH } from './limits.js';\nexport function runNightly(size) {\n  return size <= MAX_BATCH;\n}\n",
    }),
    first: {
      id: 'lower-batch-limit',
      intentId: 'lower-batch-limit',
      label: 'Lower the shared batch limit to 200.',
      invariantTags: ['batch-limit'],
      naive: plan('apply', 'lower max batch', [
        {
          path: 'src/limits.js',
          before: 'export const MAX_BATCH = 500;\n',
          after: 'export const MAX_BATCH = 200;\n',
        },
      ]),
    },
    second: {
      id: 'nightly-runner',
      intentId: 'nightly-runner',
      label: 'Add a nightly runner using the old 500-item assumption.',
      invariantTags: ['batch-limit'],
      naive: plan('apply', 'add stale hardcoded runner', [
        {
          path: 'src/nightly.js',
          after:
            "import { runNightly } from './sync.js';\nexport const nightlyOk = runNightly(500);\n",
        },
      ]),
      refreshed: plan('apply', 'refresh branch but still keep hardcoded stale assumption', [
        {
          path: 'src/nightly.js',
          after:
            "import { runNightly } from './sync.js';\nexport const nightlyOk = runNightly(500);\n",
        },
      ]),
      reviewed: plan('apply', 'bind runner to shared invariant after semantic review', [
        {
          path: 'src/nightly.js',
          after:
            "import { MAX_BATCH } from './limits.js';\nimport { runNightly } from './sync.js';\nexport const nightlyOk = runNightly(MAX_BATCH);\n",
        },
      ]),
    },
    notes: 'Visible tests stay green; only invariant-aware review notices the stale 500-item runner.',
    validate: validateBatchInvariant,
  },
];
