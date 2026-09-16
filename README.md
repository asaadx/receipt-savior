# Receipt Savior

Scan a receipt, get its line items extracted by a multimodal model and appended
to a Google Sheet in your own Drive.

The receipt image and the extracted data stay in **your** Google account — the
app requests only the `drive.file` scope, which grants access to files it
created and nothing else in your Drive.

## Status

Phase 1 of 6. The pipeline is being rebuilt as an asynchronous, retrying
pipeline (S3 → RabbitMQ → model → Sheets); see [ARCHITECTURE.md](ARCHITECTURE.md)
for the design and the reasoning behind each choice.

Today the flow is still synchronous: one image per receipt, processed inline on
the request. Multi-page receipts, retries, and the dead-letter queue land in
later phases.

Runs locally. Not deployed, and there is no hosted instance.

## Prerequisites

- Node.js 20+
- Docker (for RabbitMQ, Redis, and Postgres)
- A **Google Cloud OAuth client ID** (see below)
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey),
  or an OpenAI key

### Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Google Drive API** and **Google Sheets API**.
2. Configure the OAuth consent screen as **External**, and add your own Google
   account under **Test users**.
3. Create an **OAuth client ID** of type *Web application* with
   `http://localhost:5173` as an authorized JavaScript origin.
4. Copy the client ID into `VITE_GOOGLE_CLIENT_ID`.

While the consent screen stays in "Testing", Google expires authorizations after
7 days, so you will occasionally need to sign in again. That is expected for an
unpublished app.

## Setup

```bash
git clone https://github.com/asaadx/receipt-savior.git
cd receipt-savior
npm install
cp .env.example .env    # then fill in VITE_GOOGLE_CLIENT_ID and GEMINI_API_KEY
```

## Running

```bash
npm run infra:up   # RabbitMQ, Redis, Postgres
npm run dev        # Vite on :5173, Express API on :3000
```

Open <http://localhost:5173>.

The API is validated at startup — if a required key is missing, it exits with
the reason instead of failing later on a request.

| Service | URL | Credentials |
| --- | --- | --- |
| App | <http://localhost:5173> | Google sign-in |
| API health | <http://localhost:3000/healthz> | — |
| RabbitMQ management | <http://localhost:15672> | `receipt` / `receipt` |

`npm run infra:down` stops the containers; data persists in named volumes.

## Layout

```
src/       Vite single-page frontend
server/    Express API (routes, config, Google + model adapters)
shared/    Zod schema shared by frontend and backend
```

`shared/schema.ts` is the single source of truth for the shape of an extracted
line item. Each provider adapter translates that Zod schema into its own
structured-output dialect rather than duplicating the field list, so adding a
field means editing one file.

## License

[MIT](LICENSE)
