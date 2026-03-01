# Catalyst Cash Proxy (Backend)

Minimal proxy for AI providers + Plaid bank sync.

## Environment variables

```
PORT=8080
APP_PROXY_SECRET=your-secret   # optional (client must send x-pp-secret)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Plaid (required for bank connections)
PLAID_CLIENT_ID=...            # from https://dashboard.plaid.com
PLAID_SECRET=...               # sandbox / development / production secret
PLAID_ENV=sandbox              # "sandbox" | "development" | "production"
```

## Endpoints

### AI Audit
- `GET /health`
- `POST /audit/openai`
- `POST /audit/gemini`

### Plaid Bank Sync
- `POST /plaid/link-token` — Creates Link token for client
- `POST /plaid/exchange` — Exchanges public_token → access_token
- `POST /plaid/balances` — Fetches live account balances
- `POST /plaid/disconnect` — Revokes an access token

All Plaid endpoints are rate-limited (10 req/min/IP).

## Headers

- `x-pp-user`: user id (for monthly limits)
- `x-pp-tier`: starter|basic|standard|plus|power
- `x-pp-secret`: required if APP_PROXY_SECRET is set

## Deploy

```bash
cd server
npm install
PORT=8080 \
APP_PROXY_SECRET=your-secret \
OPENAI_API_KEY=sk-... \
GEMINI_API_KEY=AIza... \
PLAID_CLIENT_ID=... \
PLAID_SECRET=... \
PLAID_ENV=sandbox \
npm start
```

## Notes

- Add persistent storage and Apple receipt validation before production.
- For Plaid production, apply at https://dashboard.plaid.com/overview/production
