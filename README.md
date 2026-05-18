# ⚡ Poké Pack Hunter

A real-time Pokémon card pack inventory tracker for your local **Best Buy** and **Target** stores — hosted free on GitHub Pages.

---

## 🗂 File Structure

```
pokehunter/
├── index.html        ← Main page
├── css/
│   └── style.css     ← All styles
├── js/
│   ├── data.js       ← Default stores & packs (SKUs, TCINs, UPCs)
│   ├── api.js        ← Best Buy API + Target Redsky + BrickSeek links
│   └── app.js        ← App logic, UI, localStorage persistence
└── README.md
```

---

## 🚀 Hosting on GitHub Pages — Step by Step

### 1. Create a GitHub account (if you don't have one)
Go to [github.com](https://github.com) → Sign up (free).

### 2. Create a new repository
1. Click the **+** icon (top-right) → **New repository**
2. Name it: `pokehunter` (or anything you like)
3. Set to **Public**
4. Click **Create repository**

### 3. Upload the files
**Option A — drag & drop (easiest):**
1. On your new repo page, click **uploading an existing file**
2. Drag the entire `pokehunter/` folder contents into the browser
3. Make sure the folder structure is preserved:
   - `index.html` at the root
   - `css/style.css`
   - `js/data.js`, `js/api.js`, `js/app.js`
4. Click **Commit changes**

**Option B — Git CLI:**
```bash
cd pokehunter
git init
git add .
git commit -m "Initial Poké Pack Hunter"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pokehunter.git
git push -u origin main
```

### 4. Enable GitHub Pages
1. In your repo, click **Settings** → **Pages** (left sidebar)
2. Under **Source**, select **Deploy from a branch**
3. Branch: **main** · Folder: **/ (root)**
4. Click **Save**
5. After ~60 seconds, your site will be live at:
   ```
   https://YOUR_USERNAME.github.io/pokehunter/
   ```

---

## 🔑 Getting a Free Best Buy API Key

1. Go to [developer.bestbuy.com](https://developer.bestbuy.com)
2. Click **Get an API Key** → sign up (free)
3. Your key will be emailed to you
4. In the tracker, click **⚙️ Settings** → paste key → Save

> The Best Buy API gives you **real in-store availability** per SKU per store.

---

## 🎯 Finding the IDs You Need

### Best Buy Store IDs
1. Go to [bestbuy.com/site/store-locator](https://www.bestbuy.com/site/store-locator)
2. Click on your store
3. The store ID is in the URL: `.../store/**281**/...`
4. Update `bbStoreId` in `js/data.js`

### Best Buy SKUs
- On any Best Buy product page, look at the URL:
  `bestbuy.com/site/product-name/**6578910**.p`
- Or search the product, check the listing

### Target Store IDs
1. Go to [target.com/store-locator](https://www.target.com/store-locator/find-stores)
2. Click your store → ID is in the URL: `.../store-details/T-**3393**/...`
3. Update `tgtStoreId` in `js/data.js`

### Target TCINs
- On any Target product page, the URL is:
  `target.com/p/product-name/-/A-**89476251**`
- The number after `A-` is the TCIN

### UPCs (for BrickSeek)
- Check the barcode on the actual pack
- Or search "[pack name] UPC" on brickseek.com

---

## 📲 How BrickSeek Links Work

For each pack with a UPC, the tracker generates a **BrickSeek deep-link** that pre-fills:
- The UPC barcode
- Your ZIP code

Clicking it opens BrickSeek showing Target (and sometimes Best Buy) inventory near you — **no login needed**.

---

## ⚠️ Known Limitations

| Issue | Cause | Fix |
|---|---|---|
| Target shows "Use BrickSeek ↓" | Target's Redsky API has CORS restrictions on some browsers | Click the BrickSeek link — same data, one click |
| Best Buy shows "Need API key" | No key entered | Get free key at developer.bestbuy.com |
| Best Buy shows "No SKU set" | Pack doesn't have a BB SKU in data.js | Add it via ⚙️ or edit data.js |
| GitHub Pages CORS errors | Browser security blocks cross-origin requests | For full automation, add a small CORS proxy (see below) |

---

## 🔧 Optional: Fix CORS with a Free Proxy

If Target's Redsky API is being blocked, you can self-host a tiny CORS proxy on [Cloudflare Workers](https://workers.cloudflare.com) (free tier):

```js
// Cloudflare Worker — paste into workers.cloudflare.com
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('Missing ?url=', { status: 400 })
  
  const res = await fetch(target, { headers: { 'Accept': 'application/json' } })
  const body = await res.text()
  
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  })
}
```

Then in `js/api.js`, update the Target URL to route through your worker.

---

## 💾 Data Storage

All your settings, custom stores, custom packs, and stock state are saved to **browser localStorage** — no account or server needed. Data persists between visits on the same browser.

---

## 🔄 Updating Packs

When new sets release:
1. Click **🃏 + Add** in the app
2. Enter the pack name, emoji, price
3. Add the Best Buy SKU, Target TCIN, and/or UPC
4. The pack is immediately tracked and saved

Or edit `js/data.js` to update the defaults before uploading.

---

*Built with ⚡ by Poké Pack Hunter*
