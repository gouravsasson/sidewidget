# kartikweiget

## Snowie Copilot panel (Shopify admin)

`copilot.html` (embedded in Shopify admin, text) and `copilot-voice.html` (top-level
voice tab; Shopify admin gives embedded apps no microphone) live in `src/copilot/` and
are built separately from the widget:

```
VITE_SHOPIFY_API_KEY=<app client id> VITE_SNOWIE_API_URL=https://<backend> npm run build:copilot
```

The build fails without `VITE_SHOPIFY_API_KEY` (App Bridge reads it from the
`shopify-api-key` meta tag). `VITE_SNOWIE_API_URL` defaults to production (see `src/config.ts`).
Deploy `dist-copilot/` as its own Vercel project with
`vercel deploy --prod --local-config vercel.copilot.json`, which sets the
`frame-ancestors` headers. Point `application_url` in
`snowie/integrations/shopify/shopify.app.toml` at `https://<host>/copilot.html`.

The panel authenticates with the App Bridge ID token only (`shopify.idToken()` per
request); the voice page with a one-time handoff token. No cookies or storage.
