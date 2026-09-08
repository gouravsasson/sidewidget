# Snowie side widget

## Development

Start the local development server:

```bash
npm run dev
```

### Fixed tunnel for the complete local stack

The backend, frontend, and widget can share one persistent Microsoft Dev
Tunnel. Each service keeps the same public URL between restarts:

- backend: `https://<tunnel-id>-8000.<region>.devtunnels.ms`
- frontend: `https://<tunnel-id>-5175.<region>.devtunnels.ms`
- widget: `https://<tunnel-id>-5173.<region>.devtunnels.ms`

Install the
[Dev Tunnels CLI](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started),
then perform this setup once (replace the example ID with a unique team ID):

```powershell
devtunnel user login
devtunnel create snowie-your-team -a
devtunnel port create snowie-your-team -p 8000 --protocol http
devtunnel port create snowie-your-team -p 5175 --protocol http
devtunnel port create snowie-your-team -p 5173 --protocol http
Copy-Item .env.example .env
```

Set `SNOWIE_TUNNEL_ID` in `.env` to the ID you created. If the URLs printed by
`devtunnel host` use a region other than `inc1`, also update
`SNOWIE_TUNNEL_REGION`.

After that, one command starts Django, the main frontend, the widget, and the
persistent tunnel. It also injects all backend, SDK, widget, CORS, CSRF, and
tenant-host URLs, so no URL needs to be copied into another `.env` file:

```bash
npm run dev:tunnel
```

Anonymous access (`-a`) is needed for external storefronts and webhooks. Treat
the URLs as public development endpoints and never run production credentials
or production data through this tunnel.

For a temporary widget-only Cloudflare URL, the old behavior remains available
as `npm run dev:tunnel:quick`.
