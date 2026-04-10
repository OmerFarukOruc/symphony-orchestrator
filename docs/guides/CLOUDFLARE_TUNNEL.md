# Cloudflare Tunnel Setup

Expose your local Risoluto instance to the internet so Linear can deliver webhooks in real time.

Risoluto's recommended production model is **webhook-first with slow reconciliation polling**:

- webhooks trigger near-real-time refresh
- polling remains enabled as anti-entropy and outage recovery
- healthy webhooks stretch polling to a slower interval instead of disabling it entirely

## Architecture

```
Linear ──POST──▶ webhooks.risolu.to ──▶ Cloudflare Edge ──▶ cloudflared tunnel ──▶ localhost:4000/webhooks/linear
```

## Quick Start

### 1. Add the Tunnel Token

The tunnel `risoluto-webhooks` is already created and configured. The token is in `.env.example` — copy it to your `.env`:

```bash
cp .env.example .env
# Verify CLOUDFLARE_TUNNEL_TOKEN is set
```

### 2. Start with Tunnel Profile

```bash
docker compose --profile tunnel up -d
```

### 3. Configure the Webhook URL and Secret

Recommended setup:

1. store the signing secret in Risoluto's encrypted secrets store
2. reference that secret from the config overlay

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/secrets/LINEAR_WEBHOOK_SECRET \
  -H 'Content-Type: application/json' \
  -d '{"value":"replace-with-your-linear-webhook-secret"}'
```

Then configure the webhook block:

```bash
curl -s -X PUT http://127.0.0.1:4000/api/v1/config/overlay \
  -H 'Content-Type: application/json' \
  -d '{
    "patch": {
      "webhook": {
        "webhook_url": "https://webhooks.risolu.to/webhooks/linear",
        "webhook_secret": "$SECRET:LINEAR_WEBHOOK_SECRET",
        "polling_stretch_ms": 120000,
        "polling_base_ms": 15000,
        "health_check_interval_ms": 60000
      }
    }
  }'
```

> [!TIP]
> There is not yet a dedicated webhook configuration form in Settings. Use the setup wizard for core credentials, then use the secrets API plus config overlay for webhook setup.

## How It Works

- `cloudflared` runs as a sidecar container alongside Risoluto
- the connector shares the Risoluto network namespace, so Cloudflare-managed ingress can safely target `http://localhost:4000`
- Outbound-only connection to Cloudflare (no inbound ports needed)
- Works behind NAT, firewalls, and on local dev machines
- TLS termination happens at Cloudflare's edge

## Tunnel Details

| Setting     | Value                                       |
| ----------- | ------------------------------------------- |
| Tunnel name | `risoluto-webhooks`                         |
| Tunnel ID   | `><tunnel-id>`      |
| Hostname    | `webhooks.risolu.to`                        |
| Zone        | `risolu.to`                                 |
| Ingress     | `/webhooks/linear` → `http://localhost:4000` |

## Production (VPS)

When you move to a VPS, the same setup works — just ensure:

1. The `CLOUDFLARE_TUNNEL_TOKEN` is set in your production `.env`
2. The tunnel connector runs on the VPS
3. Consider using a dedicated subdomain per environment:
   - `webhooks.risolu.to` → production
   - `webhooks-staging.risolu.to` → staging

## Troubleshooting

### Tunnel not connecting

- Verify `CLOUDFLARE_TUNNEL_TOKEN` is correct and not expired
- Check `docker compose logs cloudflared` for connection errors
- Ensure the `tunnel` profile is active: `docker compose --profile tunnel ps`

### Webhook not receiving events

- Verify the hostname is configured in Cloudflare dashboard
- Check Risoluto logs for signature verification errors
- Confirm Linear webhook is registered: check Linear workspace settings → API → Webhooks
- Confirm unsigned public POSTs return `401 signature_missing`, not a Cloudflare error page

### DNS not resolving

- The tunnel creates a CNAME automatically — no manual DNS record needed
- Verify in Cloudflare DNS that `webhooks.risolu.to` points to the tunnel

### Webhook returns 401 "Missing Linear-Signature header"

This is **expected behavior** for unauthenticated requests. Risoluto validates the `Linear-Signature` HMAC header on every delivery. If you see this from a test `curl`, the tunnel is working correctly.

### Webhook returns Cloudflare `502` or `1033`

This means the public hostname is not reaching a healthy tunnel backend.

- `1033`: no active tunnel backend is connected
- `502`: the tunnel is connected, but the configured origin is not reachable

Check:

```bash
docker compose logs cloudflared
docker compose ps
curl -i -X POST https://webhooks.risolu.to/webhooks/linear -H 'Content-Type: application/json' -d '{}'
```

The healthy target state is a Risoluto response like `401 signature_missing`, not a Cloudflare edge error.

### Webhook registrar cannot verify URL in Linear

If you see `could not verify webhook URL in Linear — continuing with configured secret` in the logs, the Linear GraphQL API key may be invalid, expired, or not admin-scoped. Risoluto falls back to **manual mode** — it uses the configured signing secret directly instead of auto-registering. To fix:

1. Verify your `LINEAR_API_KEY` is still valid
2. Update it via the setup wizard or `POST /api/v1/secrets/LINEAR_API_KEY`
3. Restart Risoluto — the registrar will retry auto-registration

### Linear GraphQL API: `teamId` → `teamIds` breaking change

Linear changed the `Webhook` type from `teamId` (string) to `teamIds` (string array). Risoluto's GraphQL queries and client types have been updated to match. If you see `Cannot query field "teamId" on type "Webhook"` errors, rebuild the Docker image:

```bash
docker compose build --no-cache risoluto
docker compose up -d risoluto
```

## Webhook Secret: Manual vs Auto Mode

Risoluto supports two webhook registration modes:

| Mode       | How it works                                                                                                 | When to use                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Auto**   | Risoluto calls Linear's GraphQL API to create the webhook and stores the returned signing secret              | `LINEAR_API_KEY` is valid and admin-scoped for webhooks   |
| **Manual** | You register the webhook in Linear UI and provide the signing secret to Risoluto via secrets + overlay config | API key is invalid, expired, or lacks webhook admin scope |

To configure manual mode:

```bash
# Store the secret securely
curl -s -X POST http://127.0.0.1:4000/api/v1/secrets/LINEAR_WEBHOOK_SECRET \
  -H 'Content-Type: application/json' \
  -d '{"value":"replace-with-your-linear-webhook-secret"}'
```

Then reference it from overlay and register the same secret in Linear's webhook settings manually.
