/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Snowie backend origin; see src/config.ts. Defaults to production. */
  readonly VITE_SNOWIE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
