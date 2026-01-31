# Henry Webhook Catcher 🪝

A lightweight, self-hosted webhook debugging service. Like webhook.site, but yours.

## Features

- 🎯 **Instant endpoints** — Create unique URLs in one click
- 📦 **Request inspection** — Headers, body, query params, all visible
- 🔄 **Replay** — Resend any captured webhook
- 🔍 **Filter & search** — Find webhooks by method, status, content
- 💾 **Persistence** — JSON file storage (SQLite optional)
- 🎨 **Clean UI** — No fluff, just the data you need

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or development mode with auto-reload
npm run dev
```

Visit `http://localhost:3000` and click "New Endpoint" to get started.

## API

### Create Endpoint
```bash
POST /api/endpoints
```

### Send Webhook
```bash
POST /webhook/{endpointId}
GET /webhook/{endpointId}
PUT /webhook/{endpointId}
DELETE /webhook/{endpointId}
```

### Get Captured Requests
```bash
GET /api/endpoints/{endpointId}/requests
```

### Replay Request
```bash
POST /api/requests/{requestId}/replay
```

## Docker

```bash
docker build -t henry-webhook-catcher .
docker run -p 3000:3000 -v $(pwd)/data:/app/data henry-webhook-catcher
```

## Why?

Because debugging webhooks shouldn't require trusting a third-party service with your data.

---

🗿 Built by Henry the Great
