// ═══════════════════════════════════════
//  app.js — Poké Pack Hunter main logic
// ═══════════════════════════════════════

// ── State ────────────────────────────────────────────────────
let stores      = [];
let packs       = [];
let selectedIds = new Set();   // active pack IDs to track
let stockState  = {};          // { storeId: { packId: {status, qty} } }
let scanHistory = [];
let settings    = {
  bbApiKey:       '',
  zip:            '85142',
  email:          '',
  interval:       30,
  notify:         false,
  sound:          false,
};
let autoTimer   = null;
let isScanning  = false;
let lastPrevState = {};  // for restock detection

// ── Boot ─────────────────────────────────────────────────────
(function init() {
  loadSettings();
  loadStores();
  loadPacks();
  loadSelected();
  loadStockState();
  applySettings();
  renderAll();
  scheduleAuto();
  updateHeaderSub();
})();

// ── Persistence helpers ───────────────────────────────────────
function ls(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function loadSettings()   { settings    = { ...settings, ...ls('ph_settings', {}) }; }
function saveSettingsLS()  { lsSet('ph_settings', settings); }

function loadStores() {
  const saved = ls('ph_stores', null);
  stores = saved ? saved : JSON.parse(JSON.stringify(DEFAULT_STORES));
}
function saveStores() { lsSet('ph_stores', stores); }

function loadPacks() {
  const saved = ls('ph_packs', null);
  packs = saved ? saved : JSON.parse(JSON.stringify(DEFAULT_PACKS));
}
function savePacks() { lsSet('ph_packs', packs); }

function loadSelected() {
  const saved = ls('ph_selected', null);
  if (saved) {
    selectedIds = new Set(saved);
  } else {
    // Default: select first 3
    selectedIds = new Set(packs.slice(0, 3).map(p => p.id));
  }
}
function saveSelected() { lsSet('ph_selected', [...selectedIds]); }

function loadStockState() { stockState = ls('ph_stock', {}); }
function saveStockState() { lsSet('ph_stock', stockState); }

// ── Render ────────────────────────────────────────────────────
function renderAll() {
  renderPacks();
  renderStores();
  renderLog();
}

// ── Pack list ─────────────────────────────────────────────────
function renderPacks() {
  const el = document.getElementById('packList');
  if (!packs.length) {
    el.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">No packs. Click + Add.</div>';
    return;
  }
  el.innerHTML = packs.map(p => {
    const active = selectedIds.has(p.id);
    const bsUrl  = p.upc ? API.brickseekUrl(p.upc, settings.zip) : null;
    return `
    <div class="pack-item ${active ? 'active' : ''}" id="pi_${p.id}" onclick="togglePack('${p.id}')">
      <span class="pack-emoji">${p.emoji || '📦'}</span>
      <div class="pack-info">
        <div class="pack-name">${p.name}</div>
        <div class="pack-meta">${p.price || ''}${p.bbSku ? ' · BB SKU: ' + p.bbSku : ''}${p.tcin ? ' · TCIN: ' + p.tcin : ''}</div>
      </div>
      <div class="pack-actions" onclick="event.stopPropagation()">
        ${bsUrl ? `<a class="pack-brickseek" href="${bsUrl}" target="_blank" title="Check BrickSeek for Target stock">BrickSeek</a>` : ''}
        <button class="pack-delete" onclick="deletePack('${p.id}')" title="Remove pack">✕</button>
      </div>
      <div class="pack-check">✓</div>
    </div>`;
  }).join('');
}

function togglePack(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  saveSelected();
  renderPacks();
  renderStores();
}

function deletePack(id) {
  if (!confirm('Remove this pack from tracking?')) return;
  packs = packs.filter(p => p.id !== id);
  selectedIds.delete(id);
  savePacks();
  saveSelected();
  renderPacks();
  renderStores();
}

// ── Stores ────────────────────────────────────────────────────
function renderStores() {
  const grid = document.getElementById('storeGrid');
  if (!stores.length) {
    grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;grid-column:1/-1;">No stores. Click + Add Store.</div>';
    return;
  }
  const tracked = packs.filter(p => selectedIds.has(p.id));

  grid.innerHTML = stores.map(store => {
    const badge     = store.retailer === 'target' ? '🎯' : '🟨';
    const badgeCls  = store.retailer === 'target' ? 'target' : 'bestbuy';
    const storeStock = stockState[store.id] || {};

    const items = tracked.length === 0
      ? '<div class="store-empty">Select packs on the left →</div>'
      : tracked.map(pack => {
          const result = storeStock[pack.id];
          let badgeHtml = '';
          let rowCls    = '';
          let bsLink    = '';

          if (!result) {
            badgeHtml = `<span class="badge no-sku">Not checked</span>`;
          } else {
            const s = result.status;
            if (s === 'in-stock')      { badgeHtml = `<span class="badge in-stock">✓ In Stock${result.qty ? ' ('+result.qty+')' : ''}</span>`; rowCls = 'in-stock'; }
            else if (s === 'limited')  { badgeHtml = `<span class="badge limited">Low (${result.qty})</span>`; rowCls = 'in-stock'; }
            else if (s === 'out')      { badgeHtml = `<span class="badge out">Out of Stock</span>`; }
            else if (s === 'checking') { badgeHtml = `<span class="badge checking">Scanning…</span>`; }
            else if (s === 'no-sku')   { badgeHtml = `<span class="badge no-sku">No SKU set</span>`; }
            else if (s === 'no-key')   { badgeHtml = `<span class="badge no-sku">Need API key</span>`; }
            else if (s === 'cors-fallback') { badgeHtml = `<span class="badge no-sku">Use BrickSeek ↓</span>`; }
            else                       { badgeHtml = `<span class="badge out">Error</span>`; }
          }

          // BrickSeek inline link for Target
          if (store.retailer === 'target' && pack.upc) {
            const url = API.brickseekUrl(pack.upc, settings.zip);
            bsLink = `<a class="bs-link" href="${url}" target="_blank">BrickSeek</a>`;
          }
          // Best Buy product link
          if (store.retailer === 'bestbuy' && pack.bbSku) {
            const url = API.bestBuyProductUrl(pack.bbSku);
            bsLink = `<a class="bs-link" href="${url}" target="_blank">BB.com</a>`;
          }

          return `
          <div class="item-row ${rowCls}">
            <div class="item-left">
              <div class="item-name">${pack.emoji} ${pack.name}</div>
              <div class="item-sub">${pack.price || ''}</div>
            </div>
            <div class="item-right">
              ${badgeHtml}
              ${bsLink}
            </div>
          </div>`;
        }).join('');

    return `
    <div class="store-card" id="sc_${store.id}">
      <div class="store-head">
        <div class="store-badge ${badgeCls}">${badge}</div>
        <div class="store-name-wrap">
          <div class="store-title">${store.name}</div>
          <div class="store-loc">${store.location}</div>
          <div class="store-dist">📍 ${store.dist} · ${store.hours || ''}</div>
        </div>
        <button class="store-delete-btn" onclick="deleteStore('${store.id}')" title="Remove store">✕</button>
      </div>
      <div class="store-items">${items}</div>
    </div>`;
  }).join('');

  document.getElementById('storeCount').textContent = stores.length;
}

function deleteStore(id) {
  if (!confirm('Remove this store from tracking?')) return;
  stores = stores.filter(s => s.id !== id);
  delete stockState[id];
  saveStores();
  saveStockState();
  renderStores();
}

// ── Scan ──────────────────────────────────────────────────────
async function runAllChecks() {
  if (isScanning) return;
  isScanning = true;

  const btn = document.getElementById('checkBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Scanning…';

  const pill = document.getElementById('statusPill');
  pill.classList.add('scanning');
  document.getElementById('statusText').textContent = 'SCANNING';

  const tracked = packs.filter(p => selectedIds.has(p.id));
  if (!tracked.length) {
    addLog('⚠️', 'No packs selected. Click a pack on the left to track it.');
    finishScan(btn, pill);
    return;
  }

  addLog('🔍', `Scanning ${stores.length} store${stores.length !== 1 ? 's' : ''} for ${tracked.length} pack${tracked.length !== 1 ? 's' : ''}…`);

  // Save previous state for restock detection
  lastPrevState = JSON.parse(JSON.stringify(stockState));

  // Mark everything as checking
  stores.forEach(store => {
    if (!stockState[store.id]) stockState[store.id] = {};
    tracked.forEach(p => { stockState[store.id][p.id] = { status: 'checking' }; });
  });
  renderStores();

  // Check stores sequentially (avoid rate-limiting)
  for (const store of stores) {
    const storeResults = await API.checkStore(store, tracked, settings.bbApiKey, settings.zip);
    stockState[store.id] = { ...stockState[store.id], ...storeResults };

    // Detect restocks
    tracked.forEach(pack => {
      const prev = lastPrevState[store.id]?.[pack.id]?.status;
      const curr = storeResults[pack.id]?.status;
      const wasOut   = !prev || prev === 'out' || prev === 'error' || prev === 'cors-fallback';
      const isNowIn  = curr === 'in-stock' || curr === 'limited';
      if (wasOut && isNowIn) {
        const msg = `${pack.emoji} ${pack.name} ${curr === 'limited' ? '(low stock)' : ''} at ${store.name} ${store.location}!`;
        triggerRestock(msg, store, pack);
      }
    });

    // Log per-store result
    const inCount  = tracked.filter(p => storeResults[p.id]?.status === 'in-stock').length;
    const limCount = tracked.filter(p => storeResults[p.id]?.status === 'limited').length;
    const errCount = tracked.filter(p => ['error','cors-fallback','no-key'].includes(storeResults[p.id]?.status)).length;

    if (inCount || limCount) {
      addLog('✅', `${store.name} ${store.location}: ${inCount + limCount} pack(s) available!`);
    } else if (errCount) {
      addLog('⚠️', `${store.name} ${store.location}: ${errCount} check(s) failed — verify API key or use BrickSeek.`);
    } else {
      addLog('❌', `${store.name} ${store.location}: all tracked packs out of stock.`);
    }

    renderStores();
  }

  const now = new Date();
  document.getElementById('lastCheckTime').textContent =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  saveStockState();
  addLog('✔️', 'Scan complete.');
  finishScan(btn, pill);
}

function finishScan(btn, pill) {
  isScanning = false;
  btn.disabled = false;
  btn.textContent = '🔍 Scan All Stores';
  pill.classList.remove('scanning');
  document.getElementById('statusText').textContent = 'LIVE';
}

// ── Restock alert ─────────────────────────────────────────────
function triggerRestock(msg, store, pack) {
  document.getElementById('restockMsg').textContent = msg;
  const url = store.retailer === 'target' && pack.upc
    ? API.brickseekUrl(pack.upc, settings.zip)
    : store.retailer === 'bestbuy' && pack.bbSku
      ? API.bestBuyProductUrl(pack.bbSku)
      : '#';
  document.getElementById('restockLink').href = url;
  document.getElementById('restockBanner').classList.add('show');
  addLog('🚨', `RESTOCK: ${msg}`);

  if (settings.sound) playChime();

  if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('🎉 Poké Pack Restock!', {
      body: msg,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
    });
  }
}

function hideBanner() { document.getElementById('restockBanner').classList.remove('show'); }

function playChime() {
  try {
    const ctx = new AudioContext();
    const notes = [880, 1108, 1318, 1760];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch {}
}

// ── Auto-check ────────────────────────────────────────────────
function scheduleAuto() {
  clearInterval(autoTimer);
  if (settings.interval > 0) {
    autoTimer = setInterval(() => { if (!isScanning) runAllChecks(); }, settings.interval * 60 * 1000);
    document.getElementById('autoBadge').textContent = `⏱ Auto: ${settings.interval}min`;
  } else {
    document.getElementById('autoBadge').textContent = '⏱ Manual only';
  }
}

// ── Log ───────────────────────────────────────────────────────
function addLog(icon, text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  scanHistory.unshift({ icon, text, time });
  if (scanHistory.length > 50) scanHistory.pop();
  renderLog();
}

function renderLog() {
  document.getElementById('scanLog').innerHTML = scanHistory.length
    ? scanHistory.map(e => `
        <div class="log-entry">
          <span class="log-icon">${e.icon}</span>
          <span class="log-text">${e.text}</span>
          <span class="log-time">${e.time}</span>
        </div>`).join('')
    : '<div class="log-entry"><span class="log-icon">ℹ️</span><span class="log-text">Log is empty.</span></div>';
}

function clearLog() { scanHistory = []; renderLog(); }

// ── Settings modal ────────────────────────────────────────────
function openModal(id) {
  if (id === 'settingsModal') populateSettingsForm();
  document.getElementById(id).classList.add('open');
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function populateSettingsForm() {
  document.getElementById('bbApiKey').value      = settings.bbApiKey || '';
  document.getElementById('userZip').value       = settings.zip || '85142';
  document.getElementById('alertEmail').value    = settings.email || '';
  document.getElementById('checkInterval').value = settings.interval || 30;
  document.getElementById('toggleNotify').checked = settings.notify || false;
  document.getElementById('toggleSound').checked  = settings.sound || false;
}

function saveSettings() {
  settings.bbApiKey  = document.getElementById('bbApiKey').value.trim();
  settings.zip       = document.getElementById('userZip').value.trim() || '85142';
  settings.email     = document.getElementById('alertEmail').value.trim();
  settings.interval  = parseInt(document.getElementById('checkInterval').value) || 30;
  settings.notify    = document.getElementById('toggleNotify').checked;
  settings.sound     = document.getElementById('toggleSound').checked;
  saveSettingsLS();
  applySettings();
  scheduleAuto();
  updateHeaderSub();
  closeModal('settingsModal');
  addLog('⚙️', 'Settings saved.');
}

function applySettings() {
  document.getElementById('headerZip').textContent = settings.zip || '85142';
}

function handleNotifyToggle(el) {
  if (el.checked && 'Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission().then(p => {
      if (p !== 'granted') el.checked = false;
    });
  }
}

// ── Add Store modal ───────────────────────────────────────────
function updateStoreIdHint() {
  const r = document.getElementById('newStoreRetailer').value;
  document.getElementById('bbStoreIdRow').style.display  = r === 'bestbuy' ? 'block' : 'none';
  document.getElementById('tgtStoreIdRow').style.display = r === 'target'  ? 'block' : 'none';
}

function saveNewStore() {
  const retailer = document.getElementById('newStoreRetailer').value;
  const name     = document.getElementById('newStoreName').value.trim();
  const addr     = document.getElementById('newStoreAddr').value.trim();
  const dist     = document.getElementById('newStoreDist').value.trim();
  const phone    = document.getElementById('newStorePhone').value.trim();
  const hours    = document.getElementById('newStoreHours').value.trim();
  const bbId     = document.getElementById('newStoreBBId').value.trim();
  const tgtId    = document.getElementById('newStoreTgtId').value.trim();

  if (!name) { alert('Please enter a store name.'); return; }

  const id = 'custom_' + Date.now();
  const [storeBrand, ...locationParts] = name.split(' ');
  stores.push({
    id, retailer,
    name: retailer === 'bestbuy' ? 'Best Buy' : 'Target',
    location: name,
    addr, dist, phone, hours,
    bbStoreId: bbId || null,
    tgtStoreId: tgtId || null,
  });

  saveStores();
  renderStores();
  closeModal('addStoreModal');
  // Clear fields
  ['newStoreName','newStoreAddr','newStoreDist','newStorePhone','newStoreHours','newStoreBBId','newStoreTgtId']
    .forEach(id => { document.getElementById(id).value = ''; });
  addLog('🏪', `Store added: ${name}`);
}

// ── Add Pack modal ────────────────────────────────────────────
function saveNewPack() {
  const name  = document.getElementById('newPackName').value.trim();
  const emoji = document.getElementById('newPackEmoji').value.trim() || '📦';
  const price = document.getElementById('newPackPrice').value.trim();
  const bbSku = document.getElementById('newPackBBSku').value.trim();
  const tcin  = document.getElementById('newPackTcin').value.trim();
  const upc   = document.getElementById('newPackUpc').value.trim();

  if (!name) { alert('Please enter a pack name.'); return; }

  const id = 'custom_' + Date.now();
  packs.push({ id, name, emoji, price, bbSku: bbSku || null, tcin: tcin || null, upc: upc || null });
  selectedIds.add(id);  // auto-select new packs
  savePacks();
  saveSelected();
  renderPacks();
  renderStores();
  closeModal('addPackModal');
  ['newPackName','newPackEmoji','newPackPrice','newPackBBSku','newPackTcin','newPackUpc']
    .forEach(id => { document.getElementById(id).value = ''; });
  addLog('🃏', `Pack added: ${name}`);
}

// ── Misc ──────────────────────────────────────────────────────
function updateHeaderSub() {
  document.getElementById('storeCount').textContent = stores.length;
  document.getElementById('headerZip').textContent  = settings.zip || '85142';
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
