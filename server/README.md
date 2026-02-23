# Catalyst Cash Proxy (Backend)

Minimal proxy for OpenAI / Claude / Gemini.

## Environment variables

```
PORT=8080
APP_PROXY_SECRET=your-secret   # optional (client must send x-pp-secret)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

## Endpoints

- `GET /health`
- `POST /audit/openai`
- `POST /audit/gemini`

Each request may include headers:

- `x-pp-user`: user id (for monthly limits)
- `x-pp-tier`: starter|basic|standard|plus|power
- `x-pp-secret`: required if APP_PROXY_SECRET is set

## Notes

This is a starter backend. Add persistent storage and Apple receipt validation before production.
