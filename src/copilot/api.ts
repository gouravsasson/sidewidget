import { SNOWIE_API_ORIGIN } from "../config";

export interface ApiResult<T> {
  status: number;
  /** ``upgrade_url``: with ``error: "upgrade_required"``, Shopify's plan page. */
  data: T & { error?: string; message?: string; detail?: string; upgrade_url?: string | null };
}

/**
 * POST (or GET) to the Snowie backend authenticated only by an App Bridge ID token
 * (never cookies or storage). ID tokens live one minute, so a 401 is retried
 * once with a fresh token.
 */
export async function post<T>(path: string, body: object = {}): Promise<ApiResult<T>> {
  return send<T>(path, body);
}

export async function get<T>(path: string): Promise<ApiResult<T>> {
  return send<T>(path);
}

async function send<T>(path: string, body?: object): Promise<ApiResult<T>> {
  for (let attempt = 0; ; attempt++) {
    const token = await shopify.idToken();
    const response = await fetch(`${SNOWIE_API_ORIGIN}${path}`, {
      method: body ? "POST" : "GET",
      credentials: "omit",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 && attempt === 0) continue;
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }
}
