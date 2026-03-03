# Pitfalls Research

**Domain:** Adding Vercel serverless webhook receiver + Sentry monitoring to existing GitHub Actions CI/CD system
**Researched:** 2026-03-03
**Confidence:** HIGH (verified against Vercel official docs, GitHub webhook docs, Sentry official docs, and community post-mortems)

**Context:** This is a SUBSEQUENT milestone (v1.2) adding monitoring to an already-working auto-fix-agent system. The system currently has NO server component -- this is the first time adding a Vercel serverless function. Prior pitfalls research (2026-03-01) covered the core CI/CD agent; this document covers pitfalls specific to the webhook receiver and Sentry integration layer.

---

## Critical Pitfalls

### Pitfall 1: GitHub Webhook Signature Verification Bypass or Misimplementation

**What goes wrong:**
The Vercel serverless function at `/api/webhook` receives GitHub webhook events but either skips signature verification entirely ("we'll add it later"), uses the wrong header (`X-Hub-Signature` SHA-1 instead of `X-Hub-Signature-256` SHA-256), or computes the HMAC against a parsed/modified body instead of the raw request body. Any of these allows an attacker who discovers the webhook URL to send spoofed events -- fake `workflow_run` completions, fake `pull_request` merges -- that poison your Sentry dashboards with false data or trigger downstream actions.

**Why it happens:**
Developers test webhooks locally using tools like `ngrok` or GitHub's webhook test delivery, where the signature just works. They skip verification "for now" because it adds complexity, then ship to production without it. Even when implemented, Next.js App Router and Pages Router handle the request body differently -- App Router gives you `request.text()` (raw), while Pages Router auto-parses the body into JSON, destroying the raw bytes needed for HMAC computation.

**How to avoid:**
- Always verify the `X-Hub-Signature-256` header. Never use `X-Hub-Signature` (SHA-1, legacy only).
- In Next.js App Router (which this project uses): get the raw body with `const rawBody = await request.text()` BEFORE parsing it as JSON. Compute the HMAC against `rawBody`, not against `JSON.stringify(parsedBody)` (stringify produces different bytes than the original).
- Use `crypto.timingSafeEqual()` for the comparison -- never use `===` or `==` which are vulnerable to timing attacks.
- Store the webhook secret in Vercel environment variables as a "Sensitive" variable (encrypted, not visible in logs or UI after creation).
- Implementation pattern:
  ```typescript
  import { createHmac, timingSafeEqual } from 'crypto';

  export async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) return new Response('Missing signature', { status: 401 });

    const expected = 'sha256=' + createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    // ... process event
  }
  ```

**Warning signs:**
- Webhook endpoint returns 200 for requests with no `X-Hub-Signature-256` header
- Sentry shows events from unexpected repositories or event types not configured in GitHub
- Webhook handler code uses `request.json()` before signature verification
- No `GITHUB_WEBHOOK_SECRET` environment variable configured in Vercel

**Phase to address:**
Phase 1 (webhook receiver foundation) -- signature verification must be the FIRST thing implemented in the handler, before any event processing logic.

---

### Pitfall 2: Vercel 308 Redirect Silently Dropping Webhook Deliveries

**What goes wrong:**
GitHub sends a POST request to your webhook URL (e.g., `https://your-app.vercel.app/api/webhook`). If the URL does not match Vercel's trailing slash configuration exactly, Vercel issues a 308 Permanent Redirect to the "correct" URL (with or without trailing slash). GitHub does NOT follow redirects on webhook deliveries -- it marks the delivery as failed with a 308 status code. Your function never executes. You see "308" failures in GitHub's webhook delivery log but no errors in your own monitoring because the function was never invoked.

**Why it happens:**
Next.js has a `trailingSlash` configuration in `next.config.js` that defaults to `false`. If you register the webhook URL as `/api/webhook/` (with trailing slash) but `trailingSlash` is `false`, Vercel redirects to `/api/webhook` (without slash) via 308. Conversely, if `trailingSlash: true` and you register `/api/webhook`, it redirects to `/api/webhook/`. This is a well-documented issue with Stripe, Clerk, and other webhook providers on Vercel.

**How to avoid:**
- Register the webhook URL in GitHub with the EXACT path that matches your Vercel routing configuration. If `trailingSlash: false` (default), use `/api/webhook` (no trailing slash).
- Add `trailingSlash: false` explicitly in `next.config.js` to make the behavior deterministic, not implicit.
- After configuring the webhook, send a test delivery from GitHub's webhook settings page and verify the response code is 200, not 308.
- If using plain Vercel serverless functions (not Next.js), the file at `api/webhook.ts` maps to `/api/webhook` -- do not add a trailing slash when registering.

**Warning signs:**
- GitHub webhook delivery log shows repeated 308 responses
- Your Vercel function logs show zero invocations despite GitHub sending events
- Webhook "Recent Deliveries" in GitHub settings shows all deliveries as failed

**Phase to address:**
Phase 1 (webhook receiver setup) -- verify URL routing before connecting to any event processing. A single test delivery from GitHub's UI catches this immediately.

---

### Pitfall 3: GitHub Webhook 10-Second Timeout Causing Lost Events

**What goes wrong:**
GitHub enforces a strict 10-second timeout on webhook deliveries. If your Vercel function does not respond with a 2xx status within 10 seconds, GitHub marks the delivery as timed out. If the function is doing synchronous work -- calling Sentry APIs, enriching data from the GitHub API, computing metrics -- it can easily exceed 10 seconds, especially on cold starts. GitHub does NOT automatically retry timed-out deliveries (unlike many other webhook providers). The event is lost unless you manually redeliver it.

**Why it happens:**
Developers build the webhook handler as a synchronous pipeline: receive event, validate signature, fetch additional data from GitHub API, compute metrics, send to Sentry, respond. Each step adds latency. A Vercel cold start adds 1-3 seconds. A GitHub API call adds 200-500ms. Sentry event capture adds 100-300ms. Combined with JSON parsing and business logic, the total easily exceeds 10 seconds under load.

**How to avoid:**
- Respond with 200 IMMEDIATELY after signature verification and basic event validation. Do all processing AFTER sending the response.
- Use Vercel's `waitUntil()` API (available in Edge and Serverless functions) to continue processing after the response is sent:
  ```typescript
  import { waitUntil } from '@vercel/functions';

  export async function POST(request: Request) {
    const rawBody = await request.text();
    // Verify signature (fast, <10ms)
    // Basic validation (fast, <5ms)

    // Respond immediately
    const response = new Response('OK', { status: 200 });

    // Process asynchronously after response
    waitUntil(processWebhookEvent(JSON.parse(rawBody)));

    return response;
  }
  ```
- On the Hobby (free) plan, the function timeout is 10 seconds. On Pro, it is 60 seconds. Since the webhook handler should respond in <1 second and use `waitUntil` for async work, the Hobby plan is sufficient.
- Keep the synchronous path (before response) under 3 seconds: signature verification + basic JSON validation only.

**Warning signs:**
- GitHub webhook delivery log shows "timed out" status for deliveries
- Sentry shows gaps in event data (missing runs that appear in GitHub Actions)
- Vercel function logs show execution times >5 seconds

**Phase to address:**
Phase 1 (webhook receiver architecture) -- the `respond-first, process-later` pattern must be the foundational architecture of the handler, not bolted on later.

---

### Pitfall 4: Sentry Event Volume Explosion from Unfiltered Webhook Events

**What goes wrong:**
Every GitHub webhook event (workflow_run, pull_request, pull_request_review) generates one or more Sentry events -- a transaction for the webhook processing, custom events for metrics, maybe error events if something fails. With 14 repos sending events for every CI run (not just failures), the volume quickly exceeds Sentry's plan quota. The Team plan ($29/month) includes a limited error quota and span quota. A single busy repo running CI 20 times/day across 14 repos = 280 events/day = 8,400/month just from workflow_run events, before any enrichment or metric events. If you also capture transactions at `tracesSampleRate: 1.0`, you double or triple this.

**Why it happens:**
Developers configure the GitHub webhook to send ALL `workflow_run` events (not just completions with `conclusion: failure`), send ALL `pull_request` events (not just those with `auto-fix` label), and set `tracesSampleRate: 1.0` in the Sentry SDK ("we want full visibility"). Each dimension multiplies the others. The Sentry quota is exhausted mid-month, and events are silently dropped for the remainder -- including the actual failures you need to see.

**How to avoid:**
- Filter events AT THE WEBHOOK HANDLER before sending to Sentry:
  - `workflow_run`: Only process events where `action === 'completed'` (not `requested`, `in_progress`)
  - `pull_request`: Only process events where labels include `auto-fix` or `auto-promotion`
  - `pull_request_review`: Only process events for PRs with `auto-fix` label
- Set `tracesSampleRate: 1.0` only for the webhook handler itself (low volume, every invocation matters). Do NOT enable tracing on a broader application.
- Use Sentry's `beforeSend` callback to drop events you do not need:
  ```typescript
  Sentry.init({
    beforeSend(event) {
      // Drop non-actionable events
      if (event.tags?.['event.filtered']) return null;
      return event;
    },
    beforeSendTransaction(event) {
      // Only keep transactions for auto-fix events
      if (!event.tags?.['auto_fix.relevant']) return null;
      return event;
    },
  });
  ```
- Enable Sentry's built-in inbound data filters: legacy browsers, browser extensions, localhost, web crawlers (unlikely to apply to a serverless function, but free protection).
- Enable Sentry's spike protection to prevent a single burst from consuming the entire monthly quota.
- Calculate expected volume BEFORE deployment: 14 repos x avg CI runs/day x event types x enrichment events = total events/month. Compare against plan quota.

**Warning signs:**
- Sentry dashboard shows "Rate limited" or "Quota exceeded" warnings
- Events stop appearing in Sentry mid-month
- Sentry billing shows unexpected overage charges
- The webhook handler processes events for repos or event types that are not part of the auto-fix system

**Phase to address:**
Phase 1 (Sentry integration design) -- event filtering and volume estimation must be done BEFORE writing any `Sentry.captureEvent()` calls. This is an architecture decision, not a tuning optimization.

---

### Pitfall 5: Missing Event Deduplication Causes Double-Counted Metrics

**What goes wrong:**
GitHub can deliver the same webhook event multiple times. The `X-GitHub-Delivery` header contains a unique GUID for each delivery, but if the function fails to track which deliveries it has already processed, a redelivered event creates duplicate Sentry transactions, double-counts fix success rates, and inflates metric dashboards. At 14 repos, even a 2% duplicate rate means noisy, unreliable data.

**Why it happens:**
Serverless functions are stateless -- there is no in-memory set of "already processed delivery IDs" that persists between invocations. Developers often skip deduplication because they assume GitHub delivers exactly once. The GitHub docs explicitly state: "your handler must safely process duplicate deliveries without side effects." Manual redelivery from the webhook settings page also triggers duplicates if the developer clicks "Redeliver" while debugging.

**How to avoid:**
- Store the `X-GitHub-Delivery` header value in a lightweight deduplication store before processing. Options:
  - **Vercel KV (Redis)**: `SET delivery:{id} 1 EX 86400` (TTL 24 hours). Check before processing.
  - **Upstash Redis** (free tier, serverless-native): Same pattern, no cold start overhead.
  - **In-Sentry deduplication**: Use `event.event_id = delivery_id` to let Sentry deduplicate, but this only covers Sentry events, not your processing logic.
- If no external store is acceptable for MVP, use an idempotent processing pattern: compute metrics from the event payload deterministically (same input = same output), and use Sentry's `event_id` to let Sentry handle deduplication internally.
- At the scale of this project (~5-20 events/day), the risk is low but the fix is cheap. An Upstash Redis free tier (10,000 commands/day) is more than sufficient.

**Warning signs:**
- Sentry dashboards show the same workflow run ID appearing in multiple transactions
- Fix success rate percentages exceed 100% or show impossible values
- The same PR appears multiple times in the "recent fixes" panel
- GitHub webhook delivery log shows manual redeliveries during debugging

**Phase to address:**
Phase 2 (data enrichment and metrics) -- deduplication is a correctness concern for metrics, not a security concern. Can be deferred past MVP but should be added before trusting dashboard data for decisions.

---

### Pitfall 6: Vercel Environment Variable Leakage Across Environments

**What goes wrong:**
Secrets like `GITHUB_WEBHOOK_SECRET`, `SENTRY_DSN`, and `GITHUB_APP_PRIVATE_KEY` are set as Vercel environment variables. If set without scoping to "Production" only, they leak to Preview deployments (which are publicly accessible by default) and Development environments. A preview deployment URL like `auto-fix-agent-pr-42.vercel.app` exposes the same webhook endpoint with the same secrets, allowing anyone who discovers the preview URL to test or exploit the webhook handler.

**Why it happens:**
Vercel's UI defaults to adding environment variables to ALL environments (Production, Preview, Development). Developers add secrets quickly during setup without restricting the scope. Preview deployments are generated automatically for every PR and are publicly accessible unless Vercel Authentication or password protection is enabled.

**How to avoid:**
- Scope ALL secrets to "Production" only in Vercel's environment variable settings. The webhook handler should NOT be functional on Preview deployments.
- Mark secrets as "Sensitive" in Vercel (encrypted, not visible after creation, not shown in build logs).
- Add a guard in the webhook handler: if `process.env.VERCEL_ENV !== 'production'`, return 404 (not 403 -- do not confirm the endpoint exists).
  ```typescript
  if (process.env.VERCEL_ENV !== 'production') {
    return new Response('Not Found', { status: 404 });
  }
  ```
- Enable Vercel Authentication on Preview deployments if the team uses Vercel for PR previews on other projects.
- Never use the `NEXT_PUBLIC_` prefix for any secret -- this embeds it in client-side JavaScript bundles.

**Warning signs:**
- Environment variables in Vercel dashboard show "All Environments" scope
- Preview deployment URLs are reachable without authentication
- Sentry DSN appears in client-side JavaScript (check browser DevTools network tab)
- Build logs in Vercel show secret values

**Phase to address:**
Phase 1 (Vercel project setup) -- environment variable scoping is a one-time configuration done at project creation. Getting it wrong means all subsequent deployments are exposed.

---

### Pitfall 7: Sentry DSN Exposure in Client-Side Bundle

**What goes wrong:**
The Sentry DSN (Data Source Name) is placed in the wrong configuration file or prefixed with `NEXT_PUBLIC_`, causing it to be bundled into client-side JavaScript. While a Sentry DSN alone cannot read data from your Sentry project (it is write-only), an exposed DSN allows anyone to send arbitrary error events and transactions to your Sentry project, polluting your dashboards with junk data and potentially exhausting your event quota.

**Why it happens:**
The Sentry Vercel integration wizard and many tutorials show Sentry initialization in a `sentry.client.config.ts` file with the DSN inline. For a full Next.js app, this is expected (client errors need the DSN). But for this project -- which is a serverless webhook handler with NO client-side code -- there should be no client-side Sentry configuration at all. The DSN should exist only in server-side code.

**How to avoid:**
- This project has NO frontend -- it is a single API route (`/api/webhook.ts`). There should be NO `sentry.client.config.ts` file.
- Initialize Sentry only in the server-side handler or in a `instrumentation.ts` file (Next.js App Router server instrumentation).
- Store the DSN in a server-only environment variable (`SENTRY_DSN`, without `NEXT_PUBLIC_` prefix).
- If using the Sentry Vercel integration wizard, decline client-side setup. Only configure server-side.

**Warning signs:**
- A `sentry.client.config.ts` file exists in the project
- `NEXT_PUBLIC_SENTRY_DSN` appears in any configuration
- Browser network tab shows requests to `sentry.io` from your Vercel deployment
- Sentry project receives events with `browser` platform tags

**Phase to address:**
Phase 1 (Sentry setup) -- a decision made at initialization time. If the wizard creates client-side config, remove it immediately.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping webhook signature verification | Faster development, works in testing | Any internet actor can send fake events; dashboard data becomes untrustworthy | Never |
| Using `tracesSampleRate: 1.0` without volume estimation | Full visibility from day one | Sentry quota exhausted mid-month; real events dropped alongside noise | Only during first week of testing on a single repo; lower to 0.1-0.5 in production |
| Storing dedup state in-memory (module-level variable) | No external dependency | Serverless functions are stateless; variable resets on cold start; duplicates pass through | Never for correctness-critical dedup; acceptable for "best effort" in MVP |
| Processing webhook events synchronously before responding | Simpler code; easier debugging | GitHub 10-second timeout causes event loss under load or cold starts | Never -- always respond first, process async |
| Hardcoding repo-to-Sentry-project mapping | Works for 14 repos today | Every new repo requires a code change and redeployment | MVP only; move to config file by phase 2 |
| Using Vercel Hobby plan without monitoring invocation limits | Free tier, no cost | At scale, 12-function-per-deployment limit or invocation caps could silently drop events | Acceptable for this project's volume (~20-50 events/day); reassess if volume grows 10x |
| Skipping event deduplication | Less code, no external store | Double-counted metrics, unreliable dashboards, wrong success rates | MVP only; add before using dashboards for decisions |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Webhooks + Vercel | Registering webhook URL with wrong trailing slash, getting 308 redirect | Test with GitHub's "Test delivery" button immediately after registration; verify 200 response |
| GitHub Webhooks | Using `X-Hub-Signature` (SHA-1) instead of `X-Hub-Signature-256` (SHA-256) | Always use `X-Hub-Signature-256`; SHA-1 is legacy and deprecated by GitHub |
| GitHub Webhooks | Parsing the body as JSON before computing HMAC signature | Compute HMAC against the raw body string first, then parse as JSON |
| Sentry SDK + Vercel | Using `@sentry/serverless` (AWS-specific) instead of `@sentry/node` or `@sentry/nextjs` | Use `@sentry/nextjs` for Next.js App Router functions; `@sentry/serverless` is for AWS Lambda only |
| Sentry transactions | Using `beforeSend` to filter transactions (does not work) | Use `beforeSendTransaction` for transactions; `beforeSend` only applies to error events |
| Sentry cron monitors | Creating monitors manually in the Sentry UI, then also auto-creating via SDK | Choose one creation method; dual creation causes "monitor already exists" conflicts |
| Vercel environment variables | Setting secrets in "All Environments" scope | Scope production secrets to "Production" only; preview deployments are publicly accessible |
| Vercel + Next.js body parsing | Letting Next.js auto-parse the request body before signature verification | For App Router: use `request.text()` to get raw body; for Pages Router: export `config = { api: { bodyParser: false } }` |
| Sentry event enrichment | Sending full webhook payloads as Sentry context (large blobs) | Send only relevant fields (run ID, repo name, conclusion, duration); Sentry truncates payloads >200KB |
| GitHub API calls from webhook handler | Making multiple GitHub API calls synchronously in the hot path | Use `waitUntil()` for async processing; batch API calls; cache repo metadata |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cold start + synchronous processing | First request after idle period takes 3-5 seconds; GitHub timeout at 10 seconds | Respond immediately with 200; use `waitUntil()` for processing | On Hobby plan after any period of inactivity (no "scale to one" keepalive) |
| One Sentry transaction per webhook event + sub-spans for each metric | Transaction volume grows linearly with CI activity across all repos | Batch metrics into a single Sentry event per webhook invocation; use span metrics not separate transactions | At 14+ repos with multiple CI runs per day (200+ transactions/day) |
| Fetching GitHub API data on every webhook event | Works at 10 events/day; rate-limited at 500+ events/day | Cache repo metadata (stack type, branch config) in Vercel KV or module-level variable with TTL | At ~200 events/day (5000 req/hr GitHub API limit shared with other integrations) |
| Sentry SDK initialization in the request handler | SDK re-initializes on every cold start, adding 200-500ms | Initialize Sentry in `instrumentation.ts` or at module scope (outside handler) | Every cold start adds unnecessary latency |
| Logging full webhook payloads to Vercel logs | Vercel log storage is limited; large payloads fill logs quickly | Log only: event type, repo, action, delivery ID, processing result | When debugging requires scrolling through megabytes of JSON payloads |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No signature verification on webhook endpoint | Anyone can send fake events to poison dashboards and exhaust Sentry quota | Verify `X-Hub-Signature-256` using `crypto.timingSafeEqual` on every request |
| Webhook secret stored in git or `.env` committed to repo | Secret exposure in public GitHub repo (this repo IS public) | Store in Vercel environment variables only; add `.env*` to `.gitignore`; mark as "Sensitive" |
| GitHub App private key stored as Vercel env var (for API calls) | If the webhook handler calls GitHub API using the App private key, a compromised function leaks the key | The webhook handler should NOT have the GitHub App private key. It only reads events -- it does not create PRs. Keep the App key in GitHub Actions secrets only. |
| Preview deployments expose production webhook endpoint | Attacker discovers preview URL and sends test payloads | Guard handler with `VERCEL_ENV !== 'production'` check; scope secrets to Production only |
| Sentry DSN leaked in client bundle | Attackers send junk events to exhaust Sentry quota | No client-side Sentry config; DSN in server-only env var without `NEXT_PUBLIC_` prefix |
| Webhook endpoint has no rate limiting | DDoS or replay attacks exhaust Vercel function invocations and Sentry quota | Add rate limiting via Vercel KV or Upstash; reject >100 requests/minute from same IP |
| Logging raw webhook payloads that contain tokens | Vercel logs may contain GitHub installation tokens from webhook payloads | Strip or redact `token`, `installation.access_tokens_url`, and similar fields before logging |

---

## UX Pitfalls

Common user experience mistakes in this domain (developer experience for dashboard consumers).

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Sentry dashboard shows raw event data with no labels | Developers cannot tell which repo, branch, or workflow an event belongs to | Tag every Sentry event with `repo`, `branch`, `workflow`, `event_type` |
| Cron monitor alerts fire on every missed check-in | Alert fatigue; developers mute all Sentry notifications | Configure cron monitors with a tolerance window (e.g., 5-minute grace period) and alert only after 2 consecutive misses |
| Dashboard shows cumulative metrics with no time window | "95% success rate" is meaningless without knowing the time period | Always show metrics with explicit time windows (last 24h, last 7d, last 30d) |
| Sentry alerts on every single error event | 14 repos with occasional failures = constant alert noise | Use Sentry's issue grouping and alert rules: alert on NEW issues only, not every occurrence |
| No distinction between "agent failed" and "no event received" | When the dashboard shows no data, unclear if system is healthy (no failures) or broken (webhook not receiving events) | Add a heartbeat/canary: Sentry cron monitor that expects a check-in every N hours; missing check-in = system is broken |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Webhook signature verification:** Often implemented but using `===` instead of `timingSafeEqual` -- verify with a timing attack test or code review
- [ ] **Webhook URL registration:** Often registered correctly but never tested -- verify by checking GitHub's "Recent Deliveries" tab for 200 responses (not 308 or timeout)
- [ ] **Sentry event capture:** Often sends events but without tags -- verify that every Sentry event has `repo`, `event_type`, and `workflow_run_id` tags
- [ ] **Async processing with waitUntil:** Often the handler responds 200 but `waitUntil()` errors are silently swallowed -- verify error handling inside the `waitUntil` callback sends to Sentry
- [ ] **Event deduplication:** Often skipped because "GitHub delivers once" -- verify by manually redelivering a webhook from GitHub settings and checking Sentry for duplicates
- [ ] **Sentry cron monitors:** Often created but never tested for "missed" state -- verify by NOT sending a check-in and confirming Sentry alerts
- [ ] **Environment variable scoping:** Often set correctly for Production but also leaked to Preview -- verify by checking Vercel dashboard for scope on each secret
- [ ] **Sentry quota estimation:** Often not done at all -- verify by calculating: (repos x avg CI runs/day x event types x 30 days) < plan quota
- [ ] **Cold start behavior:** Often tested only when function is warm -- verify by waiting 15+ minutes after last invocation and sending a test webhook; confirm response time < 5 seconds
- [ ] **Error handling in async path:** Often the async processing has no try/catch -- verify that exceptions in `waitUntil` callbacks are captured by Sentry, not silently lost

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Webhook signature bypass discovered in production | MEDIUM | (1) Add signature verification immediately, (2) Audit Sentry events for spoofed data (check for events with no matching GitHub Actions run), (3) Rotate the webhook secret in GitHub and Vercel, (4) Delete spoofed Sentry events if identifiable |
| 308 redirect silently dropping all webhook events | LOW | (1) Check GitHub webhook delivery log for 308 responses, (2) Fix the webhook URL to match exact Vercel routing, (3) Manually redeliver failed events from GitHub settings, (4) Add URL routing test to CI |
| Sentry quota exhausted mid-month | MEDIUM | (1) Enable spike protection in Sentry settings, (2) Add `beforeSend`/`beforeSendTransaction` filters to drop non-essential events, (3) Lower `tracesSampleRate` to 0.1, (4) Contact Sentry support about quota reset if needed, (5) Purchase additional reserved volume for the remainder of the month |
| Duplicate events inflated dashboard metrics | LOW | (1) Add dedup store (Upstash Redis), (2) Identify time window of duplicates from Sentry event log, (3) If metrics are stored externally, recalculate from raw events, (4) Sentry dashboards will self-correct once dedup is active |
| Secrets exposed in preview deployment | HIGH | (1) Immediately rescope all Vercel env vars to Production only, (2) Rotate: GitHub webhook secret, Sentry DSN (create new project or regenerate DSN), any API keys, (3) Audit Sentry for events from preview deployment URLs, (4) Enable Vercel Authentication on preview deployments |
| GitHub webhook timeout causing event loss | MEDIUM | (1) Implement `waitUntil()` pattern, (2) Identify missed events by comparing GitHub Actions run log against Sentry events (look for runs with no corresponding Sentry transaction), (3) Manually redeliver missed events from GitHub webhook settings, (4) Add monitoring for function execution time |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Webhook signature bypass | Phase 1 -- Webhook receiver foundation | Send a request without `X-Hub-Signature-256` header; verify 401 response. Send with wrong signature; verify 401. Send with correct signature; verify 200. |
| 308 redirect dropping events | Phase 1 -- Vercel project setup + webhook registration | Register webhook in GitHub; send test delivery; verify 200 in GitHub delivery log (not 308). |
| 10-second timeout / event loss | Phase 1 -- Handler architecture (`waitUntil` pattern) | Add a 5-second `sleep()` in the async processing path; verify GitHub still receives 200 within 1 second. |
| Sentry volume explosion | Phase 1 -- Sentry integration design | Calculate expected monthly volume on paper before writing code; add `beforeSendTransaction` filter; verify with 1 repo for 1 week before enabling all 14. |
| Missing event deduplication | Phase 2 -- Metrics accuracy | Manually redeliver the same webhook event 3 times; verify Sentry shows exactly 1 transaction. |
| Environment variable leakage | Phase 1 -- Vercel project setup | Check Vercel dashboard: all secrets show "Production" scope only. Attempt to access webhook endpoint on a preview deployment URL; verify 404. |
| Sentry DSN exposure | Phase 1 -- Sentry setup | Run `grep -r "NEXT_PUBLIC_SENTRY" .` and verify zero results. Check that no `sentry.client.config.ts` file exists. |
| Sentry cron monitor misconfiguration | Phase 2 -- Cron monitors per repo | Stop sending check-ins for 1 cron monitor; verify Sentry alerts within the configured tolerance window. |
| Async error handling gaps | Phase 2 -- Error handling hardening | Throw an intentional error inside the `waitUntil` callback; verify it appears in Sentry as an error event. |
| Dashboard data reliability | Phase 3 -- Dashboard and alerting | Compare Sentry dashboard counts against GitHub Actions run counts for the same time period; verify they match within 5%. |

---

## Sources

- [Validating webhook deliveries -- GitHub Docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HIGH confidence
- [Handling webhook deliveries -- GitHub Docs](https://docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries) -- HIGH confidence
- [Troubleshooting webhooks -- GitHub Docs](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks) -- HIGH confidence
- [Handling failed webhook deliveries -- GitHub Docs](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) -- HIGH confidence
- [How to Handle GitHub Webhook Retries Effectively? -- GitHub Community](https://github.com/orgs/community/discussions/151676) -- MEDIUM confidence
- [How can I efficiently handle GitHub webhook retries and avoid duplicate event processing? -- GitHub Community](https://github.com/orgs/community/discussions/175725) -- MEDIUM confidence
- [How do I get the raw body of a Serverless Function? -- Vercel Knowledge Base](https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function) -- HIGH confidence
- [What can I do about Vercel Functions timing out? -- Vercel Knowledge Base](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) -- HIGH confidence
- [How can I improve function cold start performance on Vercel? -- Vercel Knowledge Base](https://vercel.com/kb/guide/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel) -- HIGH confidence
- [Vercel Security Best Practices (2026 Guide)](https://vibeappscanner.com/best-practices/vercel) -- MEDIUM confidence
- [Sensitive environment variables -- Vercel Docs](https://vercel.com/docs/environment-variables/sensitive-environment-variables) -- HIGH confidence
- [Vercel Hobby Plan Limits -- Vercel Docs](https://vercel.com/docs/plans/hobby) -- HIGH confidence
- [Scale to one: How Fluid solves cold starts -- Vercel Blog](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts) -- MEDIUM confidence
- [Stripe webhook returning 308 error when calling Vercel serverless function -- Stack Overflow](https://stackoverflow.com/questions/75062050/stripe-webhook-returning-308-error-when-calling-vercel-serverless-function) -- MEDIUM confidence
- [Manage Your Error Quota -- Sentry Docs](https://docs.sentry.io/pricing/quotas/manage-event-stream-guide/) -- HIGH confidence
- [Billing Quota Management -- Sentry Docs](https://docs.sentry.io/pricing/quotas/) -- HIGH confidence
- [Pricing & Billing -- Sentry Docs](https://docs.sentry.io/pricing/) -- HIGH confidence
- [Set Up Crons | Sentry for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/crons/) -- HIGH confidence
- [Sampling | Sentry for Node.js](https://docs.sentry.io/platforms/node/configuration/sampling/) -- HIGH confidence
- [Enriching Events | Sentry for Node.js](https://docs.sentry.io/platforms/node/enriching-events/) -- HIGH confidence
- [How to Receive and Replay Webhooks in Vercel Serverless Functions with Hookdeck](https://hookdeck.com/webhooks/platforms/how-to-receive-and-replay-external-webhooks-in-vercel-serverless-functions) -- MEDIUM confidence
- [Webhooks at Scale: Best Practices and Lessons Learned -- Hookdeck](https://hookdeck.com/blog/webhooks-at-scale) -- MEDIUM confidence
- [Idempotency Patterns Serverless Applications -- The Cloud Engineers](https://blog.thecloudengineers.com/p/idempotency-patterns-serverless-applications) -- MEDIUM confidence
- [How to Implement Webhook Idempotency -- Hookdeck](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) -- MEDIUM confidence
- [Webhook Deduplication Checklist for Developers -- Latenode](https://latenode.com/blog/webhook-deduplication-checklist-for-developers) -- MEDIUM confidence
- [How Did I Reduced Sentry Quota Utilization: A Practical Guide -- Medium](https://ravid7000.medium.com/how-did-i-reduced-sentry-quota-utilization-a-practical-guide-af0b4f0cebd2) -- LOW confidence
- [Sentry Troubleshooting in Enterprise DevOps: Advanced Guide -- Mindful Chase](https://www.mindfulchase.com/explore/troubleshooting-tips/devops-tools/sentry-troubleshooting-in-enterprise-devops-advanced-guide.html) -- LOW confidence

---
*Pitfalls research for: Adding Vercel serverless webhook receiver + Sentry monitoring to auto-fix-agent (v1.2)*
*Researched: 2026-03-03*
