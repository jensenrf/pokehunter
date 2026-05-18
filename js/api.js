// ═══════════════════════════════════════
//  api.js — Real inventory data fetching
//
//  Best Buy: Official API (free key at developer.bestbuy.com)
//  Target:   BrickSeek deep-links (no API key needed)
// ═══════════════════════════════════════

const API = {

  // ── BEST BUY ────────────────────────────────────────────────
  // Docs: https://developer.bestbuy.com/documentation/stores-api
  //
  // Checks a single SKU across a specific store.
  // Returns: 'in-stock' | 'limited' | 'out' | 'no-sku' | 'error'

  async checkBestBuy(sku, storeId, apiKey) {
    if (!sku) return { status: 'no-sku', qty: null };
    if (!apiKey) return { status: 'no-key', qty: null };

    const url =
      `https://api.bestbuy.com/v1/products(sku=${sku})?` +
      `show=sku,name,inStoreAvailability,inStoreAvailabilityText` +
      `&storeId=${storeId}` +
      `&apiKey=${apiKey}` +
      `&format=json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`BB API ${res.status}`);
      const data = await res.json();
      const products = data.products || [];
      if (!products.length) return { status: 'out', qty: 0 };

      const p = products[0];
      if (p.inStoreAvailability === true) {
        return { status: 'in-stock', qty: null, text: p.inStoreAvailabilityText };
      }
      return { status: 'out', qty: 0 };
    } catch (err) {
      console.warn('Best Buy API error:', err);
      return { status: 'error', qty: null, error: err.message };
    }
  },

  // ── BEST BUY — product page URL ─────────────────────────────
  bestBuyProductUrl(sku) {
    if (!sku) return null;
    return `https://www.bestbuy.com/site/searchpage.jsp?st=${sku}`;
  },

  // ── TARGET via BrickSeek ─────────────────────────────────────
  // BrickSeek scrapes Target's internal inventory API.
  // We generate a direct deep-link per pack per store.
  // Users click through; no API key required.
  //
  // BrickSeek URL format:
  //   https://brickseek.com/target-inventory-checker/?upc={UPC}&zip={ZIP}
  //
  // For inline status we hit the unofficial Target inventory endpoint.
  // This is the same endpoint BrickSeek uses, documented here:
  //   https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2
  //
  // We use the simpler store-level availability endpoint:
  //   https://redsky.target.com/v3/stores/{storeId}/products/{tcin}?key=ff457966e64d5e877fdbad070f276d18ecec4a01

  brickseekUrl(upc, zip = '85142') {
    if (!upc) return null;
    return `https://brickseek.com/target-inventory-checker/?upc=${upc}&zip=${zip}`;
  },

  brickseekBBUrl(upc, zip = '85142') {
    if (!upc) return null;
    return `https://brickseek.com/best-buy-inventory-checker/?upc=${upc}&zip=${zip}`;
  },

  // Target unofficial redsky endpoint (no key needed as of 2025)
  async checkTarget(tcin, storeId) {
    if (!tcin) return { status: 'no-sku', qty: null };
    if (!storeId) return { status: 'no-store-id', qty: null };

    // Target's Redsky API — public endpoint, no auth required
    const key = 'ff457966e64d5e877fdbad070f276d18ecec4a01';
    const url =
      `https://redsky.target.com/v3/stores/${storeId}/products/${tcin}` +
      `?key=${key}&channel=WEB&page=%2Fp%2FA-${tcin}`;

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.status === 404) return { status: 'out', qty: 0 };
      if (!res.ok) throw new Error(`Target Redsky ${res.status}`);

      const data = await res.json();
      const loc = data?.locations?.[0];
      if (!loc) return { status: 'out', qty: 0 };

      const onHand = loc.onhand_quantity ?? 0;
      if (onHand <= 0) return { status: 'out', qty: 0 };
      if (onHand <= 3) return { status: 'limited', qty: onHand };
      return { status: 'in-stock', qty: onHand };
    } catch (err) {
      // CORS is a known issue when running locally without a proxy.
      // On GitHub Pages this will work if Target's CORS policy allows it;
      // otherwise the BrickSeek link is the fallback.
      console.warn('Target Redsky CORS/error:', err.message);
      return { status: 'cors-fallback', qty: null };
    }
  },

  // ── Batch check all selected packs for one store ─────────────
  async checkStore(store, packs, apiKey, zip) {
    const results = {};
    for (const pack of packs) {
      if (store.retailer === 'bestbuy') {
        results[pack.id] = await API.checkBestBuy(pack.bbSku, store.bbStoreId, apiKey);
      } else if (store.retailer === 'target') {
        results[pack.id] = await API.checkTarget(pack.tcin, store.tgtStoreId);
      } else {
        results[pack.id] = { status: 'no-sku' };
      }
      // Be kind to APIs — small delay between requests
      await new Promise(r => setTimeout(r, 200));
    }
    return results;
  },
};
