# Architecture Research: v1.2 Monitoring & Observability

**Domain:** Vercel serverless webhook receiver + Sentry monitoring integration for existing GitHub Actions CI/CD system
**Researched:** 2026-03-03
**Confidence:** HIGH (Vercel official docs, Sentry official docs, GitHub webhook docs, existing codebase analysis)

## Existing Architecture (Context)

Before introducing new components, here is what already exists:

```
EXISTING v1.1 ARCHITECTURE
===========================

Per-Repo Callers (14 repos)          Central Repo (auto-fix-agent)
┌─────────────────────────┐          ┌──────────────────────────────────┐
│ auto-fix-caller.yml     │─────────>│ auto-fix.yml (reusable workflow) │
│ promote-caller.yml      │─────────>│ promote.yml  (reusable workflow) │
│  (15 lines each)        │          │                                  │
└─────────────────────────┘          │ scripts/                         │
                                     │   sanitize-logs.sh               │
CI fails -> workflow_run ->          │   validate-diff.sh               │
  caller -> reusable workflow ->     │   record-metrics.sh              │
    agent -> fix PR                  │   check-budget.sh                │
                                     │   deploy-callers.sh              │
                                     │                                  │
                                     │ config/                          │
                                     │   repo-stack-map.json            │
                                     │   pricing.json                   │
                                     │                                  │
                                     │ metrics/                         │
                                     │   runs.json   (append-only log)  │
                                     │                                  │
                                     │ prompts/                         │
                                     │   typescript.md                  │
                                     │   python.md                      │
                                     │   kotlin.md                      │
                                     └──────────────────────────────────┘
```

**Key characteristic:** Everything currently runs inside GitHub Actions. No server. Metrics are committed to a JSON file in the repo via git push. Budget alerts are GitHub Issues.

## v1.2 Target Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         GITHUB EVENTS (sources)                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐     │
│  │  workflow_run   │  │  pull_request     │  │  pull_request_review     │     │
│  │  (completed)    │  │  (opened/closed/  │  │  (submitted)             │     │
│  │                 │  │   merged)         │  │                          │     │
│  └────────┬───────┘  └────────┬──────────┘  └──────────┬───────────────┘     │
└───────────┼───────────────────┼────────────────────────┼─────────────────────┘
            │                   │                        │
            └───────────────────┼────────────────────────┘
                                │ GitHub Webhook (HTTP POST)
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS FUNCTION (NEW)                           │
│                                                                              │
│  api/webhook.ts                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  1. Verify X-Hub-Signature-256 (HMAC-SHA256)                          │  │
│  │  2. Parse X-GitHub-Event header -> route to handler                   │  │
│  │  3. Extract structured data from payload                              │  │
│  │  4. Emit to Sentry (spans, metrics, check-ins)                        │  │
│  │  5. Return 200 OK                                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  api/_lib/                     (underscore = not a route)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  verify.ts   │ │  sentry.ts   │ │  handlers.ts │ │  types.ts    │       │
│  │  (HMAC       │ │  (init +     │ │  (event      │ │  (GitHub     │       │
│  │   verify)    │ │   helpers)   │ │   routing)   │ │   payloads)  │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ Sentry SDK calls
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SENTRY (SaaS)                                        │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Spans /     │  │  Custom     │  │  Cron        │  │  Alerts     │       │
│  │  Tracing     │  │  Metrics    │  │  Monitors    │  │             │       │
│  │  (per-run)   │  │  (counters, │  │  (per-repo   │  │  (budget,   │       │
│  │              │  │   gauges)   │  │   heartbeat) │  │   failures) │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         └────────────────┼────────────────┼────────────────┘               │
│                          ▼                ▼                                 │
│                    ┌───────────────────────────┐                            │
│                    │  Sentry Dashboard          │                            │
│                    │  - Operations health       │                            │
│                    │  - Value metrics           │                            │
│                    │  - Safety signals          │                            │
│                    │  - Artifact tracking       │                            │
│                    └───────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Changes, What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| `auto-fix.yml` | **UNCHANGED** | Continues to run fixes. No modification needed. |
| `promote.yml` | **UNCHANGED** | Continues to handle promotion. No modification needed. |
| Per-repo callers | **UNCHANGED** | Continue to trigger workflows. |
| `scripts/*.sh` | **UNCHANGED** | Bash scripts continue working. |
| `config/*.json` | **UNCHANGED** | repo-stack-map.json and pricing.json stay as-is. |
| `metrics/runs.json` | **UNCHANGED** | Git-committed metrics log stays (cheap backup). |
| `api/webhook.ts` | **NEW** | Vercel serverless function receiving GitHub webhooks. |
| `api/_lib/*.ts` | **NEW** | Shared utilities for the webhook handler. |
| `vercel.json` | **NEW** | Vercel project configuration. |
| `package.json` | **NEW** | Node.js dependencies for the Vercel function. |
| `tsconfig.json` | **NEW** | TypeScript configuration for api/ code. |
| GitHub Webhook config | **NEW** | Org-level webhooks pointing to Vercel URL. |
| Sentry project | **NEW** | Sentry project + DSN for the auto-fix-agent. |

**Critical design decision:** The Vercel function is a **passive observer**. It receives the same GitHub events that already trigger the existing workflows but does NOT interfere with them. The existing GitHub Actions pipeline is the source of truth for execution; the Vercel function is the source of truth for observability.

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `api/webhook.ts` | HTTP endpoint, signature verification, event routing | Vercel serverless function (TypeScript) |
| `api/_lib/verify.ts` | HMAC-SHA256 signature verification of GitHub payloads | `crypto.timingSafeEqual` with `X-Hub-Signature-256` |
| `api/_lib/sentry.ts` | Sentry SDK initialization and metric/span/check-in helpers | `@sentry/node` init + wrapper functions |
| `api/_lib/handlers.ts` | Per-event-type processing logic | Maps GitHub event types to Sentry telemetry |
| `api/_lib/types.ts` | TypeScript interfaces for GitHub webhook payloads | Typed payloads for `workflow_run`, `pull_request`, `pull_request_review` |
| Sentry Dashboard | Visualization of all monitoring data | Configured via Sentry web UI |

## Recommended Project Structure

```
auto-fix-agent/
├── .github/
│   └── workflows/
│       ├── auto-fix.yml                  # EXISTING - unchanged
│       ├── promote.yml                   # EXISTING - unchanged
│       ├── auto-fix-caller.example.yml   # EXISTING - unchanged
│       └── promote-caller.example.yml    # EXISTING - unchanged
├── api/                                  # NEW - Vercel serverless functions
│   ├── webhook.ts                        # Main webhook endpoint
│   └── _lib/                             # Shared code (underscore = not a route)
│       ├── verify.ts                     # GitHub HMAC signature verification
│       ├── sentry.ts                     # Sentry init + telemetry helpers
│       ├── handlers.ts                   # Event-type routing and processing
│       ├── types.ts                      # TypeScript interfaces for payloads
│       └── config.ts                     # Maps repo-stack-map data + constants
├── config/                               # EXISTING - unchanged
│   ├── repo-stack-map.json
│   └── pricing.json
├── metrics/                              # EXISTING - unchanged
│   └── runs.json
├── prompts/                              # EXISTING - unchanged
│   ├── typescript.md
│   ├── python.md
│   └── kotlin.md
├── scripts/                              # EXISTING - unchanged
│   ├── sanitize-logs.sh
│   ├── validate-diff.sh
│   ├── record-metrics.sh
│   ├── check-budget.sh
│   └── deploy-callers.sh
├── package.json                          # NEW - Vercel function dependencies
├── tsconfig.json                         # NEW - TypeScript config for api/
├── vercel.json                           # NEW - Vercel deployment config
├── ONBOARDING.md                         # EXISTING - unchanged
└── README.md                             # EXISTING - update with monitoring section
```

### Structure Rationale

- **`api/` at root:** Vercel convention. Every `.ts` file in `api/` becomes a route. Only `webhook.ts` should be a route.
- **`api/_lib/` with underscore prefix:** Vercel ignores underscore-prefixed directories for route generation. This keeps shared code co-located with the function without creating extra endpoints.
- **No framework (no Next.js):** The webhook receiver is a single endpoint. Adding Next.js would introduce unnecessary complexity. Plain Vercel serverless functions with `@vercel/node` types are sufficient.
- **Existing directories untouched:** The `scripts/`, `config/`, `metrics/`, `prompts/` directories continue working exactly as before. The Vercel function is additive.

## Architectural Patterns

### Pattern 1: Passive Observer (Event Tap)

**What:** The Vercel webhook function observes the same GitHub events that trigger the existing workflows but takes no action that affects the pipeline. It is a read-only tap on the event stream.

**When to use:** When adding observability to an existing system without risking disruption to the working pipeline.

**Trade-offs:**
- Pro: Zero risk to existing auto-fix pipeline. Can be deployed, broken, or taken down without affecting fixes.
- Pro: Can be developed and tested independently.
- Con: Slight data duplication (metrics in both `runs.json` and Sentry).
- Con: Cannot observe data internal to the workflow (e.g., token counts, agent execution details) -- only what GitHub exposes in webhook payloads.

**Example:**
```typescript
// api/webhook.ts - passive observer pattern
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySignature } from './_lib/verify';
import { handleEvent } from './_lib/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify GitHub webhook signature
  const isValid = verifySignature(req);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  // Process event (emit to Sentry) -- never modify GitHub state
  await handleEvent(event, payload);

  // Always return 200 quickly -- GitHub retries on non-2xx
  return res.status(200).json({ received: true });
}
```

### Pattern 2: Event-to-Telemetry Mapping

**What:** Each GitHub webhook event type maps to specific Sentry telemetry types. The mapping is explicit and exhaustive.

**When to use:** When translating domain events into observability signals.

**Trade-offs:**
- Pro: Clear, testable mapping from input events to output telemetry.
- Pro: Easy to extend with new event types.
- Con: Requires understanding both the GitHub webhook payload schema and Sentry's telemetry APIs.

**Event-to-Telemetry Map:**

| GitHub Event | Action/Condition | Sentry Telemetry | Metric/Monitor Name |
|-------------|------------------|-------------------|---------------------|
| `workflow_run` | `completed` + conclusion `failure` + auto-fix caller | `Sentry.startSpan` | `auto-fix.run` |
| `workflow_run` | `completed` + conclusion `success` + auto-fix caller | `Sentry.metrics.count` | `auto-fix.fix.success` |
| `workflow_run` | `completed` + conclusion `failure` + auto-fix caller | `Sentry.metrics.count` | `auto-fix.fix.failure` |
| `workflow_run` | any auto-fix run | `Sentry.captureCheckIn` | `auto-fix.{repo-slug}` (cron monitor) |
| `pull_request` | `opened` + label `auto-fix` | `Sentry.metrics.count` | `auto-fix.pr.opened` |
| `pull_request` | `closed` + merged + label `auto-fix` | `Sentry.metrics.count` | `auto-fix.pr.accepted` |
| `pull_request` | `closed` + NOT merged + label `auto-fix` | `Sentry.metrics.count` | `auto-fix.pr.rejected` |
| `pull_request_review` | `submitted` + state `changes_requested` | `Sentry.metrics.count` | `auto-fix.pr.changes_requested` |
| `pull_request_review` | `submitted` + state `approved` | `Sentry.metrics.count` | `auto-fix.pr.approved` |

**Example:**
```typescript
// api/_lib/handlers.ts
import * as Sentry from '@sentry/node';

export async function handleEvent(event: string, payload: any): Promise<void> {
  switch (event) {
    case 'workflow_run':
      return handleWorkflowRun(payload);
    case 'pull_request':
      return handlePullRequest(payload);
    case 'pull_request_review':
      return handlePullRequestReview(payload);
    default:
      // Ignore events we don't care about
      return;
  }
}

function handleWorkflowRun(payload: WorkflowRunPayload): void {
  // Only process auto-fix workflow runs
  if (!isAutoFixRun(payload)) return;

  const repo = payload.repository.full_name;
  const conclusion = payload.workflow_run.conclusion;
  const runId = payload.workflow_run.id;

  // Span for the entire run
  Sentry.startSpan(
    {
      name: `auto-fix.run`,
      op: 'auto-fix.workflow',
      attributes: {
        'repo': repo,
        'run_id': String(runId),
        'conclusion': conclusion,
        'branch': payload.workflow_run.head_branch,
      },
    },
    () => {
      // Counters
      if (conclusion === 'success') {
        Sentry.metrics.count('auto-fix.fix.success', 1, {
          attributes: { repo },
        });
      } else {
        Sentry.metrics.count('auto-fix.fix.failure', 1, {
          attributes: { repo },
        });
      }
    }
  );

  // Cron check-in for repo health monitoring
  Sentry.captureCheckIn({
    monitorSlug: `auto-fix-${slugify(repo)}`,
    status: conclusion === 'success' ? 'ok' : 'error',
  });
}
```

### Pattern 3: Signature-First Security Gate

**What:** Every incoming request is verified against the `X-Hub-Signature-256` header using HMAC-SHA256 with a shared secret before any processing occurs.

**When to use:** Always, for any webhook receiver exposed to the public internet.

**Trade-offs:**
- Pro: Prevents unauthorized payloads from being processed.
- Pro: Standard GitHub security pattern, well-documented.
- Con: Requires raw body access (Vercel provides this via `req.body` when content-type is `application/json`).

**Example:**
```typescript
// api/_lib/verify.ts
import crypto from 'crypto';
import type { VercelRequest } from '@vercel/node';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

export function verifySignature(req: VercelRequest): boolean {
  if (!WEBHOOK_SECRET) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return false;
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = `sha256=${hmac.update(body).digest('hex')}`;

  // Constant-time comparison to prevent timing attacks
  const sig = Buffer.from(signature, 'utf8');
  const dig = Buffer.from(digest, 'utf8');

  if (sig.length !== dig.length) return false;
  return crypto.timingSafeEqual(sig, dig);
}
```

## Data Flow

### Complete Event Flow (v1.2)

```
CI Failure on Repo X
    |
    ├──[existing path]──────────────────────────────────────────────────┐
    │                                                                    │
    ▼                                                                    │
workflow_run event                                                       │
    |                                                                    │
    ├──> Per-repo auto-fix-caller.yml                                   │
    │         |                                                          │
    │         └──> auto-fix.yml (central reusable)                      │
    │               ├── Circuit breaker                                 │
    │               ├── Flakiness filter                                │
    │               ├── Log sanitization                                │
    │               ├── Claude Code Action (agent)                      │
    │               ├── Diff validation                                 │
    │               ├── Fix PR creation                                 │
    │               └── record-metrics.sh -> metrics/runs.json          │
    │                                                                    │
    ├──[NEW path]───────────────────────────────────────────────────────┐
    │                                                                    │
    ▼                                                                    │
GitHub Webhook (org-level)                                               │
    |                                                                    │
    └──> Vercel: api/webhook.ts                                         │
           ├── Verify HMAC signature                                    │
           ├── Route by X-GitHub-Event                                  │
           └── Emit to Sentry:                                          │
                ├── Span: auto-fix.run (timing, outcome)                │
                ├── Metric: fix.success / fix.failure counter           │
                ├── Check-in: per-repo cron monitor                     │
                └── Attributes: repo, branch, run_id, conclusion       │
                                                                        │
                                                                        │
Fix PR Opened / Merged / Rejected                                       │
    |                                                                    │
    ├──[existing path]──> promote-caller.yml -> promote.yml             │
    │                                                                    │
    ├──[NEW path]───────> Vercel: api/webhook.ts                        │
           ├── Verify HMAC signature                                    │
           ├── Route: pull_request / pull_request_review                │
           └── Emit to Sentry:                                          │
                ├── Metric: pr.opened / pr.accepted / pr.rejected       │
                ├── Metric: pr.approved / pr.changes_requested          │
                └── Attributes: repo, pr_number, labels, author         │
```

### Key Data Flows

1. **Operations health flow:** `workflow_run.completed` -> webhook -> Sentry span + counters -> Dashboard "trigger frequency", "fix outcome distribution"
2. **Value metrics flow:** `pull_request.closed(merged)` with `auto-fix` label -> webhook -> Sentry counter `pr.accepted` -> Dashboard "PR acceptance rate"
3. **Safety monitoring flow:** `workflow_run` cost data (from run timing, estimated) -> webhook -> Sentry gauge -> Dashboard "budget burn rate"
4. **Repo health flow:** `workflow_run` per-repo -> webhook -> Sentry cron check-in -> Dashboard "repo health score" (based on fix success rate over time)
5. **Artifact flow:** `pull_request` lifecycle events -> webhook -> Sentry counters for each state transition -> Dashboard "PR lifecycle tracking"

### What the Webhook CANNOT Observe

The webhook receives GitHub event payloads, which do NOT include:
- **Token usage / cost data:** This is internal to the Claude API call inside the workflow. The `record-metrics.sh` script captures this into `runs.json`, but it is not in the webhook payload.
- **Agent reasoning / turn count:** Internal to Claude Code Action.
- **Diff validation results:** Internal to the workflow step.

**Implication:** For cost-per-fix and token metrics, the Sentry dashboard will need to use estimated values based on run duration, or a future enhancement could have `record-metrics.sh` call a second Vercel endpoint to push cost data directly. This is a known gap for v1.2.

## Integration Points

### External Services

| Service | Integration Pattern | Secrets Required | Notes |
|---------|---------------------|------------------|-------|
| GitHub (webhooks) | Org-level webhook -> Vercel URL | `GITHUB_WEBHOOK_SECRET` (shared secret) | Configure on github.com/organizations/settings/hooks |
| Sentry | `@sentry/node` SDK calls from webhook handler | `SENTRY_DSN` | Create project in Sentry dashboard first |
| Vercel | Deploy `api/` directory as serverless functions | Vercel account + project link | Connect repo to Vercel for auto-deploy |

### GitHub Webhook Configuration

Three organization-level webhooks (fbetancourtc, LiftitFinOps, Liftitapp) pointing to the same Vercel endpoint:

| Setting | Value |
|---------|-------|
| Payload URL | `https://auto-fix-agent.vercel.app/api/webhook` |
| Content type | `application/json` |
| Secret | Shared HMAC secret (stored in Vercel env vars) |
| Events | `workflow_run`, `pull_request`, `pull_request_review` |
| Active | Yes |

**Alternative:** Repository-level webhooks on each of the 14 repos. This is more granular but requires 14x configuration. Org-level is preferred -- fewer webhooks to manage, and the handler already filters by repo using `repo-stack-map.json`.

### Vercel Environment Variables

| Variable | Purpose | Environment |
|----------|---------|-------------|
| `GITHUB_WEBHOOK_SECRET` | HMAC signature verification | Production |
| `SENTRY_DSN` | Sentry project data source name | Production |
| `SENTRY_ENVIRONMENT` | Sentry environment tag (`production`) | Production |
| `NODE_ENV` | Runtime environment | Production |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| GitHub Actions <-> Vercel function | None (independent, parallel) | Both receive events, neither talks to the other |
| Vercel function -> Sentry | `@sentry/node` SDK over HTTPS | SDK handles batching, retries, rate limiting |
| `runs.json` <-> Sentry | None (independent data stores) | `runs.json` = git-committed backup; Sentry = real-time dashboards |
| `repo-stack-map.json` <-> Vercel function | Vercel function can read it at build time or import it | Used to identify which repos are monitored |

## Sentry Telemetry Design

### Spans (Tracing)

One span per auto-fix workflow run, capturing:

| Attribute | Source | Example |
|-----------|--------|---------|
| `repo` | `payload.repository.full_name` | `fbetancourtc/laundry-operating-dash` |
| `run_id` | `payload.workflow_run.id` | `12345678` |
| `conclusion` | `payload.workflow_run.conclusion` | `success` / `failure` |
| `branch` | `payload.workflow_run.head_branch` | `develop` |
| `workflow_name` | `payload.workflow_run.name` | `Auto Fix` |
| `duration_seconds` | Computed from `created_at` and `updated_at` | `180` |

### Metrics (Counters and Gauges)

| Metric Name | Type | Attributes | Purpose |
|-------------|------|------------|---------|
| `auto_fix.run.total` | counter | `repo`, `conclusion` | Total run count |
| `auto_fix.fix.success` | counter | `repo` | Successful fix count |
| `auto_fix.fix.failure` | counter | `repo` | Failed fix count |
| `auto_fix.fix.escalated` | counter | `repo` | Escalated to human count |
| `auto_fix.pr.opened` | counter | `repo` | Fix PRs opened |
| `auto_fix.pr.accepted` | counter | `repo` | Fix PRs merged |
| `auto_fix.pr.rejected` | counter | `repo` | Fix PRs closed without merge |
| `auto_fix.run.duration` | distribution | `repo` | Run duration in seconds |
| `auto_fix.estimated_cost` | distribution | `repo` | Estimated cost per run |

### Cron Monitors

One cron monitor per monitored repo. Purpose: detect if a repo stops getting auto-fix runs (system health). Not a traditional cron -- use Sentry's "heartbeat" monitor type with a generous window (e.g., 7 days) since CI failures are not on a schedule.

| Monitor Slug | Schedule | Margin | Max Runtime |
|-------------|----------|--------|-------------|
| `auto-fix-{repo-slug}` | Heartbeat (not cron) | 7 days | 30 minutes |

**Note:** Sentry cron monitors can use `captureCheckIn` with a heartbeat schedule. For repos with infrequent CI failures, set a wide margin (7+ days) to avoid false "missed" alerts. Alternatively, skip cron monitors for v1.2 MVP and use metric-based alerts instead.

### Alerts (Configured in Sentry UI)

| Alert | Condition | Action |
|-------|-----------|--------|
| High failure rate | `fix.failure` > 5 in 1 hour | Email notification |
| Budget burn | `estimated_cost` sum > $150 in rolling 30 days | Email notification |
| No activity | No `run.total` events for 7 days | Email notification |
| Escalation spike | `fix.escalated` > 3 in 24 hours | Email notification |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (14 repos, ~5-10 runs/day) | Single Vercel function, Sentry free tier likely sufficient |
| 50 repos, ~50 runs/day | Same architecture. Vercel free tier handles 100K invocations/month. Sentry Team plan for more events. |
| 200+ repos, ~500 runs/day | Consider Vercel Pro for longer execution times. Sentry Business plan. May need to sample spans (not metrics). |

### Scaling Priorities

1. **First bottleneck:** Sentry event quota. At high volume, span sampling (e.g., 10% of runs get full spans, all runs get metrics) preserves dashboards while reducing event count.
2. **Second bottleneck:** Vercel function cold starts under burst load. Mitigated by keeping the function lightweight (no heavy frameworks). The `@sentry/node` import is the heaviest dependency.

## Anti-Patterns

### Anti-Pattern 1: Webhook Handler Modifies GitHub State

**What people do:** Have the webhook handler create issues, comment on PRs, or trigger additional workflows.
**Why it's wrong:** Creates coupling between the observability layer and the execution layer. If the webhook handler has a bug, it can disrupt the auto-fix pipeline. Also creates authentication complexity (needs a GitHub token in addition to the webhook secret).
**Do this instead:** Keep the webhook handler read-only. It observes events and emits telemetry. The existing GitHub Actions workflows handle all mutations.

### Anti-Pattern 2: Duplicating Business Logic in the Webhook

**What people do:** Re-implement circuit breaker logic, retry counting, or budget checking in the webhook handler.
**Why it's wrong:** Creates two sources of truth for business rules. When the workflow logic changes, the webhook handler becomes stale.
**Do this instead:** The webhook handler should only classify and count events. Business logic stays in the GitHub Actions workflows and Bash scripts.

### Anti-Pattern 3: Synchronous Sentry Calls Blocking Response

**What people do:** Await Sentry flush before returning 200 to GitHub.
**Why it's wrong:** GitHub expects a quick response (< 10 seconds). If Sentry is slow, GitHub retries, causing duplicate events.
**Do this instead:** Fire-and-forget Sentry calls. Use `Sentry.flush(2000)` with a short timeout in a `finally` block, but return 200 immediately. Sentry SDK batches and sends asynchronously by default.

### Anti-Pattern 4: Using Next.js for a Single Endpoint

**What people do:** Create a full Next.js project for one webhook endpoint.
**Why it's wrong:** Massive dependency tree, slower cold starts, unnecessary complexity. The webhook is a single POST endpoint.
**Do this instead:** Use plain Vercel serverless functions with `@vercel/node` types. Zero framework overhead.

### Anti-Pattern 5: Storing State in the Webhook Function

**What people do:** Keep in-memory counters, rate-limit trackers, or caches in the function.
**Why it's wrong:** Serverless functions are ephemeral. State is lost between invocations. Under Vercel's Fluid Compute, instances may be reused but cannot be relied upon.
**Do this instead:** All state lives in Sentry (metrics, spans, check-ins). The function is stateless.

## Vercel Deployment Configuration

### vercel.json

```json
{
  "functions": {
    "api/webhook.ts": {
      "memory": 256,
      "maxDuration": 10
    }
  }
}
```

**Rationale:**
- **256 MB memory:** Sufficient for JSON parsing + Sentry SDK. No heavy computation.
- **10 second max duration:** Webhook processing should complete in < 2 seconds. 10s gives margin for Sentry flush.

### package.json (Minimal Dependencies)

```json
{
  "name": "auto-fix-agent-webhook",
  "private": true,
  "dependencies": {
    "@sentry/node": "^10.0.0"
  },
  "devDependencies": {
    "@vercel/node": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Only two runtime dependencies:** `@sentry/node` is the sole runtime dependency. `@vercel/node` is dev-only (types). This keeps the function bundle small and cold starts fast.

## Build Order (Dependency-Aware)

The following order respects dependencies -- each phase builds on the previous:

| Order | Component | Depends On | Rationale |
|-------|-----------|------------|-----------|
| 1 | `api/_lib/types.ts` | Nothing | TypeScript interfaces for GitHub payloads. Foundation for everything else. |
| 2 | `api/_lib/verify.ts` | `types.ts` | Signature verification. Security gate must be built before any handler logic. |
| 3 | `api/_lib/sentry.ts` | Nothing (Sentry SDK) | Sentry initialization and helper functions. Can be built in parallel with verify.ts. |
| 4 | `api/_lib/handlers.ts` | `types.ts`, `sentry.ts` | Event routing and telemetry emission. Core business logic of the webhook. |
| 5 | `api/webhook.ts` | `verify.ts`, `handlers.ts` | Main entry point. Wires together verification and handling. |
| 6 | `vercel.json` + `package.json` + `tsconfig.json` | All api/ files | Deployment configuration. Can be built in parallel with step 5. |
| 7 | Vercel deployment | All of the above | Deploy to Vercel, get the public URL. |
| 8 | GitHub webhook configuration | Vercel URL | Configure org-level webhooks pointing to the deployed URL. |
| 9 | Sentry dashboard configuration | Live data flowing | Create dashboards and alerts after events start flowing. |

### Suggested Phases for Roadmap

1. **Phase 1: Scaffold + Security** (steps 1-3) -- Types, verification, Sentry init. Deploy a stub that accepts webhooks and logs to Sentry.
2. **Phase 2: Event Processing** (steps 4-5) -- Full event handling. All telemetry emission.
3. **Phase 3: Deployment + Wiring** (steps 6-8) -- Vercel deploy, GitHub webhook config, end-to-end test.
4. **Phase 4: Dashboard + Alerts** (step 9) -- Sentry dashboard panels, alert rules, documentation.

## Sources

- [Vercel Serverless Functions Documentation](https://vercel.com/docs/functions) -- HIGH confidence
- [Vercel Project Configuration](https://vercel.com/docs/project-configuration) -- HIGH confidence
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables) -- HIGH confidence
- [GitHub Validating Webhook Deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HIGH confidence
- [GitHub Webhook Events and Payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) -- HIGH confidence
- [Sentry Node.js Custom Span Instrumentation](https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/custom-instrumentation/) -- HIGH confidence
- [Sentry Node.js Metrics](https://docs.sentry.io/platforms/javascript/guides/node/metrics/) -- HIGH confidence
- [Sentry Node.js Cron Monitoring](https://docs.sentry.io/platforms/javascript/guides/node/crons/) -- HIGH confidence
- [Sentry JavaScript SDK Releases](https://github.com/getsentry/sentry-javascript/releases) -- HIGH confidence
- [Hookdeck: Webhooks in Vercel Serverless Functions](https://hookdeck.com/webhooks/platforms/how-to-receive-and-replay-external-webhooks-in-vercel-serverless-functions) -- MEDIUM confidence
- [GitHub Webhook Signature Verification Gist](https://gist.github.com/stigok/57d075c1cf2a609cb758898c0b202428) -- MEDIUM confidence

---
*Architecture research for: v1.2 Monitoring & Observability (Vercel + Sentry integration)*
*Researched: 2026-03-03*
