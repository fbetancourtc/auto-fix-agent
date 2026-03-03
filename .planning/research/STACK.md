# Stack Research

**Domain:** AI-powered self-healing CI/CD system (centralized, cross-repo, cross-org)
**Researched:** 2026-03-03 (v1.2 additions), 2026-03-01 (v1.0/v1.1 core)
**Confidence:** HIGH (core action/workflow layer), HIGH (Vercel + Sentry Node SDK), MEDIUM (Sentry flush behavior in serverless)

---

## v1.2 Stack Additions: Monitoring & Observability

This section covers NEW technologies required for the v1.2 milestone. The existing v1.0/v1.1 stack (GitHub Actions, Claude Code Action, Bash scripts, JSON config) is validated and unchanged.

### Core v1.2 Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@sentry/node` | `^10.41` (v10.x) | Sentry SDK for the Vercel webhook receiver function — error capture, transactions, cron monitors, custom events | v10 is current stable (released 2026); v9 removed the metrics beta API; v10 is a minor upgrade from v9 (primarily OpenTelemetry v2 bump); `@sentry/node` is the correct package for plain Node.js serverless functions (NOT `@sentry/nextjs` which requires Next.js) |
| `@vercel/node` | `^5.6` | TypeScript types for Vercel serverless functions (`VercelRequest`, `VercelResponse`) | Zero-config TypeScript support on Vercel; dev dependency only (types are used at compile time, Vercel runtime provides the actual request/response objects); the only official typing package for Vercel Node.js functions |
| `@octokit/webhooks-methods` | `^6.0` | GitHub webhook HMAC-SHA256 signature verification | Lightweight (just `sign()`, `verify()`, `verifyWithFallback()`); no event routing overhead; 6.0 is current stable; official Octokit package maintained by GitHub; `verifyWithFallback()` supports key rotation for free |
| TypeScript | `^5.5` | Language for the webhook receiver (`api/webhook.ts`) | Type safety for webhook payloads and Sentry API calls; Vercel natively compiles TS in `api/` directory without build step; the existing project has no TypeScript but this is a self-contained module |
| Vercel (platform) | Free tier (Hobby) | Hosts the webhook receiver serverless function | Zero-config deployment from git push; free tier includes 100GB bandwidth, 100K function invocations/month (more than sufficient for ~30-70 webhook events/month); automatic HTTPS; no infrastructure to manage |

### Supporting v1.2 Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/webhooks-types` | `^7.6` | TypeScript type definitions for all GitHub webhook event payloads (`WorkflowRunEvent`, `PullRequestEvent`, `PullRequestReviewEvent`) | Dev dependency; provides compile-time safety for all webhook payloads; eliminates guessing at nested payload shapes like `event.workflow_run.conclusion` |
| `@octokit/rest` | `^22.0` | GitHub REST API client for creating `repository_dispatch` events from webhook receiver back to central repo | Only if the receiver needs to trigger GitHub Actions workflows; provides typed methods for `octokit.repos.createDispatchEvent()` |

### What This Changes in the Project

The auto-fix-agent repo transitions from **pure YAML/Shell/JSON** to **YAML/Shell/JSON + a TypeScript Vercel function**. This means:

1. **New files:** `api/webhook.ts`, `package.json`, `tsconfig.json`, `vercel.json`
2. **New deployment target:** Vercel (in addition to GitHub Actions)
3. **New runtime:** Node.js 20+ (Vercel serverless)
4. **New secret management:** Vercel environment variables for `SENTRY_DSN`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_TOKEN`

The existing GitHub Actions workflows, shell scripts, and JSON configs are **completely unchanged**.

---

## v1.2 Installation

```bash
# Initialize package.json in repo root (first time only)
npm init -y

# Core runtime dependencies
npm install @sentry/node@^10 @octokit/webhooks-methods@^6

# Dev dependencies (types only, not shipped to runtime)
npm install -D @vercel/node@^5 @octokit/webhooks-types@^7 typescript@^5.5

# Optional: GitHub API client (only if receiver creates repository_dispatch)
npm install @octokit/rest@^22
```

---

## v1.2 Function Architecture

### Vercel Serverless Function Setup

**File:** `api/webhook.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verify } from '@octokit/webhooks-methods';
import * as Sentry from '@sentry/node';

// Initialize Sentry ONCE at module scope (persists across warm invocations)
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 1.0,  // 100% — low volume, every event matters
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Get raw body for signature verification
  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body);

  // 2. Verify GitHub webhook signature
  const signature = req.headers['x-hub-signature-256'] as string;
  const isValid = await verify(
    process.env.GITHUB_WEBHOOK_SECRET!,
    rawBody,
    signature
  );

  if (!isValid) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // 3. Route by event type
  const event = req.headers['x-github-event'] as string;
  const payload = typeof req.body === 'string'
    ? JSON.parse(req.body)
    : req.body;

  await Sentry.startSpan(
    { name: `webhook.${event}`, op: 'webhook.process' },
    async (span) => {
      span.setAttribute('github.event', event);
      span.setAttribute('github.delivery', req.headers['x-github-delivery'] as string);
      // ... process event, send Sentry check-ins, etc.
    }
  );

  // 4. CRITICAL: Flush Sentry before responding
  await Sentry.flush(2000);  // 2s timeout

  res.status(200).json({ received: true });
}
```

### Vercel Configuration

**File:** `vercel.json`

```json
{
  "functions": {
    "api/webhook.ts": {
      "maxDuration": 10
    }
  }
}
```

**Rationale for configuration choices:**
- `maxDuration: 10` — Webhook processing is fast (parse, verify, send to Sentry). 10 seconds is generous. Hobby plan caps at 10s anyway; Pro plan allows up to 60s.
- No `memory` override — default 1024MB is more than sufficient for JSON processing.
- No `runtime` override — Vercel defaults to latest Node.js LTS (currently Node.js 24).

### TypeScript Configuration

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["api/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## Sentry API Patterns for v1.2

### Custom Spans (replaces deprecated metrics API)

The `Sentry.metrics.*` API (count, gauge, distribution) was **removed in SDK v9**. Custom measurements now use **span attributes** within `Sentry.startSpan()`:

```typescript
// Track fix outcomes as span attributes
await Sentry.startSpan(
  { name: 'auto-fix-run', op: 'ci.fix' },
  async (span) => {
    span.setAttribute('fix.repo', 'liftitapp/backend');
    span.setAttribute('fix.stack', 'typescript');
    span.setAttribute('fix.outcome', 'success');    // success | failure | escalation
    span.setAttribute('fix.duration_ms', 45200);
    span.setAttribute('fix.cost_usd', 0.23);
    span.setAttribute('fix.attempt', 1);
  }
);
```

### Cron Monitors (per-repo health)

Use `Sentry.withMonitor()` or `Sentry.captureCheckIn()` to track expected periodic activity per repo:

```typescript
// Option A: withMonitor wraps a callback
Sentry.withMonitor(
  'repo-liftitapp-backend',           // monitor slug
  () => { /* process webhook */ },
  {
    schedule: { type: 'interval', value: 24, unit: 'hour' },  // expect activity daily
    checkinMargin: 60,    // allow 60 min late before alert
    maxRuntime: 5,        // function should complete in 5 min
    timezone: 'America/Bogota',
  }
);

// Option B: manual check-ins for more control
const checkInId = Sentry.captureCheckIn({
  monitorSlug: 'repo-liftitapp-backend',
  status: 'in_progress',
});
// ... process ...
Sentry.captureCheckIn({
  checkInId,
  monitorSlug: 'repo-liftitapp-backend',
  status: 'ok',  // or 'error'
});
```

### Custom Events via captureMessage + Context

Since `Sentry.metrics.*` is gone, use `captureMessage()` with structured contexts for business events:

```typescript
Sentry.withScope((scope) => {
  scope.setContext('auto_fix_run', {
    repo: 'liftitapp/backend',
    outcome: 'success',
    pr_number: 142,
    duration_ms: 45200,
    cost_usd: 0.23,
    model: 'claude-sonnet-4-6',
  });
  scope.setTag('fix.outcome', 'success');
  scope.setTag('fix.repo', 'liftitapp/backend');
  scope.setLevel('info');
  Sentry.captureMessage('Auto-fix run completed');
});
```

### Flush in Serverless (CRITICAL)

Vercel serverless functions stop processing after the response is sent. Sentry sends events asynchronously, so you **must** flush before responding:

```typescript
// ALWAYS call before res.json() / res.send()
await Sentry.flush(2000);  // 2-second timeout
```

If you skip this, Sentry events will be silently dropped on cold starts and low-traffic functions.

---

## GitHub Webhook Signature Verification

### Why `@octokit/webhooks-methods` Over Raw Crypto

| Approach | Pros | Cons |
|----------|------|------|
| `@octokit/webhooks-methods` | Maintained by GitHub; handles SHA-256 correctly; `verifyWithFallback()` for key rotation; tiny package | One more dependency |
| Raw `crypto.timingSafeEqual` | No dependency | Easy to get wrong (encoding, timing attacks); no key rotation support; you'd reimplement what the library does |
| `@octokit/webhooks` (full) | Event routing, middleware, type-safe handlers | Overkill for a single endpoint; adds event routing you don't need |

**Decision:** Use `@octokit/webhooks-methods` because it is the minimal correct solution. The full `@octokit/webhooks` package (v14.2) adds event routing middleware that is unnecessary when you have a single handler function.

### Signature Verification Pattern

```typescript
import { verify } from '@octokit/webhooks-methods';

// The raw body must be the EXACT bytes GitHub signed
// Vercel auto-parses JSON bodies — reconstruct with JSON.stringify(req.body)
// or disable body parsing if exact byte-for-byte match is needed
const rawBody = JSON.stringify(req.body);
const signature = req.headers['x-hub-signature-256'] as string;

const isValid = await verify(
  process.env.GITHUB_WEBHOOK_SECRET!,
  rawBody,
  signature
);
```

**Body parsing caveat:** Vercel automatically parses JSON request bodies. GitHub signs the raw bytes. If Vercel's JSON parsing and re-serialization via `JSON.stringify()` produces different bytes (e.g., different whitespace, key ordering), verification will fail. In practice, `JSON.stringify(JSON.parse(original))` preserves key order in V8/Node.js, so this works. But if verification fails intermittently, the fix is to read the raw body using the Web API: `const rawBody = await request.text()` using the Edge runtime, or to set up a middleware that captures the raw buffer before parsing.

---

## v1.2 Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@sentry/node` v10 | `@sentry/node` v9 | v10 is current stable; v9 still works but will stop receiving patches; v10 upgrade is minimal (OpenTelemetry v2 internals, no API changes for our use case) |
| `@sentry/node` | `@sentry/nextjs` | We are NOT building a Next.js app; the webhook receiver is a plain Vercel serverless function; `@sentry/nextjs` adds Next.js-specific wrappers and build plugins that don't apply |
| `@sentry/node` | `@sentry/vercel-edge` | Does not exist as a package; Vercel edge functions use the Web API not Node.js; our function is a standard Node.js serverless function, not an edge function |
| `@octokit/webhooks-methods` | `@octokit/webhooks` (full) | Full package adds event emitter, middleware, routing — unnecessary for a single `POST /api/webhook` endpoint; methods-only is 95% smaller |
| `@octokit/webhooks-methods` | Raw `node:crypto` | Reimplementing HMAC-SHA256 verification invites timing-attack bugs and gains nothing; the official package is 4KB |
| Vercel Serverless (Node.js) | Vercel Edge Functions | Edge functions run in V8 isolates, not Node.js; `@sentry/node` requires Node.js APIs (`node:http`, `node:crypto`); edge runtime would require a different SDK or manual HTTP calls to Sentry |
| Vercel Free (Hobby) | AWS Lambda + API Gateway | Lambda requires IAM roles, API Gateway config, CloudFormation/SAM; Vercel is zero-config from git; at ~50 events/month, free tier is more than sufficient |
| Vercel Free (Hobby) | Cloudflare Workers | Workers run on V8 isolates (similar to Vercel Edge); would require Sentry's HTTP ingest API directly instead of SDK; adds complexity for no benefit at this scale |
| `Sentry.captureMessage()` + contexts | `Sentry.metrics.*` API | Metrics API was removed in SDK v9 (beta ended); `captureMessage()` with structured contexts and tags is the supported replacement for custom business events |
| Span attributes | `Sentry.setMeasurement()` | `setMeasurement()` is deprecated; span attributes via `span.setAttribute()` within `Sentry.startSpan()` is the current API |

---

## v1.2 What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Sentry.metrics.count()` / `Sentry.metrics.gauge()` / `Sentry.metrics.distribution()` | Removed in SDK v9 (metrics beta ended); calling these will throw a runtime error on v10 | `span.setAttribute()` inside `Sentry.startSpan()` for measurements; `Sentry.captureMessage()` with contexts for business events |
| `Sentry.setMeasurement()` | Deprecated; will be removed in a future version | `span.setAttribute()` inside `Sentry.startSpan()` |
| `@sentry/serverless` | Deprecated package; replaced by `@sentry/aws-serverless` for Lambda and `@sentry/node` for everything else | `@sentry/node` for Vercel serverless functions |
| `@sentry/nextjs` for the webhook receiver | Requires Next.js framework; adds build-time instrumentation, source map upload, and middleware that don't apply to a plain serverless function | `@sentry/node` — plain Node.js SDK |
| `@octokit/webhooks` v14 (full package) | Includes event emitter, middleware factory, and Node.js HTTP server creation — none of which are needed for a single Vercel handler | `@octokit/webhooks-methods` v6 (just verify/sign) + `@octokit/webhooks-types` v7 (just types) |
| Vercel Edge Runtime for this function | `@sentry/node` requires Node.js runtime; edge runtime uses V8 isolates without `node:crypto`, `node:http` | Default Vercel Serverless (Node.js runtime) |
| `micro` package for raw body access | Legacy pattern from Vercel's early days; modern Vercel functions can use `JSON.stringify(req.body)` or Web API `request.text()` | `JSON.stringify(req.body)` for signature verification |
| Storing webhook state in a database | The receiver is stateless; all state lives in Sentry (events, monitors, dashboards); adding a database adds operational complexity for no value at this scale | Sentry as the single data store; query via Sentry Discover or Dashboard widgets |

---

## v1.2 Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@sentry/node` v10 | Node.js 18.19+, 20.6+, 22+ | v10 upgraded OpenTelemetry to v2; requires Node.js ESM support for auto-instrumentation; Vercel runs Node.js 20+ or 24 LTS by default |
| `@sentry/node` v10 | Sentry self-hosted 24.4.2+ | Same compatibility as v9; SaaS Sentry always compatible |
| `@vercel/node` v5 | Vercel CLI v37+, Node.js 18+ | Dev dependency only — types for `VercelRequest`/`VercelResponse` |
| `@octokit/webhooks-methods` v6 | Node.js 18+ | Uses `node:crypto` for HMAC; pure ESM package |
| `@octokit/webhooks-types` v7 | TypeScript 5.0+ | Types-only package; no runtime code |
| TypeScript 5.5 | `@vercel/node` v5, `@sentry/node` v10 | Both packages ship `.d.ts` type definitions; full type coverage |
| Vercel Hobby plan | 100K invocations/month, 10s maxDuration | More than sufficient for ~50 webhook events/month; upgrade to Pro ($20/mo) only if maxDuration > 10s is needed |

---

## v1.2 Environment Variables

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `SENTRY_DSN` | Vercel project env vars | Sentry project DSN for the auto-fix-agent monitoring project |
| `GITHUB_WEBHOOK_SECRET` | Vercel project env vars + GitHub webhook config | Shared HMAC secret for verifying GitHub webhook signatures |
| `GITHUB_TOKEN` | Vercel project env vars (optional) | GitHub App or PAT for creating `repository_dispatch` events back to the central repo; only needed if receiver triggers workflows |
| `VERCEL_ENV` | Auto-set by Vercel | `production`, `preview`, or `development`; used in `Sentry.init({ environment })` |

**Security note:** All secrets are stored in Vercel's encrypted environment variables, never in code. The `GITHUB_WEBHOOK_SECRET` must match the secret configured in the GitHub webhook settings for the auto-fix-agent repo.

---

## v1.2 Cost Impact

| Service | Plan | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Vercel | Hobby (Free) | $0 | 100K invocations/month; ~50 webhook events/month uses 0.05% of quota |
| Sentry | Team | $26/month | Already budgeted in v1.1 research; required for webhooks, cron monitors, and alerts |
| npm packages | N/A | $0 | All open source |
| **Total new cost** | | **$0** | Vercel free tier + existing Sentry Team plan covers everything |

---

## Corrections to v1.1 Stack Research

The v1.1 research (2026-03-01) listed `@sentry/nextjs` at `9.x`. Two corrections:

1. **Version:** The current Sentry JS SDK is **v10.x** (v10.41.0 as of 2026-03-03). v9 is still supported but v10 is recommended. v10 is a minor upgrade focused on OpenTelemetry v2 internals.
2. **Package:** `@sentry/nextjs` is correct for the monitored Next.js repos. But for the NEW webhook receiver (a plain Vercel serverless function), use `@sentry/node` — not `@sentry/nextjs`.

---

## Existing v1.0/v1.1 Stack (Unchanged)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `anthropics/claude-code-action` | `@v1` (GA) | AI agent that reads CI logs, edits source code, opens PRs | Official Anthropic action on GitHub Marketplace; GA as of 2025; supports headless automation mode via `prompt:` input without `@claude` trigger; the only production-ready option in this space |
| GitHub Actions Reusable Workflows | Native (workflow_call) | Central `.github/workflows/` in `auto-fix-agent` repo that all 14 callers invoke with 15 lines | Eliminates prompt duplication; central update propagates to all repos; supported cross-org when central repo is **public** |
| `workflow_run` trigger | Native GitHub Actions | Fires when a watched CI workflow completes with `failure` conclusion | Purpose-built for this pattern; fires in the context of the central repo, not the failing repo |
| `repository_dispatch` event | Native GitHub Actions | External systems (Sentry, Crashlytics bridge) trigger fix workflows | Standard GitHub webhook-to-workflow bridge |
| `actions/create-github-app-token` | `@v2` | Generate GitHub App tokens with write access to target repos across orgs | The correct mechanism for cross-org repo write access |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` (current) | Default model for auto-fix runs | $3/$15 per MTok input/output; correct balance of reasoning capability and cost |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gh` CLI | Bundled in `ubuntu-latest` runners | Download CI job logs, create PRs, post comments | Always |
| `sentry-sdk[fastapi]` | `2.x` | Sentry instrumentation for Python/FastAPI backend | Python repos |
| `@sentry/nextjs` | `^10` (corrected from 9.x) | Sentry instrumentation for Next.js dashboard repos | TypeScript/Next.js repos |
| Firebase Cloud Functions | `firebase-functions` v5 | Bridge Crashlytics crash alerts to `repository_dispatch` | Android crash detection only |
| `nick-fields/retry` | `@v3` | Retry transient GitHub API calls in workflows | Any `gh api` or `curl` calls |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| CLAUDE.md (per-repo) | Stack conventions and scope boundaries for Claude | Place in each caller repo root |
| GitHub App (custom, single) | Cross-org identity for committing and PR creation | Install across all 3 orgs |
| `.github/workflows/auto-fix-caller.yml` | 15-line caller that invokes the central reusable workflow | Standard template per repo |

---

## Full Installation (v1.0 + v1.1 + v1.2)

```bash
# === v1.2 additions (webhook receiver) ===

# Initialize Node.js project in auto-fix-agent repo root
npm init -y

# Runtime dependencies
npm install @sentry/node@^10 @octokit/webhooks-methods@^6

# Dev dependencies (types)
npm install -D @vercel/node@^5 @octokit/webhooks-types@^7 typescript@^5.5

# Optional: GitHub API client for repository_dispatch
npm install @octokit/rest@^22

# === Existing (v1.0/v1.1 — no npm, pure YAML/Shell) ===

# Python repos: add to requirements.txt or pyproject.toml
# pip install sentry-sdk[fastapi]==2.*

# TypeScript/Next.js repos (the monitored repos, not this repo)
# npm install @sentry/nextjs@^10
```

---

## Sources

### v1.2 Sources

- [@sentry/node on npm](https://www.npmjs.com/package/@sentry/node) — v10.41.0 current, last published 2026-03-03 (HIGH confidence)
- [Sentry Node.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/node/) — init, startSpan, captureMessage API (HIGH confidence)
- [Sentry v9 to v10 migration guide](https://docs.sentry.io/platforms/javascript/guides/node/migration/v9-to-v10/) — OpenTelemetry v2 bump, removed APIs (HIGH confidence)
- [Sentry v8 to v9 migration guide](https://docs.sentry.io/platforms/javascript/guides/node/migration/v8-to-v9/) — metrics API removal confirmation (HIGH confidence)
- [Sentry Span Metrics docs](https://docs.sentry.io/platforms/javascript/guides/node/tracing/span-metrics/) — span.setAttribute() replaces deprecated metrics (HIGH confidence)
- [Sentry Cron Monitors for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/crons/) — withMonitor, captureCheckIn API (HIGH confidence)
- [Sentry webhooks documentation](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/) — webhook events, signature verification (HIGH confidence)
- [@vercel/node on npm](https://www.npmjs.com/package/@vercel/node) — v5.6.10 current (HIGH confidence)
- [Vercel Functions docs](https://vercel.com/docs/functions) — api/ directory, handler signature, configuration (HIGH confidence)
- [Vercel Functions API Reference](https://vercel.com/docs/functions/functions-api-reference) — VercelRequest, VercelResponse types (HIGH confidence)
- [Vercel function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration) — maxDuration by plan tier (HIGH confidence)
- [Vercel raw body for webhooks](https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function) — body parsing behavior (HIGH confidence)
- [@octokit/webhooks-methods on npm](https://www.npmjs.com/package/@octokit/webhooks-methods) — v6.0.0 current (HIGH confidence)
- [@octokit/webhooks-methods GitHub](https://github.com/octokit/webhooks-methods.js) — verify(), sign(), verifyWithFallback() API (HIGH confidence)
- [@octokit/webhooks.js GitHub](https://github.com/octokit/webhooks.js) — full package API, middleware pattern (HIGH confidence)
- [Sentry + Vercel serverless discussion](https://github.com/getsentry/sentry-javascript/discussions/18591) — @sentry/node compatibility with Vercel functions (MEDIUM confidence — community discussion, not official docs)
- [Validating GitHub webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — official GitHub docs on HMAC-SHA256 verification (HIGH confidence)

### v1.0/v1.1 Sources (from prior research)

- [anthropics/claude-code-action GitHub repo](https://github.com/anthropics/claude-code-action) — version, configuration API, deprecated inputs (HIGH confidence)
- [Claude Code GitHub Actions official docs](https://code.claude.com/docs/en/github-actions) — GA v1 setup, model parameter (HIGH confidence)
- [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing) — current model names, token pricing (HIGH confidence)
- [GitHub Docs: Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — cross-org constraints (HIGH confidence)
- [actions/create-github-app-token](https://github.com/actions/create-github-app-token) — v2 with `owner:` param (HIGH confidence)
- [Sentry Seer documentation](https://docs.sentry.io/product/ai-in-sentry/seer/) — Seer issue fix flow (MEDIUM confidence)

---

*Stack research for: AI-powered self-healing CI/CD system (auto-fix-agent) — v1.2 Monitoring & Observability*
*Researched: 2026-03-03*
