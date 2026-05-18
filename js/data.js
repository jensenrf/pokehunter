// ═══════════════════════════════════════
//  data.js — Default stores & packs
//  Edit this file to change defaults.
//  User additions are persisted in localStorage.
// ═══════════════════════════════════════

const DEFAULT_STORES = [
  {
    id: 'bb_gilbert',
    retailer: 'bestbuy',
    name: 'Best Buy',
    location: 'Gilbert (San Tan Village)',
    addr: '2288 E Williams Field Rd',
    dist: '~12 miles',
    phone: '(480) 722-9349',
    hours: 'Mon–Sat 10AM–9PM · Sun 10AM–8PM',
    bbStoreId: '281',   // ← update with real Best Buy store ID
  },
  {
    id: 'bb_mesa',
    retailer: 'bestbuy',
    name: 'Best Buy',
    location: 'Mesa',
    addr: '6315 E Southern Ave',
    dist: '~18 miles',
    phone: '(480) 807-1900',
    hours: 'Mon–Sat 10AM–9PM · Sun 10AM–8PM',
    bbStoreId: '1000',  // ← update with real Best Buy store ID
  },
  {
    id: 'tgt_qc',
    retailer: 'target',
    name: 'Target',
    location: 'Queen Creek',
    addr: '21398 Ellsworth Loop Rd',
    dist: '~2 miles',
    phone: '(480) 214-4810',
    hours: 'Daily 7AM–10PM',
    tgtStoreId: '3393', // ← update with real Target store ID
  },
  {
    id: 'tgt_gantzel',
    retailer: 'target',
    name: 'Target',
    location: 'Queen Creek (Gantzel)',
    addr: '37854 N Gantzel Rd',
    dist: '~7 miles',
    phone: '(480) 212-1102',
    hours: 'Mon–Fri 7AM–10PM · Sat–Sun 8AM–10PM',
    tgtStoreId: '3506', // ← update with real Target store ID
  },
  {
    id: 'tgt_mesa_power',
    retailer: 'target',
    name: 'Target',
    location: 'Mesa (Power Rd)',
    addr: '5110 S Power Rd',
    dist: '~14 miles',
    phone: '(480) 281-0268',
    hours: 'Daily 7AM–10PM',
    tgtStoreId: '2911', // ← update with real Target store ID
  },
];

// ── Pokémon packs ──────────────────────────────────────
// bbSku    : Best Buy product SKU (from BB product page URL/listing)
// tcin     : Target TCIN (from target.com/p/-/A-{TCIN} URL)
// upc      : Barcode UPC (for BrickSeek lookup)
const DEFAULT_PACKS = [
  {
    id: 'prismatic',
    name: 'Prismatic Evolutions ETB',
    emoji: '✨',
    price: '$49.99',
    bbSku: '6578910',      // ← verify/update on bestbuy.com
    tcin: '89476251',      // ← verify/update on target.com
    upc: '820650858499',
  },
  {
    id: 'surging_sparks',
    name: 'Surging Sparks ETB',
    emoji: '⚡',
    price: '$54.99',
    bbSku: '6592001',
    tcin: '91234567',
    upc: '820650123456',
  },
  {
    id: 'sv_booster',
    name: 'Scarlet & Violet Booster Bundle',
    emoji: '🔵',
    price: '$19.99',
    bbSku: '6521388',
    tcin: '87654321',
    upc: '820650654321',
  },
  {
    id: '151',
    name: 'Scarlet & Violet 151 ETB',
    emoji: '🎮',
    price: '$49.99',
    bbSku: '6558723',
    tcin: '88112233',
    upc: '820650112233',
  },
  {
    id: 'stellar_crown',
    name: 'Stellar Crown ETB',
    emoji: '👑',
    price: '$44.99',
    bbSku: '6571234',
    tcin: '90001122',
    upc: '820650998877',
  },
  {
    id: 'shrouded_fable',
    name: 'Shrouded Fable ETB',
    emoji: '🌑',
    price: '$44.99',
    bbSku: '6563210',
    tcin: '89543210',
    upc: '820650543210',
  },
  {
    id: 'temporal',
    name: 'Temporal Forces ETB',
    emoji: '⏳',
    price: '$49.99',
    bbSku: '6545678',
    tcin: '88765432',
    upc: '820650765432',
  },
  {
    id: 'blister_3pk',
    name: '3-Pack Blister',
    emoji: '💊',
    price: '$14.99',
    bbSku: null,
    tcin: '85001234',
    upc: '820650001234',
  },
];
