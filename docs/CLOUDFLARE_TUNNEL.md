# Cloudflare Tunnel Setup

Expose your local Risoluto instance to the internet so Linear can deliver webhooks in real time.

## Architecture

```
Linear ──POST──▶ webhooks.risolu.to ──▶ Cloudflare Edge ──▶ cloudflared tunnel ──▶ risoluto:4000/webhooks/linear
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

### 3. Configure the Webhook URL

In your Risoluto workflow config (via the dashboard or YAML):

```yaml
webhook:
  webhook_url: "https://webhooks.risolu.to/webhooks/linear"
```

The `webhook_secret` is optional — Risoluto will auto-register the webhook in Linear and store the signing secret on first startup.

## How It Works

- `cloudflared` runs as a sidecar container alongside Risoluto
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
| Ingress     | `/webhooks/linear` → `http://risoluto:4000` |

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

### DNS not resolving

- The tunnel creates a CNAME automatically — no manual DNS record needed
- Verify in Cloudflare DNS that `webhooks.risolu.to` points to the tunnel

### Webhook returns 401 "Missing Linear-Signature header"

This is **expected behavior** for unauthenticated requests. Risoluto validates the `Linear-Signature` HMAC header on every delivery. If you see this from a test `curl`, the tunnel is working correctly.

### Webhook registrar cannot verify URL in Linear

If you see `could not verify webhook URL in Linear — continuing with configured secret` in the logs, the Linear GraphQL API key may be invalid or expired. Risoluto falls back to **manual mode** — it uses the `webhook_secret` you configured directly instead of auto-registering. To fix:

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
| **Auto**   | Risoluto calls Linear's GraphQL API to create the webhook and stores the returned signing secret             | `LINEAR_API_KEY` is valid and has webhook permissions     |
| **Manual** | You set `webhook_secret` in the config overlay; Risoluto uses it to verify signatures without calling Linear | API key is invalid, expired, or lacks webhook permissions |

To configure manual mode:

```bash
# Generate a random secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Set it via the config API (localhost bypasses write token)
curl -s -X PUT http://localhost:4000/api/v1/config/overlay \
  -H 'Content-Type: application/json' \
  -d "{\"webhook\":{\"webhookSecret\":\"$WEBHOOK_SECRET\"}}"
```

Then register the same secret in Linear's webhook settings manually.
