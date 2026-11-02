/// <reference types="vite/client" />

/**
 * Origin of the Snowie backend the widget talks to.
 *
 * Defaults to production. Set VITE_SNOWIE_API_URL in `.env` to point the
 * widget at another deployment (e.g. https://test.snowie.ai) — agents created
 * on the test dashboard only exist there, and production answers requests for
 * them with "Agency does not exist".
 *
 * Vite inlines this at build time, so changing `.env` requires a rebuild.
 */
export const SNOWIE_API_ORIGIN = (
  import.meta.env.VITE_SNOWIE_API_URL || "https://app.snowie.ai"
).replace(/\/$/, "");
