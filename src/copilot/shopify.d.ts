/** The App Bridge global installed by https://cdn.shopify.com/shopifycloud/app-bridge.js. */
declare const shopify: {
  /** A fresh one-minute session (ID) token for the current shop and staff member. */
  idToken(): Promise<string>;
  /** Optional access scopes: asking the merchant to grant more. */
  scopes: {
    request(scopes: string[]): Promise<{ result: "granted-all" | "declined-all" }>;
  };
};
