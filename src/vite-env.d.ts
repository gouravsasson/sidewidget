/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Snowie backend origin; see src/config.ts. Defaults to production. */
  readonly VITE_SNOWIE_API_URL?: string;
  /** Shopify app client id; copilot.html puts it in the shopify-api-key meta tag. */
  readonly VITE_SHOPIFY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
