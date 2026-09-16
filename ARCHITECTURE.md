# Architecture

Asynchronous receipt-processing pipeline: **TypeScript, Express, Redis, RabbitMQ, AWS S3, Gemini, Google Sheets**.

## Why change

The v0.2 design is one synchronous Vercel function (`api/process-receipt.ts`) that calls Gemini,
creates the Drive folder and Sheet, uploads the image, and appends rows while the user waits. Three
hard failures:

| Problem | Cause | Consequence |
| --- | --- | --- |
| No retries | Work happens inline; a transient error kills the request | A rate-limited Gemini call loses the user's receipt. Already logged in `parking_lot.md`. |
| Timeout | Vercel Hobby caps functions at 10s; Gemini vision alone often exceeds 5s | Fails under normal conditions, not edge cases |
| 3-image receipts impossible | Vercel caps request bodies at 4.5MB; base64 inflates ~33% | Multi-page uploads 413 before reaching the handler |

Moving to Express solves the platform limits (a long-lived process can also hold the AMQP
connection); moving to a queue solves the reliability limits.

## Flow

1. User signs in with Google (**authorization-code** flow, `access_type=offline`).
2. Server stores the refresh token; provisions the Drive folder + Sheet if absent; persists both IDs.
3. User scans a receipt — 1 to 3 images for long receipts.
4. API returns **presigned S3 PUT URLs**; the browser uploads directly to S3.
5. API publishes a job carrying **S3 keys, never image bytes**.
6. Worker claims the job (`prefetch=1`), guards on a Redis idempotency key.
7. Worker fetches images, sends **all pages in one Gemini call**, validates with Zod.
8. Worker copies the image to Drive, appends rows to the Sheet, acks.
9. Failures enter the retry ladder; exhausted jobs land in the DLQ.

## Component responsibilities

**S3** — image storage, so queue messages stay small (hundreds of bytes). Browser uploads via
presigned PUT, so image bytes never transit the API. Requires bucket CORS for the web origin. A
lifecycle rule expires staged originals after 30 days (the durable copy lives in the user's Drive).

**RabbitMQ** — durable hand-off between API and worker. Manual acks give at-least-once delivery: an
unacked message from a crashed worker is redelivered rather than lost. `prefetch=1` keeps a worker
from monopolising Gemini's free-tier quota.

**Redis** — everything ephemeral and self-expiring:

| Key | Purpose | TTL |
| --- | --- | --- |
| `idem:receipt:<jobId>` | Idempotency guard; atomic `SET NX` | 24h |
| `token:google:<userId>` | Cached access token | 55m (expiry is 60m) |
| `status:job:<jobId>` | Job state for UI polling | 24h |
| `ratelimit:gemini` | Shared limiter across workers | rolling 60s |

**Postgres** — the system of record: users, Google refresh tokens (encrypted at rest), provisioned
`folderId`/`spreadsheetId`, and job history. Not Redis: losing a refresh token forces the user to
re-consent, and Redis is memory-first with eviction.

Storing `folderId`/`spreadsheetId` also retires two `parking_lot.md` entries — IDs are stable across
renames, so the current name-based Drive lookup in `api/lib/drive.ts` is no longer needed.

## Queue topology

`rabbitmq_delayed_message_exchange` is unavailable on CloudAMQP's free tier (dedicated plans only), so
backoff is built from queue TTL + dead-letter chaining, which is portable to any broker.

```
receipts.exchange ──► receipts.work ──(nack)──► receipts.retry.{10s,1m,5m,30m}
                            ▲                              │
                            └──────────(TTL expiry)─────────┘
                                                            │
                                     (attempts exhausted) ──► receipts.dlq
```

Each retry queue sets `x-message-ttl` to its delay and dead-letters back to `receipts.exchange`. A
failed message dead-letters into the tier matching its attempt count, waits out the TTL, and is
re-delivered to the work queue. An `x-attempt` header tracks attempts; past the last tier the message
is routed to `receipts.dlq` for inspection and replay.

**One queue per delay — never per-message TTL on a shared queue.** RabbitMQ only evaluates expiry at
the queue head, so a 30m message at the front blocks a 10s message behind it (head-of-line blocking).

**Retryable** — Gemini 429/5xx, Zod validation failure (LLMs occasionally emit malformed output; a
retry often succeeds), Drive/Sheets 5xx, network errors.
**Non-retryable, straight to DLQ** — revoked Google grant, malformed job, missing S3 object, Drive
out of storage.

## Auth

`src/auth.ts` currently uses the implicit flow (`initTokenClient`), which yields a browser-held
1-hour access token and no refresh token. That cannot survive async processing: a job in the 30m retry
tier wakes to a dead token. Passing the token through the queue fixes nothing — it still expires, and
it puts user credentials in the broker.

Target: server-side authorization-code flow, refresh token in Postgres, worker mints access tokens on
demand and caches them in Redis.

Two deployment constraints:

- Refresh tokens **expire after 7 days** while the OAuth consent screen is in "Testing". Must be
  published to "In production".
- Drop the `spreadsheets` scope — it is **sensitive** and triggers 2-6 weeks of Google verification.
  `drive.file` is **non-sensitive** and covers app-created spreadsheets. Verify against the live API.

## Extraction

One Gemini call per receipt with every page attached as a separate part — page 2 carries no vendor or
date, so pages must share one context. Also 1 request against quota instead of 3.

This changes the `ExtractionProvider` contract in `api/lib/providers/types.ts` from
`(imageBase64, mimeType)` to an array of images. `api/lib/schema.ts` stays the single source of truth.

Free tier: 10 RPM / 1,500 RPD / 250k TPM on Flash. Throughput is capped by Gemini, not the broker.

## Scope

**No payments and no deployment.** Both were considered and cut: a paywall on an unfinished system is
premature, and deploying teaches paperwork (domain, privacy policy, Google OAuth verification) rather
than engineering. The project is open source and runs locally.

This costs nothing in substance — the pipeline, its failure handling, and every technology decision
above are unaffected.

## Running it

RabbitMQ, Redis, and Postgres run via Docker Compose: no free-tier caps, no idle reclamation, no
signup. The RabbitMQ management UI on `localhost:15672` is the primary observability surface — retry
tiers filling and draining, and the DLQ accumulating poison messages, are directly visible there.

Contributors need their own Google Cloud OAuth client and Gemini API key; see `README.md`.

Broker, cache, and store sit behind interfaces, so the decision stays reversible. Findings from
costing a deployment, kept because they explain the local-first choice:

- **No free always-on worker host exists.** Fly.io dropped its free tier; Render free web services
  sleep after 15min and background workers are paid-only; Koyeb closed free signups and bars worker
  services; Railway is ~$1/mo minimum.
- **Oracle Always Free is a trap here.** Halved to 2 OCPU/12GB on 2026-06-15, and idle instances are
  reclaimed when p95 CPU, network, and memory all stay under 20% for 7 days — exactly a low-traffic
  worker's profile.
- Free managed tiers that would fit: CloudAMQP Little Lemur (1M msgs/mo, 20 connections, **28-day
  idle queue deletion** — always re-declare topology on connect), Upstash Redis (256MB, 500k
  cmds/mo), Neon Postgres (0.5GB, scale-to-zero at 5min, no hard pause — unlike Supabase, which
  pauses free projects after 7 days idle and needs manual resume).

S3 is retained over Cloudflare R2 despite R2's better economics: S3's free-tier request caps
(2,000 PUT/mo) only bind at real user volume, which a local project never reaches.

Because the app stays unpublished, its OAuth consent screen stays in "Testing", where Google expires
refresh tokens after **7 days**. The auth layer must therefore treat a rejected refresh token as a
normal condition and prompt re-consent, not as an error.

## Phases

1. **Express migration** — port the Vercel handler to an Express app; Docker Compose for RabbitMQ,
   Redis, Postgres.
2. **Auth rewrite** — authorization-code flow, refresh tokens in Postgres, Redis token cache,
   `drive.file`-only scope, re-consent on refresh failure.
3. **S3 ingest** — presigned PUT, multi-image upload UI, lifecycle expiry.
4. **Queue** — topology, publisher, worker with manual ack and `prefetch=1`.
5. **Reliability** — idempotency keys, retry ladder, DLQ, Gemini rate limiter.
6. **Multi-page extraction** — provider contract takes an image array.
