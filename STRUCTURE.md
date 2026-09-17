# Codebase map

How this repo is laid out and where to make a given change. Kept current as the
code moves — see [Keeping this current](#keeping-this-current).

For *why* the architecture looks like this, read [ARCHITECTURE.md](ARCHITECTURE.md).
For running it locally, read [README.md](README.md).

## Top level

| Path | What lives here |
| --- | --- |
| `src/` | Vite single-page frontend. Browser-only code. |
| `server/` | Express API. Node-only code. |
| `shared/` | Types and schema imported by both sides. |
| `public/` | Static assets copied verbatim by Vite (icon, manifest, service worker). |
| `docker-compose.yml` | RabbitMQ, Redis, Postgres for local dev. **Not yet used by any code** — Phase 4 connects them. |
| `index.html` | Vite's entry document. Declares the DOM ids `src/main.ts` looks up. |

## Backend

| File | Purpose | Key exports |
| --- | --- | --- |
| `server/index.ts` | Process entry. Binds the port, reports readiness, handles shutdown signals. No routing. | — |
| `server/app.ts` | Builds the Express app: body limit, `/healthz`, router mount, 404, error handler. | `createApp` |
| `server/config.ts` | Parses and validates `process.env` once at boot; exits 1 if invalid. | `config` |
| `server/routes/receipts.ts` | `POST /api/receipts`. Validates the body, then orchestrates extract → Drive → Sheets. | `receiptsRouter` |
| `server/lib/errors.ts` | Error whose message is safe to return to the client. | `AppError` |
| `server/lib/drive.ts` | Google Drive: find/create the app folder, upload the image. | `ensureFolder`, `uploadImage` |
| `server/lib/sheets.ts` | Google Sheets: find/create the sheet, append a grouped row block. | `ensureSheet`, `appendItems` |
| `server/lib/filename.ts` | Builds the Drive filename from the parsed receipt. | `buildReceiptFilename` |

### Extraction providers

`server/lib/providers/` is the only place that talks to a model.

| File | Purpose |
| --- | --- |
| `types.ts` | The `ExtractionProvider` contract every adapter implements. |
| `index.ts` | Registry keyed by `config.LLM_PROVIDER`; an unregistered provider is a type error. |
| `gemini.ts` | Gemini adapter. Converts the Zod schema into Gemini's OpenAPI subset. |
| `openai.ts` | OpenAI adapter. |
| `prompt.ts` | The one shared task instruction. |

## Frontend

| File | Purpose |
| --- | --- |
| `src/main.ts` | Wires the DOM: theme toggle, file input, base64 encode, `POST /api/receipts`, render the results table, register the service worker. |
| `src/auth.ts` | Google sign-in and access-token access. |
| `src/style.css` | All styling. Theme via `data-theme` on `<html>`. |
| `src/vite-env.d.ts` | Vite client types. |

## Shared

`shared/schema.ts` is the single source of truth for an extracted line item:
`CIBC_CATEGORIES`, `ReceiptItemSchema`, `ExtractionResultSchema`, and the
inferred `ReceiptItem` / `ExtractionResult` types.

Adding or changing a field means editing this file only. Provider adapters
translate this schema into their own structured-output dialect, and each
field's `.describe()` text is what the model actually reads — those strings are
prompt content, not documentation.

## Request flow

The Phase 1 path, end to end:

```
src/main.ts          file input change → base64
  └─ POST /api/receipts { accessToken, imageBase64, mimeType }
server/app.ts        json body limit, router mount, error handler
server/routes/receipts.ts
  ├─ zod validate body                        → 400 on failure
  ├─ getExtractionProvider()(image, mime)     → ReceiptItem[]  (empty → 422)
  ├─ ensureFolder(accessToken)                → folderId
  ├─ buildReceiptFilename(items[0], mime)
  ├─ ensureSheet + uploadImage                  (parallel)
  └─ appendItems(..., webViewLink)            → 200 { items }
```

Errors are thrown as `AppError` when the message is safe to show, and as
anything else when it is not. `server/app.ts` logs the latter in full and
returns a generic message plus a `requestId`.

## Where to make a change

| Goal | Edit |
| --- | --- |
| Add or change an extracted field | `shared/schema.ts` |
| Add a model provider | `server/lib/providers/` + the `LLM_PROVIDER` enum in `server/config.ts` |
| Change the extraction instruction | `server/lib/providers/prompt.ts` |
| Add an env var | `server/config.ts` and `.env.example` |
| Add an endpoint | `server/routes/`, mounted in `server/app.ts` |
| Change sheet columns or grouping | `server/lib/sheets.ts` |
| Change the UI | `src/main.ts`, `src/style.css`, DOM ids in `index.html` |
| Change startup, ports, or shutdown | `server/index.ts` |

## Conventions that bite

- **Import boundaries.** `shared/` imports nothing from `server/` or `src/`.
  `server/` never imports from `src/`. `src/` imports only types from `shared/`.
- **Two module worlds.** `server/` and `shared/` run under Node ESM and need
  the `.js` extension on relative imports, even from `.ts` files. `src/` is
  bundled by Vite and does not. Copying an import between them breaks it.
- **`npm run build` type-checks everything** (`tsc --noEmit` then `vite build`),
  including `server/`, which Vite itself never touches.
- **The API binds loopback on port 4000.** Vite proxies `/api` to it, so the
  frontend uses origin-relative paths and needs no API base URL.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Frontend and API together. |
| `npm run dev:web` / `dev:api` | Either half alone. |
| `npm run build` | Type-check everything, then build the frontend. |
| `npm run infra:up` / `infra:down` | Start/stop the Docker services. |

## Keeping this current

Update this file in the same PR that changes the structure. Triggers:

- a file or directory added, removed, moved, or renamed
- a new export that other modules are expected to call
- a change to the request flow or to the import boundaries
- a phase landing that activates a service listed as unused

If a table row here disagrees with the tree, the tree wins — fix the row.
