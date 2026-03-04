# Phase 5: Webhook Receiver and Security Foundation - Research

**Researched:** 2026-03-03
**Domain:** Vercel serverless functions, GitHub webhook security, Sentry error monitoring
**Confidence:** HIGH

## Summary

This phase deploys a TypeScript Vercel serverless function at `/api/webhook` that receives GitHub webhook events from 3 organizations, verifies HMAC-SHA256 signatures, filters and routes events by type, and captures its own errors to Sentry. The function is purely additive to the existing repo -- no existing code changes required.

The standard stack is lightweight and well-documented: `@vercel/functions` for `waitUntil()`, `@octokit/webhooks-methods` v6 for signature verification, `@octokit/webhooks-types` for TypeScript event payloads, and `@sentry/node` v10 for error capture. Vercel natively compiles TypeScript in the `api/` directory with zero build config. Fluid compute (enabled by default since April 2025) gives the Hobby plan a 300-second default timeout, far exceeding the 5-second response requirement.

**Primary recommendation:** Use the Web API handler format (`export default { fetch(request: Request) }`) for the serverless function -- it provides native access to `request.text()` for raw body (needed for HMAC verification) and aligns with Vercel's current recommended pattern. Avoid the legacy `VercelRequest`/`VercelResponse` format.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Root-level `api/` directory (standard Vercel convention)
- Own `package.json`, `tsconfig.json`, `vercel.json` at repo root
- Vercel Hobby (free) plan -- 100K invocations/month
- Git push auto-deploy on main
- Environment variables scoped to Production only (not Preview/Development)
- Return 404 (not 403) when `VERCEL_ENV !== 'production'`
- Org-level webhooks for all 3 organizations (fbetancourtc, Liftitapp, LiftitFinOps)
- Subscribe to: `workflow_run`, `pull_request`, `pull_request_review` events
- Single shared webhook secret across all 3 orgs
- Registration is manual (GitHub UI or API) -- documented in ONBOARDING.md
- New dedicated Sentry project `auto-fix-monitor`
- DSN stored in `SENTRY_DSN` env var
- Response-first pattern: verify signature -> respond 200 immediately -> `waitUntil(processEvent())` for Sentry work
- Unrecognized event types: respond 200, log to Sentry breadcrumb, skip processing
- Event filtering: only process `workflow_run.completed`, PRs with `auto-fix` label, reviews on auto-fix PRs
- All other events: 200 response, no processing
- Sentry SDK initialized at module scope (persists across warm invocations)
- `Sentry.flush(2000)` called inside `waitUntil()` before completion
- Use `@octokit/webhooks-methods` v6 for signature verification
- Use `@sentry/node` v10 (NOT `@sentry/nextjs`)

### Claude's Discretion
- Exact file organization within `api/` (lib helpers, types, etc.)
- TypeScript strictness level
- Error message wording in rejection responses
- Sentry breadcrumb structure and verbosity

### Deferred Ideas (OUT OF SCOPE)
- Metric emission and telemetry -- Phase 6
- Event deduplication via Upstash Redis -- Phase 6
- Sentry dashboards, cron monitors, alert rules -- Phase 7
- Artifact status monitoring (PR lifecycle, promotion health) -- v1.3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOOK-01 | Vercel serverless function (`/api/webhook.ts`) receives GitHub webhook events and responds 200 within 5 seconds | Web API handler format with `waitUntil()` defers work after immediate response. Hobby plan with Fluid Compute has 300s timeout -- response is sent immediately, well within 5s |
| HOOK-02 | HMAC-SHA256 signature verification rejects unsigned or tampered requests before any processing | `@octokit/webhooks-methods` v6 `verify(secret, payload, signature)` with `request.text()` for raw body access |
| HOOK-03 | Event type routing dispatches `workflow_run`, `pull_request`, and `pull_request_review` events to appropriate handlers | `X-GitHub-Event` header read from request, routed via switch/map to typed handler stubs |
| HOOK-05 | Async processing via `waitUntil()` defers Sentry calls after immediate 200 response | `waitUntil()` from `@vercel/functions` extends function lifetime after response is sent |
| HOOK-06 | Event filtering limits processing to `workflow_run.completed`, PRs with `auto-fix` label, and reviews on those PRs | Filter on `action` field + label check in payload before dispatching to handlers |
| SENT-01 | Sentry SDK initialized in webhook function with error capture for receiver failures | `@sentry/node` v10 `Sentry.init()` at module scope, `captureException()` in catch, `flush(2000)` in `waitUntil()` |
| INFRA-01 | Vercel project deployed from auto-fix-agent repo with environment variables scoped to Production only | `vercel.json` at repo root, env vars set in Vercel dashboard with Production scope only |
| INFRA-02 | GitHub org-level webhooks configured for all 3 organizations pointing to Vercel URL | Manual registration documented in ONBOARDING.md update, webhook URL WITHOUT trailing slash |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vercel/functions` | latest | `waitUntil()` for deferred processing after response | Official Vercel package for serverless lifecycle management |
| `@octokit/webhooks-methods` | 6.0.0 | HMAC-SHA256 signature verification (`verify()`) | 95% smaller than full `@octokit/webhooks`, timing-safe comparison built-in |
| `@sentry/node` | 10.x (currently 10.42.0) | Error capture, breadcrumbs, `flush()` | Official Sentry SDK for Node.js, actively maintained |
| `@octokit/webhooks-types` | 7.x | TypeScript types for GitHub webhook payloads | Auto-updated daily from GitHub API specs, `WorkflowRunEvent`, `PullRequestEvent`, etc. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 5.x | TypeScript compiler (dev dependency) | Type checking during local dev; Vercel compiles TS natively for deployment |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@octokit/webhooks-methods` | Full `@octokit/webhooks` | Full package adds event emitter, middleware -- unnecessary weight for just signature verification |
| `@octokit/webhooks-methods` | Manual `crypto.timingSafeEqual` | Hand-rolling misses edge cases (encoding, timing attacks); library handles correctly |
| `@sentry/node` | `@sentry/serverless` | `@sentry/serverless` targets AWS Lambda/GCP; `@sentry/node` works fine with Vercel functions |
| `@sentry/node` | `@sentry/nextjs` | This is NOT a Next.js project; `@sentry/nextjs` adds framework-specific wrappers not needed |

**Installation:**
```bash
npm install @vercel/functions @octokit/webhooks-methods @sentry/node @octokit/webhooks-types
npm install -D typescript @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
auto-fix-agent/                 # Existing repo root
├── api/
│   ├── webhook.ts              # Entry point: signature verify -> respond -> waitUntil
│   └── lib/
│       ├── verify.ts           # HMAC signature verification wrapper
│       ├── router.ts           # Event type routing (X-GitHub-Event -> handler)
│       ├── filters.ts          # Event filtering logic (action, labels)
│       ├── handlers/
│       │   ├── workflow-run.ts  # workflow_run.completed handler stub
│       │   ├── pull-request.ts  # pull_request handler stub
│       │   └── review.ts       # pull_request_review handler stub
│       ├── sentry.ts           # Sentry init + helpers (captureException, addBreadcrumb)
│       └── types.ts            # Shared types, webhook payload interfaces
├── package.json                # Node.js dependencies (NEW)
├── tsconfig.json               # TypeScript config (NEW)
├── vercel.json                 # Vercel config: trailingSlash, functions (NEW)
├── config/                     # Existing config directory
│   ├── repo-stack-map.json     # Read-only from receiver perspective
│   └── pricing.json            # Phase 6 usage
├── scripts/                    # Existing bash scripts (unchanged)
└── .github/workflows/          # Existing workflows (unchanged)
```

### Pattern 1: Web API Handler with waitUntil
**What:** The modern Vercel handler format using Web Standard APIs
**When to use:** All new Vercel serverless functions (non-Next.js)
**Example:**
```typescript
// Source: https://vercel.com/docs/functions/runtimes/node-js
// Source: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
import { waitUntil } from '@vercel/functions';

export default {
  async fetch(request: Request): Promise<Response> {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') ?? '';

    // Verify HMAC signature BEFORE anything else
    const isValid = await verify(secret, rawBody, signature);
    if (!isValid) {
      return new Response('', { status: 401 });
    }

    // Respond 200 immediately
    const response = new Response('OK', { status: 200 });

    // Defer all processing after response
    waitUntil(processEvent(rawBody, request.headers));

    return response;
  },
};
```

### Pattern 2: Module-Scope Sentry Init
**What:** Initialize Sentry at module scope so it persists across warm invocations
**When to use:** Any Vercel function with Sentry
**Example:**
```typescript
// Source: https://docs.sentry.io/platforms/javascript/guides/node/
import * as Sentry from '@sentry/node';

// Module scope: executes once per cold start, persists across warm invocations
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  // No tracing needed in Phase 5 -- just error capture
});
```

### Pattern 3: Environment Gate for Production-Only
**What:** Return 404 for non-production environments to prevent leaking endpoint info
**When to use:** When env vars are scoped to Production only
**Example:**
```typescript
// Early exit for non-production environments
if (process.env.VERCEL_ENV !== 'production') {
  return new Response('', { status: 404 });
}
```

### Pattern 4: Event Filtering Before Processing
**What:** Filter events at handler entry, respond 200 for everything, only process matching events
**When to use:** Webhook handlers receiving many event types
**Example:**
```typescript
async function processEvent(rawBody: string, headers: Headers): Promise<void> {
  try {
    const eventType = headers.get('x-github-event') ?? '';
    const payload = JSON.parse(rawBody);

    // Route by event type
    switch (eventType) {
      case 'workflow_run':
        if (payload.action !== 'completed') {
          Sentry.addBreadcrumb({ message: `Skipped workflow_run.${payload.action}` });
          break;
        }
        await handleWorkflowRun(payload);
        break;

      case 'pull_request':
        if (!hasAutoFixLabel(payload)) {
          Sentry.addBreadcrumb({ message: 'Skipped PR without auto-fix label' });
          break;
        }
        await handlePullRequest(payload);
        break;

      case 'pull_request_review':
        if (!isAutoFixPR(payload)) {
          Sentry.addBreadcrumb({ message: 'Skipped review on non-auto-fix PR' });
          break;
        }
        await handleReview(payload);
        break;

      default:
        Sentry.addBreadcrumb({ message: `Unrecognized event: ${eventType}` });
        break;
    }
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    await Sentry.flush(2000);
  }
}
```

### Anti-Patterns to Avoid
- **Processing before responding:** Never do Sentry calls or heavy work before returning 200. Use `waitUntil()` to defer.
- **Returning 4xx for unrecognized events:** GitHub expects 200 for all valid deliveries. Non-200 causes retry storms and shows as delivery failures in GitHub UI.
- **Using `@sentry/nextjs`:** This is NOT a Next.js project. `@sentry/nextjs` adds framework wrappers that break in plain Vercel functions.
- **Reading `request.json()` before signature verification:** Must read `request.text()` first for raw body, then `JSON.parse()` after signature is verified. Reading `.json()` consumes the body and makes raw body unavailable.
- **Initializing Sentry inside the handler:** Init at module scope. Re-initializing on every request wastes cold start time and may cause duplicate SDK instances.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 verification | Custom `crypto.createHmac` + `timingSafeEqual` | `@octokit/webhooks-methods` `verify()` | Handles encoding edge cases, timing-safe comparison, maintains compatibility with GitHub's signature format |
| GitHub event payload types | Custom TypeScript interfaces | `@octokit/webhooks-types` | Auto-updated daily from GitHub API specs, covers all event types and actions |
| Deferred execution after response | Custom `setImmediate()` or `process.nextTick()` | `@vercel/functions` `waitUntil()` | Vercel-specific lifecycle management; custom approaches may be killed when response completes |
| Serverless error monitoring | Custom `console.error` + logging | `@sentry/node` `captureException()` | Stack traces, breadcrumbs, deduplication, alerting -- all built-in |

**Key insight:** The webhook receiver is a security boundary. Signature verification and error capture are solved problems with battle-tested libraries. Hand-rolling introduces timing attack vulnerabilities and silent failure modes.

## Common Pitfalls

### Pitfall 1: Vercel 308 Redirect on Trailing Slash
**What goes wrong:** Registering webhook URL as `https://example.vercel.app/api/webhook/` (with trailing slash) causes Vercel to 308 redirect to the path without the trailing slash. Many webhook senders (including GitHub in some configurations) don't follow 308 redirects, causing silent delivery failures.
**Why it happens:** Vercel's default `trailingSlash` is `undefined` (no redirect). But if `trailingSlash: false` is set in `vercel.json`, paths with trailing slashes get 308 redirected. The pitfall is that GitHub may append a trailing slash.
**How to avoid:** Set `"trailingSlash": false` in `vercel.json` AND register the webhook URL WITHOUT a trailing slash: `https://your-app.vercel.app/api/webhook`
**Warning signs:** GitHub webhook delivery log shows 308 status code instead of 200.

### Pitfall 2: Body Consumed Before Signature Verification
**What goes wrong:** Calling `request.json()` or reading `request.body` before signature verification makes the raw body unavailable for HMAC computation.
**Why it happens:** Web API `Request` body is a one-time readable stream. Once consumed by `.json()`, `.text()` returns empty.
**How to avoid:** Always read with `request.text()` FIRST, verify HMAC against the raw string, THEN `JSON.parse()` the verified string.
**Warning signs:** Signature verification always fails even with correct secret.

### Pitfall 3: Sentry Data Loss in Serverless
**What goes wrong:** Sentry events silently dropped because the function terminates before Sentry's background send completes.
**Why it happens:** Sentry buffers events and sends them asynchronously. In serverless, the function process may be frozen/killed after the response is sent, before the HTTP POST to Sentry completes.
**How to avoid:** Always call `await Sentry.flush(2000)` inside `waitUntil()` before the deferred promise resolves. The 2000ms timeout ensures the function doesn't hang if Sentry is unreachable.
**Warning signs:** Errors visible in console logs but missing in Sentry dashboard.

### Pitfall 4: Environment Variable Leakage to Preview Deployments
**What goes wrong:** Webhook secret or Sentry DSN available in Preview deployments, allowing preview branches to process real webhook events or pollute Sentry data.
**Why it happens:** Vercel env vars default to ALL environments (Production + Preview + Development). If not scoped correctly, any PR branch deployment gets the secrets.
**How to avoid:** Scope `GITHUB_WEBHOOK_SECRET` and `SENTRY_DSN` to Production environment only in the Vercel dashboard. Add the `VERCEL_ENV !== 'production'` gate that returns 404.
**Warning signs:** Sentry events from preview deployments, or preview URLs accepting webhook deliveries.

### Pitfall 5: DSN Exposure in Client Bundle
**What goes wrong:** Sentry DSN exposed in browser-accessible JavaScript, allowing anyone to send garbage events to your Sentry project.
**Why it happens:** Some Vercel project configs expose env vars to the client. `NEXT_PUBLIC_` prefix or incorrect framework settings can make server-only vars client-accessible.
**How to avoid:** This project has NO client-side code -- it's a pure API function. DSN lives only in `SENTRY_DSN` env var (no `NEXT_PUBLIC_` prefix). Verify by checking the deployed function's response doesn't include the DSN.
**Warning signs:** DSN string visible in Vercel deployment output or function response headers.

### Pitfall 6: Incorrect Sentry Init Timing
**What goes wrong:** Sentry auto-instrumentation doesn't work because `Sentry.init()` runs after other imports.
**Why it happens:** Sentry must be initialized before other modules for auto-instrumentation to hook into them.
**How to avoid:** In this phase, auto-instrumentation is not needed (no database, no HTTP client calls). Module-scope init at the top of the entry file is sufficient. Import `@sentry/node` and call `Sentry.init()` before other imports in `webhook.ts`, or use a dedicated `sentry.ts` module imported first.
**Warning signs:** `captureException()` works but automatic breadcrumbs/spans are empty.

## Code Examples

Verified patterns from official sources:

### Complete Webhook Handler Entry Point
```typescript
// api/webhook.ts
// Source: Vercel docs + @octokit/webhooks-methods README + Sentry Node.js docs
import * as Sentry from '@sentry/node';
import { waitUntil } from '@vercel/functions';
import { verify } from '@octokit/webhooks-methods';

// Module-scope Sentry init (persists across warm invocations)
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
});

export default {
  async fetch(request: Request): Promise<Response> {
    // Environment gate: 404 for non-production
    if (process.env.VERCEL_ENV !== 'production') {
      return new Response('', { status: 404 });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return new Response('', { status: 405 });
    }

    // Read raw body (must be done before any other body read)
    const rawBody = await request.text();

    // Verify HMAC-SHA256 signature
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';

    const isValid = await verify(secret, rawBody, signature);
    if (!isValid) {
      return new Response('', { status: 401 });
    }

    // Respond 200 immediately, defer processing
    waitUntil(processEvent(rawBody, request.headers));
    return new Response('OK', { status: 200 });
  },
};

async function processEvent(rawBody: string, headers: Headers): Promise<void> {
  try {
    const eventType = headers.get('x-github-event') ?? '';
    const deliveryId = headers.get('x-github-delivery') ?? '';
    const payload = JSON.parse(rawBody);

    Sentry.addBreadcrumb({
      category: 'webhook',
      message: `${eventType}.${payload.action ?? 'unknown'}`,
      data: { deliveryId, repository: payload.repository?.full_name },
    });

    // Route and filter events
    // (implementation in router.ts / handlers/)
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    await Sentry.flush(2000);
  }
}
```

### Signature Verification
```typescript
// api/lib/verify.ts
// Source: https://github.com/octokit/webhooks-methods.js
import { verify } from '@octokit/webhooks-methods';

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }
  return verify(secret, rawBody, signature);
}
```

### Event Filter Helper
```typescript
// api/lib/filters.ts
// Source: GitHub webhook payload documentation
const AUTO_FIX_LABEL = 'auto-fix';

export function isAutoFixLabeledPR(payload: any): boolean {
  const labels: Array<{ name: string }> = payload.pull_request?.labels ?? [];
  return labels.some((label) => label.name === AUTO_FIX_LABEL);
}

export function isReviewOnAutoFixPR(payload: any): boolean {
  return isAutoFixLabeledPR(payload);
}
```

### vercel.json Configuration
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "trailingSlash": false,
  "functions": {
    "api/webhook.ts": {
      "maxDuration": 30
    }
  }
}
```

### package.json
```json
{
  "name": "auto-fix-monitor",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@vercel/functions": "^1.0.0",
    "@octokit/webhooks-methods": "^6.0.0",
    "@sentry/node": "^10.0.0",
    "@octokit/webhooks-types": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "strictNullChecks": true
  },
  "include": ["api/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `VercelRequest`/`VercelResponse` handler format | Web API `export default { fetch(request: Request) }` | 2024 | Cleaner API, native `request.text()` for raw body, standard Web APIs |
| `@sentry/serverless` for serverless functions | `@sentry/node` v9+/v10 works everywhere | v9 (2024) | No need for separate serverless package |
| `trailingSlash` default was `false` | Default is now `undefined` (no redirect) | 2024 | Less surprising behavior, but explicit `false` still recommended for webhooks |
| Vercel Hobby plan: 10s default timeout | Fluid Compute enabled by default: 300s timeout | April 2025 | Webhook processing has ample time even with cold starts |
| `module.exports` function handler | ESM `export default` | 2023+ | Vercel now fully supports ESM for serverless functions |

**Deprecated/outdated:**
- `@sentry/serverless`: Still works but `@sentry/node` v10 handles serverless correctly without it
- `VercelRequest`/`VercelResponse` types: Still supported but Web API format is recommended for new projects
- `routes` in `vercel.json`: Use `rewrites`/`redirects`/`headers` instead

## Open Questions

1. **Web API handler format and `waitUntil` integration**
   - What we know: Vercel docs show `waitUntil()` working with `export default { fetch }` format. Both are imported from `@vercel/functions`.
   - What's unclear: Whether `waitUntil()` called outside the handler scope (e.g., in a helper function) still correctly extends the function lifetime.
   - Recommendation: Call `waitUntil()` directly inside the `fetch()` handler method, pass the promise from `processEvent()`. LOW risk -- documented pattern.

2. **Sentry SDK v10 compatibility with Vercel Hobby plan**
   - What we know: `@sentry/node` v10.42.0 is latest. It works with Node.js 18+. Vercel Hobby runs Node.js 20.x by default.
   - What's unclear: Whether any v10-specific features (e.g., profiling integration, new hooks) have issues on Vercel's Fluid Compute. Phase 5 uses basic `captureException` and `flush` only.
   - Recommendation: Pin to `^10.0.0`, use only basic error capture features in Phase 5. LOW risk.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification via GitHub webhook delivery logs + Sentry dashboard |
| Config file | None -- this is a deployed serverless function, not a locally testable unit |
| Quick run command | `curl -X POST https://your-app.vercel.app/api/webhook -H "Content-Type: application/json" -d '{}'` (should return 401 for missing signature) |
| Full suite command | GitHub Settings > Webhooks > Recent Deliveries > Redeliver (verifies end-to-end) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOOK-01 | Function responds 200 within 5s | smoke | GitHub webhook test delivery from each org | N/A -- manual |
| HOOK-02 | Invalid/missing signature rejected | smoke | `curl` with no `X-Hub-Signature-256` header, expect non-200 | N/A -- manual |
| HOOK-03 | Event type routing works | smoke | Send test events of each type via GitHub webhook settings | N/A -- manual |
| HOOK-05 | waitUntil defers processing | smoke | Check Sentry for breadcrumbs after 200 response | N/A -- manual |
| HOOK-06 | Non-matching events filtered | smoke | Send `issues` event, verify no Sentry transaction/error | N/A -- manual |
| SENT-01 | Sentry captures thrown errors | smoke | Temporarily throw in handler, check Sentry | N/A -- manual |
| INFRA-01 | Vercel project deployed | smoke | Visit deployed URL, expect 404 (non-production) or 405 (GET) | N/A -- manual |
| INFRA-02 | 3 org webhooks configured | smoke | GitHub Settings > Webhooks > check delivery status for each org | N/A -- manual |

### Sampling Rate
- **Per task commit:** Deploy via `git push` to main, verify Vercel deployment succeeds
- **Per wave merge:** GitHub webhook test delivery from all 3 orgs, check Sentry for breadcrumbs
- **Phase gate:** All 5 success criteria verified manually

### Wave 0 Gaps
- [ ] `package.json` -- npm dependencies for the webhook function
- [ ] `tsconfig.json` -- TypeScript configuration
- [ ] `vercel.json` -- Vercel deployment configuration
- [ ] `api/webhook.ts` -- Main handler entry point
- [ ] Vercel project creation and GitHub repo linking
- [ ] Environment variables (`GITHUB_WEBHOOK_SECRET`, `SENTRY_DSN`) in Vercel dashboard
- [ ] Sentry project `auto-fix-monitor` creation
- [ ] Org-level webhook registration for all 3 GitHub organizations

## Sources

### Primary (HIGH confidence)
- [Vercel Functions Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js) -- TypeScript support, Web API handler format, auto-compilation
- [Vercel @vercel/functions API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) -- `waitUntil()` API, usage examples, timeout behavior
- [Vercel Duration Configuration](https://vercel.com/docs/functions/configuring-functions/duration) -- Hobby plan: 300s default/max with Fluid Compute, 10s/60s without
- [Vercel vercel.json Configuration](https://vercel.com/docs/project-configuration/vercel-json) -- `trailingSlash` default is `undefined`, `functions` config for `maxDuration`
- [Vercel Raw Body Guide](https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function) -- `request.text()` for raw body in Web API handler
- [@octokit/webhooks-methods.js README](https://github.com/octokit/webhooks-methods.js) -- v6.0.0, `verify()`, `sign()`, `verifyWithFallback()` API
- [Sentry Node.js Guide](https://docs.sentry.io/platforms/javascript/guides/node/) -- `Sentry.init()`, `captureException()`, requires Node 18+
- [GitHub Webhook Signature Validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HMAC-SHA256, `X-Hub-Signature-256` header, timing-safe comparison

### Secondary (MEDIUM confidence)
- [@sentry/node npm](https://www.npmjs.com/package/@sentry/node) -- Current version 10.42.0, confirmed active maintenance
- [@octokit/webhooks-types npm](https://www.npmjs.com/package/@octokit/webhooks-types) -- v7.x, auto-updated daily from GitHub API specs
- [Sentry JavaScript Discussion #18591](https://github.com/getsentry/sentry-javascript/discussions/18591) -- Community confirmation that `@sentry/node` works with Vercel serverless functions

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via official docs and npm, well-established ecosystem
- Architecture: HIGH -- Web API handler format is documented by Vercel, `waitUntil()` is officially supported
- Pitfalls: HIGH -- 308 redirect, body consumption, and Sentry flush issues are well-documented across multiple sources
- Sentry v10 on Vercel Hobby: MEDIUM -- basic features verified, advanced features not tested in this specific combination

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable stack, 30-day validity)
