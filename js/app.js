// ═══════════════════════════════════════
//  app.js — Poké Pack Hunter main logic
// ═══════════════════════════════════════

// ── State ────────────────────────────────────────────────────
let stores      = [];
let packs       = [];
let selectedIds = new Set();
let stockState  = {};
let scanHistory = [];
let settings    = {
  workerUrl:    '',
  targetCookie: '',
  zip:          '85142',
  email:        '',
  interval:     30,
  notify:       false,
  sound:        false,
};
let autoTimer  = null;
let isScanning = false;
let lastPrevState = {};

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

// ── Persistence ───────────────────────────────────────────────
function ls(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function loadSettings()  { settings   = { ...settings, ...ls('ph_settings', {}) }; }
function saveSettingsLS(){ lsSet('ph_settings', settings); }
function loadStores()    { stores     = ls('ph_stores', null) ?? JSON.parse(JSON.stringify(DEFAULT_STORES)); }
function saveStores()    { lsSet('ph_stores', stores); }
function loadPacks()     { packs      = ls('ph_packs',  null) ?? JSON.parse(JSON.stringify(DEFAULT_PACKS)); }
function savePacks()     { lsSet('ph_packs',  packs); }
function loadSelected()  {
  const saved = ls('ph_selected', null);
  selectedIds = saved ? new Set(saved) : new Set(packs.slice(0, 3).map(p => p.id));
}
function saveSelected()  { lsSet('ph_selected', [...selectedIds]); }
function loadStockState(){ stockState = ls('ph_stock', {}); }
function saveStockState(){ lsSet('ph_stock', stockState); }

// ── Render ────────────────────────────────────────────────────
function renderAll() { renderPacks(); renderStores(); renderLog(); }

// ── Pack list ─────────────────────────────────────────────────
function renderPacks() {
  const el = document.getElementById('packList');
  if (!packs.length) {
    el.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">No packs. Click + Add.</div>';
    return;
  }
  el.innerHTML = packs.map(p => {
    const active = selectedIds.has(p.id);
    const bsUrl  = p.upc ? API.brickseekTargetUrl(p.upc, settings.zip) : null;
    return `
    <div class="pack-item ${active ? 'active' : ''}" onclick="togglePack('${p.id}')">
      <span class="pack-emoji">${p.emoji || '📦'}</span>
      <div class="pack-info">
        <div class="pack-name">${p.name}</div>
        <div class="pack-meta">${p.price || ''}${p.tcin ? ' · TCIN: ' + p.tcin : ''}${p.bbSku ? ' · SKU: ' + p.bbSku : ''}</div>
      </div>
      <div class="pack-actions" onclick="event.stopPropagation()">
        ${bsUrl ? `<a class="pack-brickseek" href="${bsUrl}" target="_blank">BrickSeek</a>` : ''}
        <button class="pack-delete" onclick="deletePack('${p.id}')">✕</button>
      </div>
      <div class="pack-check">✓</div>
    </div>`;
  }).join('');
}

function togglePack(id) {
  selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
  saveSelected(); renderPacks(); renderStores();
}

function deletePack(id) {
  if (!confirm('Remove this pack?')) return;
  packs = packs.filter(p => p.id !== id);
  selectedIds.delete(id);
  savePacks(); saveSelected(); renderPacks(); renderStores();
}

// ── Stores ────────────────────────────────────────────────────
function renderStores() {
  const grid = document.getElementById('storeGrid');
  const tracked = packs.filter(p => selectedIds.has(p.id));

  if (!stores.length) {
    grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;grid-column:1/-1;">No stores. Click + Add Store.</div>';
    return;
  }

  grid.innerHTML = stores.map(store => {
    const isTarget = store.retailer === 'target';
    const badge    = isTarget ? '🎯' : '🟨';
    const badgeCls = isTarget ? 'target' : 'bestbuy';
    const storeStock = stockState[store.id] || {};
    const noWorker = isTarget && (!settings.workerUrl || !settings.targetCookie);

    const items = tracked.length === 0
      ? '<div class="store-empty">Select packs on the left to track</div>'
      : tracked.map(pack => {
          const result = storeStock[pack.id];
          let badgeHtml = '', rowCls = '', actionLink = '';

          // Build status badge
          if (noWorker && isTarget) {
            badgeHtml = `<span class="badge no-sku" title="Add Worker URL in Settings">⚙️ Setup needed</span>`;
          } else if (!result) {
            badgeHtml = `<span class="badge no-sku">Not checked</span>`;
          } else {
            const s = result.status;
            if      (s === 'in-stock')      { badgeHtml = `<span class="badge in-stock">✓ In Stock (${result.qty})</span>`; rowCls = 'in-stock'; }
            else if (s === 'limited')       { badgeHtml = `<span class="badge limited">⚠ Low Stock (${result.qty})</span>`; rowCls = 'in-stock'; }
            else if (s === 'out')           { badgeHtml = `<span class="badge out">Out of Stock</span>`; }
            else if (s === 'checking')      { badgeHtml = `<span class="badge checking">Scanning…</span>`; }
            else if (s === 'no-tcin')       { badgeHtml = `<span class="badge no-sku">No TCIN set</span>`; }
            else if (s === 'no-store-id')   { badgeHtml = `<span class="badge no-sku">No Store ID</span>`; }
            else if (s === 'no-worker')     { badgeHtml = `<span class="badge no-sku">⚙️ Add Worker URL</span>`; }
            else if (s === 'no-cookie')     { badgeHtml = `<span class="badge no-sku">⚙️ Add Target Cookie</span>`; }
            else if (s === 'use-brickseek') { badgeHtml = `<span class="badge no-sku">See BrickSeek →</span>`; }
            else if (s === 'no-sku')        { badgeHtml = `<span class="badge no-sku">No SKU</span>`; }
            else                            { badgeHtml = `<span class="badge out">Error</span>`; }
          }

          // Action link — prefer product page when in stock, BrickSeek otherwise
          if (isTarget) {
            const url = (result?.status === 'in-stock' || result?.status === 'limited')
              ? API.targetProductUrl(pack.tcin)
              : API.brickseekTargetUrl(pack.upc, settings.zip);
            if (url) actionLink = `<a class="bs-link" href="${url}" target="_blank">${result?.status === 'in-stock' || result?.status === 'limited' ? 'Target.com' : 'BrickSeek'}</a>`;
          } else {
            const url = API.brickseekBBUrl(pack.upc, settings.zip) ?? API.bestBuyProductUrl(pack.bbSku);
            if (url) actionLink = `<a class="bs-link" href="${url}" target="_blank">BrickSeek</a>`;
          }

          return `
          <div class="item-row ${rowCls}">
            <div class="item-left">
              <div class="item-name">${pack.emoji} ${pack.name}</div>
              <div class="item-sub">${pack.price || ''}</div>
            </div>
            <div class="item-right">${badgeHtml}${actionLink}</div>
          </div>`;
        }).join('');

    return `
    <div class="store-card" id="sc_${store.id}">
      <div class="store-head">
        <div class="store-badge ${badgeCls}">${badge}</div>
        <div class="store-name-wrap">
          <div class="store-title">${store.name}</div>
          <div class="store-loc">${store.location}</div>
          <div class="store-dist">📍 ${store.dist}${store.hours ? ' · ' + store.hours : ''}</div>
        </div>
        <button class="store-delete-btn" onclick="deleteStore('${store.id}')">✕</button>
      </div>
      <div class="store-items">${items}</div>
    </div>`;
  }).join('');

  document.getElementById('storeCount').textContent = stores.length;
}

function deleteStore(id) {
  if (!confirm('Remove this store?')) return;
  stores = stores.filter(s => s.id !== id);
  delete stockState[id];
  saveStores(); saveStockState(); renderStores();
}

// ── Scan ──────────────────────────────────────────────────────
async function runAllChecks() {
  if (isScanning) return;
  isScanning = true;

  const btn  = document.getElementById('checkBtn');
  const pill = document.getElementById('statusPill');
  btn.disabled = true;
  btn.textContent = '⏳ Scanning…';
  pill.classList.add('scanning');
  document.getElementById('statusText').textContent = 'SCANNING';

  const tracked = packs.filter(p => selectedIds.has(p.id));
  if (!tracked.length) {
    addLog('⚠️', 'No packs selected — click a pack on the left to start tracking.');
    return finishScan(btn, pill);
  }

  const targetStores = stores.filter(s => s.retailer === 'target');
  if (targetStores.length && (!settings.workerUrl || !settings.targetCookie)) {
    addLog('⚙️', 'Worker URL or Target Cookie not set — Target stores will show "Setup needed". Add both in ⚙️ Settings.');
  }

  addLog('🔍', `Scanning ${stores.length} store${stores.length !== 1 ? 's' : ''} for ${tracked.length} pack${tracked.length !== 1 ? 's' : ''}…`);
  lastPrevState = JSON.parse(JSON.stringify(stockState));

  // Mark all as checking
  stores.forEach(store => {
    if (!stockState[store.id]) stockState[store.id] = {};
    tracked.forEach(p => { stockState[store.id][p.id] = { status: 'checking' }; });
  });
  renderStores();

  for (const store of stores) {
    const results = await API.checkStore(store, tracked, settings);
    stockState[store.id] = { ...stockState[store.id], ...results };

    // Restock detection
    tracked.forEach(pack => {
      const prev = lastPrevState[store.id]?.[pack.id]?.status;
      const curr = results[pack.id]?.status;
      const wasOut  = !prev || ['out','error','no-worker','checking'].includes(prev);
      const isNowIn = curr === 'in-stock' || curr === 'limited';
      if (wasOut && isNowIn) {
        triggerRestock(`${pack.emoji} ${pack.name}${curr === 'limited' ? ' (low stock)' : ''} at ${store.name} ${store.location}!`, store, pack);
      }
    });

    // Per-store log
    const inCount  = tracked.filter(p => results[p.id]?.status === 'in-stock').length;
    const limCount = tracked.filter(p => results[p.id]?.status === 'limited').length;
    const errCount = tracked.filter(p => ['error','no-worker'].includes(results[p.id]?.status)).length;

    if (inCount || limCount) {
      addLog('✅', `${store.name} ${store.location}: ${inCount + limCount} pack(s) available!`);
    } else if (errCount && store.retailer === 'target') {
      addLog('⚠️', `${store.name} ${store.location}: check failed — verify Worker URL in ⚙️ Settings.`);
    } else if (results[Object.keys(results)[0]]?.status === 'no-worker') {
      addLog('⚙️', `${store.name} ${store.location}: Worker URL needed for live data.`);
    } else {
      addLog('❌', `${store.name} ${store.location}: all tracked packs out of stock.`);
    }

    renderStores();
  }

  document.getElementById('lastCheckTime').textContent =
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  const url = store.retailer === 'target'
    ? (API.targetProductUrl(pack.tcin) ?? API.brickseekTargetUrl(pack.upc, settings.zip) ?? '#')
    : (API.brickseekBBUrl(pack.upc, settings.zip) ?? API.bestBuyProductUrl(pack.bbSku) ?? '#');
  document.getElementById('restockLink').href = url;
  document.getElementById('restockBanner').classList.add('show');
  addLog('🚨', `RESTOCK: ${msg}`);
  if (settings.sound) playChime();
  if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('🎉 Poké Pack Restock!', { body: msg });
  }
}

function hideBanner() { document.getElementById('restockBanner').classList.remove('show'); }

function playChime() {
  try {
    const ctx = new AudioContext();
    [880, 1108, 1318, 1760].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.35);
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
  if (scanHistory.length > 60) scanHistory.pop();
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
  if (id === 'addStoreModal') updateStoreIdHint();
  document.getElementById(id).classList.add('open');
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function populateSettingsForm() {
  document.getElementById('workerUrl').value      = settings.workerUrl || '';
  document.getElementById('targetCookie').value   = settings.targetCookie || '';
  document.getElementById('userZip').value        = settings.zip || '85142';
  document.getElementById('alertEmail').value     = settings.email || '';
  document.getElementById('checkInterval').value  = settings.interval || 30;
  document.getElementById('toggleNotify').checked = !!settings.notify;
  document.getElementById('toggleSound').checked  = !!settings.sound;
}

function saveSettings() {
  settings.workerUrl    = document.getElementById('workerUrl').value.trim().replace(/\/$/, '');
  settings.targetCookie = document.getElementById('targetCookie').value.trim();
  settings.zip          = document.getElementById('userZip').value.trim() || '85142';
  settings.email     = document.getElementById('alertEmail').value.trim();
  settings.interval  = parseInt(document.getElementById('checkInterval').value) || 30;
  settings.notify    = document.getElementById('toggleNotify').checked;
  settings.sound     = document.getElementById('toggleSound').checked;
  saveSettingsLS();
  applySettings();
  scheduleAuto();
  updateHeaderSub();
  closeModal('settingsModal');
  addLog('⚙️', `Settings saved. Worker URL: ${settings.workerUrl || 'not set'}`);
  renderStores(); // re-render to clear "setup needed" badges if worker was just added
}

function applySettings() {
  document.getElementById('headerZip').textContent = settings.zip || '85142';
}

function handleNotifyToggle(el) {
  if (el.checked && 'Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission().then(p => { if (p !== 'granted') el.checked = false; });
  }
}

// ── Add Store ────────────────────────────────────────────────
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

  stores.push({
    id: 'custom_' + Date.now(), retailer,
    name: retailer === 'bestbuy' ? 'Best Buy' : 'Target',
    location: name, addr, dist, phone, hours,
    bbStoreId: bbId || null, tgtStoreId: tgtId || null,
  });
  saveStores(); renderStores(); closeModal('addStoreModal');
  ['newStoreName','newStoreAddr','newStoreDist','newStorePhone','newStoreHours','newStoreBBId','newStoreTgtId']
    .forEach(id => { document.getElementById(id).value = ''; });
  addLog('🏪', `Store added: ${name}`);
}

// ── Add Pack ─────────────────────────────────────────────────
function saveNewPack() {
  const name  = document.getElementById('newPackName').value.trim();
  const emoji = document.getElementById('newPackEmoji').value.trim() || '📦';
  const price = document.getElementById('newPackPrice').value.trim();
  const bbSku = document.getElementById('newPackBBSku').value.trim();
  const tcin  = document.getElementById('newPackTcin').value.trim();
  const upc   = document.getElementById('newPackUpc').value.trim();
  if (!name) { alert('Please enter a pack name.'); return; }

  const id = 'custom_' + Date.now();
  packs.push({ id, name, emoji, price, bbSku: bbSku||null, tcin: tcin||null, upc: upc||null });
  selectedIds.add(id);
  savePacks(); saveSelected(); renderPacks(); renderStores(); closeModal('addPackModal');
  ['newPackName','newPackEmoji','newPackPrice','newPackBBSku','newPackTcin','newPackUpc']
    .forEach(id => { document.getElementById(id).value = ''; });
  addLog('🃏', `Pack added: ${name}`);
}

// ── Misc ─────────────────────────────────────────────────────
function updateHeaderSub() {
  document.getElementById('storeCount').textContent = stores.length;
  document.getElementById('headerZip').textContent  = settings.zip || '85142';
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});
