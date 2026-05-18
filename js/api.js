// ═══════════════════════════════════════
//  api.js — Inventory data fetching
//
//  Target:   Live data via your Cloudflare Worker proxy
//  Best Buy: BrickSeek links (no API key needed)
//
//  SETUP: After deploying your Cloudflare Worker,
//  paste your worker URL into Settings -> Worker URL
//  e.g. https://pokehunter-proxy.YOUR-NAME.workers.dev
// ═══════════════════════════════════════

const API = {

  // Target via Cloudflare Worker proxy
  // Returns: { status, qty }
  // status: 'in-stock' | 'limited' | 'out' | 'no-tcin' | 'no-worker' | 'error'
  async checkTarget(tcin, storeId, workerUrl) {
    if (!tcin)      return { status: 'no-tcin',     qty: null };
    if (!storeId)   return { status: 'no-store-id', qty: null };
    if (!workerUrl) return { status: 'no-worker',   qty: null };

    const targetApiUrl =
      `https://redsky.target.com/v3/stores/${storeId}/products/${tcin}` +
      `?key=ff457966e64d5e877fdbad070f276d18ecec4a01` +
      `&channel=WEB&page=%2Fp%2FA-${tcin}`;

    const proxyUrl = `${workerUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(targetApiUrl)}`;

    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return { status: 'out', qty: 0 };
      if (!res.ok) return { status: 'error', qty: null, error: `HTTP ${res.status}` };

      const data = await res.json();
      const locations = data?.locations ?? [];
      const loc = locations.find(l => String(l.location_id) === String(storeId)) ?? locations[0];

      if (!loc) return { status: 'out', qty: 0 };
      const qty = loc.onhand_quantity ?? loc.available_to_promise_quantity ?? 0;
      if (qty <= 0) return { status: 'out',     qty: 0 };
      if (qty <= 3) return { status: 'limited', qty };
      return          { status: 'in-stock',     qty };
    } catch (err) {
      console.warn('Target fetch error:', err.message);
      return { status: 'error', qty: null, error: err.message };
    }
  },

  targetProductUrl(tcin) {
    return tcin ? `https://www.target.com/p/-/A-${tcin}` : null;
  },

  brickseekTargetUrl(upc, zip = '85142') {
    return upc ? `https://brickseek.com/target-inventory-checker/?upc=${upc}&zip=${zip}` : null;
  },

  brickseekBBUrl(upc, zip = '85142') {
    return upc ? `https://brickseek.com/best-buy-inventory-checker/?upc=${upc}&zip=${zip}` : null;
  },

  bestBuyProductUrl(sku) {
    return sku ? `https://www.bestbuy.com/site/searchpage.jsp?st=${sku}` : null;
  },

  async checkStore(store, packs, settings) {
    const results = {};
    for (const pack of packs) {
      if (store.retailer === 'target') {
        results[pack.id] = await API.checkTarget(pack.tcin, store.tgtStoreId, settings.workerUrl);
      } else if (store.retailer === 'bestbuy') {
        results[pack.id] = pack.bbSku
          ? { status: 'use-brickseek', qty: null }
          : { status: 'no-sku',        qty: null };
      } else {
        results[pack.id] = { status: 'unknown', qty: null };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return results;
  },
};
