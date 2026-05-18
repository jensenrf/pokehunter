// ═══════════════════════════════════════
//  api.js — Inventory data fetching
//  Target: via Cloudflare Worker -> Target Redsky aggregations endpoint
// ═══════════════════════════════════════

const API = {

  // ── Target inventory via Worker ───────────────────────────────
  // Uses the pdp_fulfillment_v1 endpoint — the current working one
  // as of 2025, used by Target's own web app.
  async checkTarget(tcin, storeId, workerUrl) {
    if (!tcin)      return { status: 'no-tcin',     qty: null };
    if (!storeId)   return { status: 'no-store-id', qty: null };
    if (!workerUrl) return { status: 'no-worker',   qty: null };

    // Current working Target endpoint (pdp_fulfillment_v1)
    const params = new URLSearchParams({
      key: 'ff457966e64d5e877fdbad070f276d18ecec4a01',
      tcin,
      store_id: storeId,
      store_positions_store_id: storeId,
      has_store_positions_store_id: 'true',
      zip: '85142',
      state: 'AZ',
      latitude: '33.25',
      longitude: '-111.64',
      pricing_store_id: storeId,
      has_pricing_store_id: 'true',
      scheduled_delivery_store_id: storeId,
      has_scheduled_delivery_store_id: 'true',
      is_bot: 'false',
    });

    const targetApiUrl = `https://redsky.target.com/redsky_aggregations/v1/web/pdp_fulfillment_v1?${params}`;

    // Pass URL to worker — single encodeURIComponent (worker decodes once)
    const proxyUrl = `${workerUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(targetApiUrl)}`;

    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();

      // Log raw response for debugging
      console.log(`Target [store ${storeId}, tcin ${tcin}] HTTP ${res.status}:`, text.slice(0, 300));

      if (res.status === 404) return { status: 'out', qty: 0 };
      if (!res.ok) return { status: 'error', qty: null, error: `HTTP ${res.status}` };

      let data;
      try { data = JSON.parse(text); }
      catch { return { status: 'error', qty: null, error: 'Bad JSON from Target' }; }

      // pdp_fulfillment_v1 response shape:
      // data.product.fulfillment.store_options[].location_available_to_promise_quantity
      const storeOptions = data?.product?.fulfillment?.store_options ?? [];
      const storeOpt = storeOptions.find(o => String(o.location_id) === String(storeId))
                       ?? storeOptions[0];

      if (!storeOpt) return { status: 'out', qty: 0 };

      // in_store_only or order_pickup both mean physically on shelf
      const qty = storeOpt.location_available_to_promise_quantity ?? 0;
      const avail = storeOpt.in_store_only?.availability_status
                 ?? storeOpt.order_pickup?.availability_status
                 ?? '';

      if (avail === 'IN_STOCK' || qty > 3) return { status: 'in-stock', qty };
      if (avail === 'LIMITED'  || (qty > 0 && qty <= 3)) return { status: 'limited', qty };
      return { status: 'out', qty: 0 };

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
          : { status: 'no-sku', qty: null };
      } else {
        results[pack.id] = { status: 'unknown', qty: null };
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return results;
  },
};
