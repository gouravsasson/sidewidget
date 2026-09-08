(function (window, document) {
  "use strict";

  if (window.SnowieCommerce) return;

  var script = document.currentScript;
  var config = {
    schema: script && (script.dataset.schema || script.dataset.tenant),
    widgetId: script && (script.dataset.widgetId || script.dataset.agentId),
    baseUrl: (script && script.dataset.baseUrl) || "https://app.snowie.ai",
    widgetSrc: script && script.dataset.widgetSrc,
    pollInterval: Number((script && script.dataset.pollInterval) || 1500),
  };
  var storagePrefix = "snowie:" + (config.widgetId || "widget") + ":";
  var state = {
    token: null,
    sessionId: getOrCreateSessionId(),
    platform: "custom",
    capabilities: [],
    routes: { cart: "/cart", checkout: "/checkout" },
    pollTimer: null,
    pollInFlight: false,
    comparison: null,
    activeTab: true,
  };

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getOrCreateSessionId() {
    var key = storagePrefix + "session";
    var value = localStorage.getItem(key) || localStorage.getItem("snowie_session_id");
    if (!value) value = "snw_" + randomId();
    localStorage.setItem(key, value);
    localStorage.setItem("snowie_session_id", value);
    return value;
  }

  function request(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (state.token) headers.Authorization = "Bearer " + state.token;
    return fetch(config.baseUrl.replace(/\/$/, "") + path, Object.assign({}, options, { headers: headers }));
  }

  function pageContext() {
    var product = document.querySelector('script[type="application/ld+json"]');
    var structuredProduct = null;
    if (product) {
      try {
        var parsed = JSON.parse(product.textContent || "{}");
        var candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
        structuredProduct = candidates.find(function (item) { return item && item["@type"] === "Product"; }) || null;
      } catch (_) {}
    }
    return {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      product: structuredProduct && {
        name: structuredProduct.name,
        sku: structuredProduct.sku,
        url: structuredProduct.url,
      },
    };
  }

  function shopifyRoot() {
    return window.Shopify && window.Shopify.routes && window.Shopify.routes.root
      ? window.Shopify.routes.root
      : "/";
  }

  function selectedVariantId(product) {
    var requested = new URLSearchParams(window.location.search).get("variant");
    var formInput = document.querySelector('form[action*="/cart/add"] [name="id"]');
    var candidate = requested || (formInput && formInput.value);
    var variants = (product && product.variants) || [];
    var selected = variants.find(function (variant) { return String(variant.id) === String(candidate || ""); });
    return selected || variants.find(function (variant) { return variant.available; }) || variants[0] || null;
  }

  function collectShopifyContext(context) {
    if (state.platform !== "shopify" && !(window.Shopify && window.Shopify.routes)) {
      return Promise.resolve(context);
    }
    var root = shopifyRoot();
    var productMatch = window.location.pathname.match(/\/products\/([^/?#]+)/);
    var productRequest = productMatch
      ? fetch(root + "products/" + encodeURIComponent(productMatch[1]) + ".js", { credentials: "same-origin" })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (product) {
            if (!product) return null;
            var variant = selectedVariantId(product);
            return {
              external_id: String(product.id),
              external_variant_id: variant ? String(variant.id) : "",
              name: product.title,
              handle: product.handle,
              url: product.url || window.location.pathname,
              variant_title: variant && variant.title,
              sku: variant && variant.sku,
              available: variant ? Boolean(variant.available) : Boolean(product.available),
              price: variant ? variant.price : product.price,
            };
          })
          .catch(function () { return context.product; })
      : Promise.resolve(context.product);
    var cartRequest = fetch(root + "cart.js", { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (cart) {
        if (!cart) return null;
        return {
          item_count: cart.item_count || 0,
          total_price: cart.total_price || 0,
          currency: cart.currency || "",
          items: (cart.items || []).slice(0, 25).map(function (item) {
            return {
              external_product_id: String(item.product_id || ""),
              external_variant_id: String(item.variant_id || item.id || ""),
              key: item.key || "",
              name: item.product_title || item.title || "",
              variant_title: item.variant_title || "",
              quantity: item.quantity || 0,
              price: item.final_price != null ? item.final_price : item.price,
              url: item.url || "",
            };
          }),
        };
      })
      .catch(function () { return null; });
    return Promise.all([productRequest, cartRequest]).then(function (values) {
      return Object.assign({}, context, { product: values[0] || null, cart: values[1] || null });
    });
  }

  function collectPageContext() {
    return collectShopifyContext(pageContext());
  }

  function bootstrap() {
    if (!config.schema || !config.widgetId) {
      console.error("[Snowie] data-schema and data-widget-id are required");
      return Promise.reject(new Error("Missing Snowie configuration"));
    }
    return collectPageContext().then(function (context) { return request("/api/commerce/browser/session/", {
      method: "POST",
      body: JSON.stringify({
        schema_name: config.schema,
        agent_code: config.widgetId,
        session_id: state.sessionId,
        origin: window.location.origin,
        page_context: context,
        widget_open: localStorage.getItem(storagePrefix + "open") === "true",
      }),
    }); }).then(function (response) {
      if (!response.ok) throw new Error("Snowie session rejected (" + response.status + ")");
      return response.json();
    }).then(function (data) {
      state.token = data.token;
      state.platform = data.platform;
      state.capabilities = data.capabilities || [];
      state.routes.cart = data.cart_url || (data.platform === "shopify" ? "/cart" : "");
      state.routes.checkout = data.checkout_url || (data.platform === "shopify" ? "/checkout" : "");
      reportContext();
      startPolling();
      return data;
    });
  }

  function reportContext(providedContext) {
    if (!state.token) return Promise.resolve(null);
    var contextPromise = providedContext ? Promise.resolve(providedContext) : collectPageContext();
    return contextPromise.then(function (context) {
      return request("/api/commerce/browser/context/", {
        method: "PATCH",
        body: JSON.stringify({
          page_context: context,
          widget_open: localStorage.getItem(storagePrefix + "open") === "true",
        }),
      }).then(function () { return context; });
    }).catch(function () { return null; });
  }

  function safeRoute(value) {
    var url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("Cross-origin navigation is not allowed");
    return url.href;
  }

  function navigate(value) {
    localStorage.setItem(storagePrefix + "open", "true");
    window.location.assign(safeRoute(value));
  }

  function productImage(product) {
    return product && product.images && product.images.length ? product.images[0] : "";
  }

  function money(product) {
    if (!product || typeof product.price !== "number") return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: product.currency || "USD",
      }).format(product.price / 100);
    } catch (_) {
      return (product.currency || "") + " " + (product.price / 100).toFixed(2);
    }
  }

  function button(label, onClick) {
    var element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.style.cssText = "border:0;border-radius:8px;padding:9px 12px;cursor:pointer;background:#111827;color:#fff";
    element.addEventListener("click", onClick);
    return element;
  }

  function modal(title) {
    var old = document.getElementById("snowie-commerce-surface");
    if (old) old.remove();
    var root = document.createElement("section");
    root.id = "snowie-commerce-surface";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText = "position:fixed;inset:0;z-index:2147483640;background:rgba(15,23,42,.46);display:grid;place-items:center;padding:20px;font:14px system-ui,sans-serif";
    var panel = document.createElement("div");
    panel.style.cssText = "width:min(780px,100%);max-height:min(720px,90vh);overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28)";
    panel.dataset.snowieScrollTarget = "true";
    var header = document.createElement("header");
    header.style.cssText = "position:sticky;top:0;background:#fff;display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #e5e7eb;z-index:1";
    var heading = document.createElement("strong");
    heading.textContent = title;
    var close = button("Close", closeSurface);
    close.style.background = "#e5e7eb";
    close.style.color = "#111827";
    header.append(heading, close);
    var body = document.createElement("div");
    body.style.cssText = "padding:18px";
    panel.append(header, body);
    root.append(panel);
    root.addEventListener("click", function (event) { if (event.target === root) closeSurface(); });
    document.body.append(root);
    return body;
  }

  function closeSurface() {
    var surface = document.getElementById("snowie-commerce-surface");
    if (surface) surface.remove();
    state.comparison = null;
  }

  function productCard(product, compare) {
    var card = document.createElement("article");
    card.style.cssText = "display:flex;flex-direction:column;gap:10px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;min-width:0";
    var image = productImage(product);
    if (image) {
      var img = document.createElement("img");
      img.src = image;
      img.alt = product.name || "Product";
      img.loading = "lazy";
      img.style.cssText = "width:100%;height:180px;object-fit:contain;border-radius:10px;background:#f8fafc";
      card.append(img);
    }
    var name = document.createElement("strong");
    name.textContent = product.name || "Product";
    var price = document.createElement("span");
    price.textContent = money(product);
    card.append(name, price);
    if (compare) {
      ["brand", "category", "availability"].forEach(function (field) {
        if (!product[field]) return;
        var line = document.createElement("span");
        line.textContent = field.replace(/^./, function (c) { return c.toUpperCase(); }) + ": " + product[field];
        card.append(line);
      });
    }
    card.append(button("View product", function () { navigate(product.url); }));
    return card;
  }

  function showProducts(payload) {
    var products = payload.products || [];
    var body = modal("Suggested products");
    body.style.cssText += ";display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px";
    products.forEach(function (product) { body.append(productCard(product, false)); });
    return { displayed: products.length };
  }

  function showComparison(payload) {
    var products = payload.products || [];
    state.comparison = products;
    var body = modal("Product comparison");
    body.style.cssText += ";display:grid;grid-template-columns:repeat(" + Math.max(products.length, 1) + ",minmax(220px,1fr));gap:14px";
    products.forEach(function (product) { body.append(productCard(product, true)); });
    return { displayed: products.length };
  }

  function configuredAction(action, payload) {
    var integration = payload.integration;
    if (!integration) return null;
    if (integration.type === "route" && integration.url) return function () { navigate(integration.url); };
    if (integration.type === "dom" && integration.selector) return function () {
      var target = document.querySelector(integration.selector);
      if (!target) throw new Error("Configured element was not found");
      target.click();
    };
    if (integration.type === "form" && integration.selector) return function () {
      var form = document.querySelector(integration.selector);
      if (!form || typeof form.submit !== "function") throw new Error("Configured form was not found");
      form.submit();
    };
    if (integration.type === "callback" && integration.callback) return function () {
      var callback = window[integration.callback];
      if (typeof callback !== "function") throw new Error("Configured callback was not found");
      return callback(action, payload);
    };
    return null;
  }

  function shopify(action, payload) {
    if (action === "add_to_cart") {
      return fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payload.external_variant_id, quantity: payload.quantity || 1 }),
      }).then(function (response) {
        if (!response.ok) throw new Error("Shopify rejected add to cart");
        document.dispatchEvent(new CustomEvent("cart:refresh"));
        window.setTimeout(reportContext, 250);
        return { added: true };
      });
    }
    if (action === "update_cart") {
      return fetch("/cart/change.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payload.external_variant_id, quantity: payload.quantity }),
      }).then(function (response) {
        if (!response.ok) throw new Error("Shopify rejected cart update");
        document.dispatchEvent(new CustomEvent("cart:refresh"));
        window.setTimeout(reportContext, 250);
        return { updated: true };
      });
    }
    throw new Error("Shopify adapter cannot execute " + action);
  }

  function woocommerce(action, payload) {
    if (action !== "add_to_cart") throw new Error("WooCommerce adapter cannot execute " + action);
    var body = new URLSearchParams();
    body.set("product_id", payload.external_product_id);
    body.set("quantity", String(payload.quantity || 1));
    if (payload.external_variant_id && payload.external_variant_id !== payload.external_product_id) {
      body.set("variation_id", payload.external_variant_id);
    }
    return fetch("/?wc-ajax=add_to_cart", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    }).then(function (response) {
      if (!response.ok) throw new Error("WooCommerce rejected add to cart");
      return response.json();
    }).then(function (result) {
      if (result.error) throw new Error("WooCommerce could not add this variation");
      if (window.jQuery) {
        window.jQuery(document.body).trigger("added_to_cart", [result.fragments, result.cart_hash]);
      }
      document.body.dispatchEvent(new CustomEvent("wc_fragment_refresh"));
      return { added: true };
    });
  }

  function execute(message) {
    var action = message.action;
    var payload = message.payload || {};
    var override = configuredAction(action, payload);
    if (override) return Promise.resolve().then(override);
    if (action === "show_products") return Promise.resolve(showProducts(payload));
    if (action === "compare_products") return Promise.resolve(showComparison(payload));
    if (action === "close_comparison") { closeSurface(); return Promise.resolve({ closed: true }); }
    if (action === "open_product") { navigate(payload.product.url); return Promise.resolve({ navigating: true }); }
    if (action === "choose_compared_product") {
      var products = payload.products || state.comparison || [];
      var index = Number(payload.position || 1) - 1;
      if (!products[index]) throw new Error("Compared product position is invalid");
      closeSurface();
      navigate(products[index].url);
      return Promise.resolve({ selected: products[index].id });
    }
    if (action === "open_cart") { if (!state.routes.cart) throw new Error("Cart route is not configured"); navigate(state.routes.cart); return Promise.resolve({ navigating: true }); }
    if (action === "checkout") { if (!state.routes.checkout) throw new Error("Checkout route is not configured"); navigate(state.routes.checkout); return Promise.resolve({ navigating: true }); }
    if (action === "scroll_view") {
      var target = document.querySelector('[data-snowie-scroll-target="true"]');
      var amount = Number(payload.amount || 400) * (payload.direction === "up" ? -1 : 1);
      (target || window).scrollBy({ top: amount, behavior: "smooth" });
      return Promise.resolve({ scrolled: true });
    }
    if (state.platform === "shopify" && (action === "add_to_cart" || action === "update_cart")) return shopify(action, payload);
    if (state.platform === "woocommerce" && action === "add_to_cart") return woocommerce(action, payload);
    throw new Error("No browser adapter is configured for " + action);
  }

  function acknowledge(message, status, result) {
    return request("/api/commerce/browser/actions/" + encodeURIComponent(message.id) + "/ack/", {
      method: "POST",
      body: JSON.stringify({ status: status, result: result || {} }),
    });
  }

  function poll() {
    if (!state.token || !state.activeTab || document.hidden || state.pollInFlight) return;
    state.pollInFlight = true;
    return request("/api/commerce/browser/actions/").then(function (response) {
      if (response.status === 204) return null;
      if (response.status === 401) return bootstrap().then(function () { return null; });
      if (!response.ok) throw new Error("Action poll failed");
      return response.json();
    }).then(function (message) {
      if (!message) return;
      window.dispatchEvent(new CustomEvent("snowie:action", { detail: message }));
      return execute(message).then(function (result) {
        return acknowledge(message, "succeeded", result);
      }).catch(function (error) {
        console.error("[Snowie] action failed", error);
        return acknowledge(message, "failed", { error: String(error.message || error) });
      });
    }).catch(function (error) {
      console.warn("[Snowie] polling paused", error);
    }).finally(function () {
      state.pollInFlight = false;
    });
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(poll, Math.max(config.pollInterval, 3000));
    poll();
  }

  function coordinateTabs() {
    if (!("BroadcastChannel" in window)) return;
    var channel = new BroadcastChannel("snowie-commerce:" + config.widgetId);
    var tabId = randomId();
    var lastOwner = 0;
    channel.onmessage = function (event) {
      if (!event.data || event.data.tabId === tabId) return;
      if (event.data.type === "owner" && event.data.at > lastOwner) {
        lastOwner = event.data.at;
        state.activeTab = false;
        window.dispatchEvent(new CustomEvent("snowie:microphone-owner", { detail: { owner: false } }));
      }
      if (event.data.type === "claim" && !document.hidden) claim();
    };
    function claim() {
      var at = Date.now();
      lastOwner = at;
      state.activeTab = true;
      channel.postMessage({ type: "owner", tabId: tabId, at: at });
      window.dispatchEvent(new CustomEvent("snowie:microphone-owner", { detail: { owner: true } }));
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) claim();
    });
    channel.postMessage({ type: "claim", tabId: tabId });
    setTimeout(claim, 80);
  }

  function watchNavigation() {
    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      history[method] = function () {
        var result = original.apply(this, arguments);
        reportContext();
        return result;
      };
    });
    window.addEventListener("popstate", function () { reportContext(); });
    window.addEventListener("pagehide", function () { reportContext(); });
    window.addEventListener("focus", function () { reportContext(); });
    document.addEventListener("cart:refresh", function () { window.setTimeout(reportContext, 250); });
    document.addEventListener("shopify:section:load", function () { reportContext(); });
  }

  function loadHostedWidget() {
    if (!config.widgetSrc || document.getElementById("snowie-hosted-widget")) return;
    var frame = document.createElement("iframe");
    frame.id = "snowie-hosted-widget";
    frame.title = "Snowie shopping assistant";
    frame.allow = "microphone; autoplay";
    var widgetUrl = new URL(config.widgetSrc, window.location.href);
    widgetUrl.searchParams.set("commerce_session_id", state.sessionId);
    window.addEventListener("message", function (event) {
      if (event.source !== frame.contentWindow || event.origin !== widgetUrl.origin) return;
      if (!event.data || event.data.type !== "snowie:request-context") return;
      collectPageContext().then(function (context) {
        reportContext(context);
        frame.contentWindow.postMessage({
          type: "snowie:storefront-context",
          sessionId: state.sessionId,
          pageContext: context,
        }, widgetUrl.origin);
      });
    });
    frame.src = widgetUrl.href;
    frame.style.cssText = "position:fixed;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));border:0;z-index:2147483630;background:transparent";
    document.body.append(frame);
  }

  window.SnowieCommerce = {
    init: bootstrap,
    execute: function (action, payload) { return execute({ action: action, payload: payload || {} }); },
    close: closeSurface,
    getSessionId: function () { return state.sessionId; },
  };

  function init() {
    coordinateTabs();
    watchNavigation();
    loadHostedWidget();
    bootstrap().catch(function (error) { console.error("[Snowie] initialization failed", error); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
