// web_script/content.js
const SS_DEBUG = false; // sett true for konsoll-logging under utvikling
const sslog = (...a) => SS_DEBUG && console.log(...a);
sslog("Prico content script active on", location.hostname);

let lastSentKey = "";
let sistePris = null;      // prisen vi sist spurte med (variant-vakta nederst)
let sisteId = null;        // strekkoden vi sist spurte med (samme vakt)
let variantOppslag = 0;
// The path the page was LOADED on. Used to spot a stale barcode after the
// shop switched variant with pushState (see staleLdBarcode below).
const startSti = location.pathname.replace(/\/$/, "");

// LIGHT OR DARK (1.8, 16 Nov 2026). The sun/moon button in the icon window
// stores the choice as prico_tema ("lys" | "mork"); the toast follows it.
// No choice made -> light (not the system setting; owner, 16 Nov 2026).
let pricoTema = null;
try {
  chrome.storage.local.get("prico_tema").then((r) => {
    pricoTema = (r && r.prico_tema) || null;
  }).catch(() => {});
  chrome.storage.onChanged.addListener((endret, omraade) => {
    if (omraade === "local" && endret.prico_tema) pricoTema = endret.prico_tema.newValue || null;
  });
} catch (e) {}
const morktTema = () => pricoTema === "mork";

// «1 049,-» / «1.049 kr» / «1049.00» -> 1049
// Butikkene skriver priser svært ulikt. Den gamle versjonen gjorde
// replace(",", ".") på hele strengen, så «1 049,-» ble «1049.» og norske
// tusenskiller med punktum ble lest som desimaler. Uten en lesbar pris kan
// utvidelsen ikke avgjøre om noe er billigere – og da vises ingen varsel.
// Det var derfor Komplett ikke ga varsel selv om NetOnNet var billigere.
function parsePris(tekst) {
  if (tekst == null) return null;
  const m = String(tekst).match(/\d[\d\s., ]*/);
  if (!m) return null;
  let s = m[0].replace(/[\s ]/g, "").replace(/[.,]$/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.length - s.lastIndexOf(",") <= 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  } else if (s.includes(".") && s.length - s.lastIndexOf(".") > 3) {
    s = s.replace(/\./g, "");           // «1.049» = tusenskille, ikke desimal
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// VALGT VARIANT I WOOCOMMERCE (22. sept. 2026). fredrikoglouisa har 75 ml
// (2 695) og 125 ml (3 485) på ÉN side. JSON-LD-en er statisk og gir alltid
// den laveste, så uansett hva kunden velger leste vi 2 695 og varslet
// 75 ml-butikker på 125 ml. WooCommerce legger alle variantene i
// <form class="variations_form" data-product_variations="[…]"> og skriver
// den valgte sin variation_id i <input name="variation_id"> – DEN prisen er
// det kunden ser. Ingen valgt (0/tom) -> null, og resten av lesinga gjelder.
function wooVariantPris() {
  try {
    const form = document.querySelector("form.variations_form");
    if (!form) return null;
    const inp = form.querySelector('input[name="variation_id"], input.variation_id');
    const vid = inp && String(inp.value || "").trim();
    if (!vid || vid === "0") return null;
    const raa = form.getAttribute("data-product_variations");
    if (raa && raa !== "false") {
      const liste = JSON.parse(raa);
      const v = (Array.isArray(liste) ? liste : []).find(
        (x) => x && String(x.variation_id) === vid,
      );
      const n = v && v.display_price != null ? parsePris(v.display_price) : null;
      if (n) return n;
    }
    // Mange varianter -> WooCommerce henter dem via AJAX og attributtet er
    // "false". Da står prisen i .woocommerce-variation-price.
    const el = form.querySelector(".woocommerce-variation-price .amount, .woocommerce-variation-price");
    return el ? parsePris(el.textContent) : null;
  } catch (e) {
    return null;
  }
}

// BOOZT (22. sept. 2026): sida er en SPA. Velger kunden 125 ml, bytter bare
// slugen og den synlige prisen – JSON-LD-en beholder 75 ml (én hasVariant,
// gtin …254, 2 695), så både varsel og popup leste feil størrelse. Alle
// størrelsene ligger i <script type="application/json"> under
// product.eansData: {ean_id: {ean, actual_price, size_detail, sku, …}}.
// Valgt størrelse = knappen med «--primary» i klassen (den uvalgte har
// «--secondary»); ellers varianten hvis pris er den som vises; ellers
// product.current (den sida ble lastet med).
// ORDINÆR PRIS, IKKE DEAL-PRISEN (22. sept. 2026). Boozts «Deal» (mdvPrice,
// f.eks. 174 kr med rød skrift) gjelder bare ved kjøp for minst 699 kr –
// én vare koster actual_price (269). Vi sammenligner prisen for ÉN vare, som
// for Blivakker, Lyko og Elkjøp. Deal-prisen hører hjemme i medlems-/
// betingelsespris-kolonna når den kommer.
function boozPris(v) {
  return parseFloat(v && v.actual_price);
}

function lesBoozt() {
  if (!location.hostname.endsWith("boozt.com")) return null;
  try {
    const s = [...document.scripts].find(
      (x) => x.type === "application/json" && (x.textContent || "").includes('"eansData"'),
    );
    if (!s) return null;
    const d = JSON.parse(s.textContent);
    const p = d && d.product;
    const eans = p && p.eansData;
    if (!eans) return null;
    const liste = Object.values(eans).filter((v) => v && v.ean);
    const fargeAv = (x) => String((x && (x.colourDetail || x.colorDetail)) || "").trim().toUpperCase();
    // SELECTED COLOUR FROM THE PAGE, NOT THE JSON (11 Oct 2026). Boozt keeps
    // every colour of a shoe on ONE URL and in one static JSON blob;
    // clicking a swatch only changes React state. product.current kept
    // saying DK BROWN while the customer looked at TAUPE SUEDE, so the id
    // never changed and the popup stayed on the first colour. The page
    // shows the choice in two places: the selected swatch
    // (.product-color-picker-item-default--selected, aria-label = colour)
    // and the label «Farge: TAUPE SUEDE». Both change on click, which also
    // wakes the variant watcher.
    let farge = null;
    const swatch = document.querySelector('.product-color-picker [class*="--selected"]');
    if (swatch) {
      const img = swatch.querySelector("img");
      farge = swatch.getAttribute("aria-label") || (img && img.getAttribute("alt")) || null;
    }
    if (!farge) {
      const label = document.querySelector(".product-color-picker-label");
      const t = label ? (label.textContent || "").replace(/^[^:]*:\s*/, "").trim() : "";
      if (t) farge = t;
    }
    if (!farge) farge = (p.current && (p.current.colourDetail || p.current.colorDetail)) || null;
    farge = farge ? String(farge).trim().toUpperCase() : null;
    const iFargen = (x) => !farge || fargeAv(x) === farge;
    // 1. Adresselinja: «…_31822759/226216917» – ean_id til valgt farge og
    //    størrelse. Nøyaktig treff i eansData, ingen gjetting - unless the
    //    page now shows another colour than that variant (the URL keeps the
    //    old ean_id when the customer switches colour after picking a size).
    const iUrl = location.pathname.match(/_\d{6,}\/(\d+)\/?$/);
    let v = iUrl && eans[iUrl[1]] && eans[iUrl[1]].ean && iFargen(eans[iUrl[1]]) ? eans[iUrl[1]] : null;
    // 2. Valgt størrelsesknapp, i fargen sida viser (størrelsen «34» finnes
    //    i alle fargene).
    const valgt = [...document.querySelectorAll('button[class*="--primary"]')]
      .map((b) => b.textContent.trim().toLowerCase())
      .filter(Boolean);
    if (!v) v = liste.find((x) => valgt.includes(String(x.size_detail || "").trim().toLowerCase())
      && iFargen(x));
    if (!v) {
      const synlig = [...document.querySelectorAll('[class*="price" i]')]
        .map((e) => parsePris(e.textContent))
        .find((n) => n);
      if (synlig) v = liste.find((x) => iFargen(x) && Math.abs(boozPris(x) - synlig) < 1);
    }
    // 3. No size picked: any barcode of the shown colour. The server stores
    //    one row per colour with all its sizes in gtins, so any size of the
    //    colour anchors on the right row.
    if (!v && farge) v = liste.find(iFargen);
    if (!v) v = p.current && p.current.ean ? p.current : liste[0];
    if (!v) return null;
    const pris = boozPris(v);
    return { id: String(v.ean).trim(), pris: Number.isFinite(pris) && pris > 0 ? pris : null };
  } catch (e) {
    return null;
  }
}

// VALGT RADIOKNAPP + JSON-LD-TILBUD (parfym, 22. sept. 2026). Alle
// størrelsene ligger på én URL; valgt størrelse er <input name="variantId"
// checked>, og JSON-LD har ett tilbud per størrelse med «?v=<variantId>» i
// url-en og strekkoden i mpn. Uten dette leste vi laveste tilbud (30 ml,
// 1 008) uansett valg, og 80 ml-kunden fikk «billigere hos F&L 704» (30 ml).
function lesValgtTilbud() {
  try {
    const skjema = document.querySelector("form[data-prodid-selected]") || document;
    const r = skjema.querySelector('input[name="variantId"]:checked');
    if (!r) return null;
    const vid = String(r.value || "").trim();
    let pris = parsePris(r.getAttribute("data-price"));
    let id = null;
    const passer = new RegExp("[?&]v=" + vid + "(?:&|$)");
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let d;
      try { d = JSON.parse(s.textContent); } catch (e) { continue; }
      for (const it of Array.isArray(d) ? d : [d]) {
        for (const e of (it && it["@graph"]) || [it]) {
          if (!e || !e.offers) continue;
          const liste = [];
          for (const o of Array.isArray(e.offers) ? e.offers : [e.offers]) {
            if (o && Array.isArray(o.offers)) liste.push(...o.offers);
            else if (o) liste.push(o);
          }
          const o = liste.find((x) => x && x.url && passer.test(x.url));
          if (!o) continue;
          const g = o.gtin13 || o.gtin || o.mpn;
          if (g && /^\d{8,14}$/.test(String(g).trim())) id = String(g).trim();
          const n = parsePris(o.price);
          if (n) pris = n;
        }
      }
    }
    return pris || id ? { id, pris } : null;
  } catch (e) {
    return null;
  }
}

// THE STORE'S OWN JSON-LD ONLY. Review widgets inject their own
// application/ld+json blocks into <head>, and the price in them is whatever
// the store fed the widget - not necessarily what the customer pays.
// apotekfordeg (30 Sept 2026): Lipscore's block
// (id="lipscore-richsnippet-product") said price "142" while the store's own
// block and the meta tag said 178.00 - 142 is 178 without VAT. The widget's
// block came first in the document, so we read 142, sent it to the server
// as the page price, and the server "corrected" our row to 142. From then on
// every other store showed "billigere hos Apotek for deg - 142,-" on a
// product that costs 178 there. Blocks tagged by a review widget are skipped.
const TREDJEPART_LD = /lipscore|yotpo|trustpilot|judgeme|judge-me|stamped|reviews\.io|okendo|loox/i;
function butikkensLd() {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].filter(
    (s) => !TREDJEPART_LD.test((s.id || "") + " " + (s.className || "")),
  );
}

// A LIST IS NOT A PRODUCT (1.10, 18 Nov 2026). The owner's screenshot:
// komplett.no/search?q=ps5 with "Billigere hos POWER 7 499,- / Her: 7 990,-"
// - the first console in a list of 132. Two things could put a product's
// toast on a list page, and both are closed in 1.10:
//   1. the page carries product data for the goods it lists, and the first
//      one was taken for "the product of this page" (here);
//   2. an answer for the previous page arrived after the tab had moved on
//      (see CHEAPER_FOUND below: the answer now names its page).
// Rule: when the store's own JSON-LD describes SEVERAL DIFFERENT products,
// the page's product is the one whose url is this address. If none is, the
// page is a list and no barcode is sent - the server then answers only if
// it knows the address as a product page. One product, or the same product
// described twice, is read as before.
function ldProduktnoder(skript) {
  const ut = [];
  for (const s of skript) {
    let d;
    try {
      d = JSON.parse(s.textContent);
    } catch (e) {
      continue;
    }
    for (const item of Array.isArray(d) ? d : [d]) {
      for (const e of item && item["@graph"] ? item["@graph"] : [item]) {
        if (e && (e["@type"] === "Product" || e["@type"] === "ProductGroup")) ut.push(e);
      }
    }
  }
  return ut;
}

// -> the Product nodes to read the barcode from, in page order; null when
// the page is a list (several different products, none of them this page).
function ldSidensProdukter() {
  const alle = ldProduktnoder(document.querySelectorAll('script[type="application/ld+json"]'));
  const egne = ldProduktnoder(butikkensLd());
  if (egne.length < 2) return alle;
  const rens = (v) => String(v == null ? "" : v).trim().toLowerCase();
  const merker = (e) =>
    [e.gtin13, e.gtin, e.gtin14, e.gtin8, e.mpn, e.sku, e.productGroupID, e.name].map(rens).filter(Boolean);
  // Two nodes are the same product when they share a barcode, a number or the name.
  const grupper = [];
  for (const e of egne) {
    const m = new Set(merker(e));
    if (!m.size) continue;
    const treff = grupper.filter((g) => [...m].some((x) => g.has(x)));
    const ny = new Set(m);
    for (const g of treff) {
      for (const x of g) ny.add(x);
      grupper.splice(grupper.indexOf(g), 1);
    }
    grupper.push(ny);
  }
  if (grupper.length < 2) return alle;
  const her = location.pathname.replace(/\/$/, "");
  const sti = (e) => {
    const o = Array.isArray(e.offers) ? e.offers[0] : e.offers;
    const u = e.url || (o && o.url);
    if (typeof u !== "string" || !u) return null;
    try {
      return new URL(u, location.href).pathname.replace(/\/$/, "");
    } catch (er) {
      return null;
    }
  };
  const denne = egne.filter((e) => sti(e) === her);
  if (denne.length) return denne;
  sslog(`Prico: ${grupper.length} ulike produkter i JSON-LD og ingen er denne sida – liste, sender ingen strekkode`);
  return null;
}

// The address is a shop's search-result page (the same rule as the server's
// _er_sokeside): a path part named search/sok/søk/..., or a search word in
// the query. A product reached FROM a search is still found by its address.
const SOKESTI = /(?:^|\/)(?:search|searchresults?|sok|s%c3%b8k|søk|soek|sog|s%c3%b8g|søg|catalogsearch|finn|find)(?:\/|$)/i;
const SOKEPARAM = ["q", "query", "search", "sok", "søk", "searchterm", "search_query", "searchtext", "keyword", "keywords", "term"];
function erSokeside() {
  try {
    if (SOKESTI.test(location.pathname)) return true;
    for (const [navn, verdi] of new URLSearchParams(location.search)) {
      if (verdi && SOKEPARAM.includes(navn.trim().toLowerCase())) return true;
    }
  } catch (e) {}
  return false;
}

// An offer meant for business customers or quoted without VAT.
const BEDRIFT_RE = /business|bedrift|excl\.?\s*vat|ex\.?\s*vat|eks(?:kl)?\.?\s*mva|uten\s*mva/i;
function erBedriftsTilbud(o) {
  try {
    const type = o.eligibleCustomerType;
    const id = type && (typeof type === "string" ? type : type["@id"] || type.name || "");
    if (id && /business/i.test(String(id))) return true;
    return BEDRIFT_RE.test([o.name, o.description, o.category].filter(Boolean).join(" "));
  } catch (e) {
    return false;
  }
}

// THE PAGE'S OWN PRICE HAS THE LAST WORD, JUST BEFORE THE TOAST (16 Nov 2026).
//
// Our price for the page is from the last sweep, up to a day old. Elkjøp
// started a Black Week offer on Nintendo Switch 2 at midnight (5 777, before
// 6 499); our row still said 6 499, so the toast offered Coolshop at 5 843
// as "656 cheaper" on a page that was 66 kr cheaper than Coolshop.
//
// The page price was read once before (until 2 Oct): the extension waited
// for it before asking the server, which made everything slower, and the
// number was SENT and stored, so two bad reads (an ex-VAT price from a
// review widget, a business offer) poisoned rows for everyone. This is
// neither of those:
//   * nothing waits. The lookup goes out on the URL as before; the page is
//     read when the answer is back and the toast is about to be drawn - one
//     synchronous look at data already in the page, well under a
//     millisecond on a normal page;
//   * nothing is sent or stored. The number only decides whether THIS toast
//     is shown, on this page, for this user;
//   * it can only make us quieter. A page price LOWER than ours is used as
//     the price to beat (no toast when the offer no longer beats it by the
//     user's threshold; otherwise the toast with the page's price as
//     "Her:"). A higher one is ignored - that is the direction a bad read
//     would do harm;
//   * only the shop's own structured data counts: the selected variant
//     (boozt, parfym, WooCommerce) or the JSON-LD offer of the product on
//     this address, public offers only. Not the price-looking elements
//     getCurrentPrice falls back on;
//   * a number that equals the page's member price while the member switch
//     is off is the club price in the page's data (Sport 1, Intersport),
//     not a price drop, and is ignored. So is anything under a third of our
//     price.
//   * ...unless the page itself says the price is for everyone (owner's
//     test, 16 Nov, Elkjøp Samsung Odyssey G5 253180: page 2 290 "Tilbudet
//     gjelder 11.11 - 30.11", our row sale 2 990 / member 2 290, so the
//     rule above threw the page price away and the toast said "Her:
//     2 990"). The offer there is eligibleCustomerType schema.org/Public
//     with no member tier in its priceSpecification. Such a price is
//     "offentlig" and is used even when it equals our stored member price.
//     An offer that DOES carry a member tier (validForMemberTier, "Member
//     price (incl. VAT)") gives its regular incl.-VAT tier instead, or
//     nothing.
const MEDLEMSNIVAA_RE = /member|medlem|kundeklubb|klubbpris|club\s*price/i;
const UTEN_MVA_RE = /excl|ex\.?\s*vat|eks(?:kl)?\.?\s*mva|uten\s*mva/i;

// One JSON-LD offer -> { pris, offentlig } or null.
function tilbudNivaa(o) {
  if (MEDLEMSNIVAA_RE.test(String(o.name || ""))) return null;      // a separate member offer
  const spes = [].concat(o.priceSpecification || []).filter((x) => x && typeof x === "object");
  const erMedlem = (p) => !!p.validForMemberTier || MEDLEMSNIVAA_RE.test(String(p.name || ""));
  let pris = null;
  if (o.validForMemberTier || spes.some(erMedlem)) {
    for (const p of spes) {
      if (erMedlem(p) || p.valueAddedTaxIncluded === false || UTEN_MVA_RE.test(String(p.name || ""))) continue;
      if (/strikethrough|listprice/i.test(String(p.priceType || ""))) continue;
      const n = p.price != null ? parsePris(p.price) : null;
      if (n && (pris === null || n < pris)) pris = n;
    }
    return pris ? { pris, offentlig: false } : null;
  }
  for (const v of [o.price, o.lowPrice]) {
    const n = v != null ? parsePris(v) : null;
    if (n && (pris === null || n < pris)) pris = n;
  }
  if (!pris) return null;
  const t = o.eligibleCustomerType;
  const id = t && (typeof t === "string" ? t : t["@id"] || t.name || "");
  return { pris, offentlig: /public/i.test(String(id || "")) };
}

// The page's own price state says "club price" for the product on this
// address (Elkjøp: "initialPriceProbe":{..."isClubPrice":true...}; the
// adapter's reserve for club pages whose JSON-LD names no tiers). Only
// called in the rare case below, so the scan of the scripts costs nothing
// on a normal page.
function sidaSierKlubbpris() {
  try {
    for (const s of document.scripts) {
      const t = s.textContent;
      if (t && t.includes("initialPriceProbe") && /initialPriceProbe\\?":\{[^{}]{0,300}?isClubPrice\\?":\s*true/.test(t)) return true;
    }
  } catch (e) {}
  return false;
}

function ldPris(bareDenneSida) {
  const her = location.pathname.replace(/\/$/, "").toLowerCase();
  try {
    for (const s of butikkensLd()) {
      let d;
      try {
        d = JSON.parse(s.textContent);
      } catch (e) {
        continue;
      }
      for (const item of Array.isArray(d) ? d : [d]) {
        for (const e of item && item["@graph"] ? item["@graph"] : [item]) {
          const off = e && e.offers;
          if (!off) continue;
          if (bareDenneSida) {
            if (!/Product/.test(String(e["@type"]))) continue;
            if (typeof e.url === "string" && e.url) {
              let sti = null;
              try { sti = new URL(e.url, location.href).pathname.replace(/\/$/, "").toLowerCase(); } catch (x) {}
              if (sti && sti !== her) continue;      // another product listed on the page
            }
          }
          let laveste = null;
          for (const o of Array.isArray(off) ? off : [off]) {
            if (!o) continue;
            if (erBedriftsTilbud(o)) continue;
            if (bareDenneSida && o.priceCurrency && String(o.priceCurrency).toUpperCase() !== "NOK") continue;
            const n = tilbudNivaa(o);
            if (n && (laveste === null || n.pris < laveste.pris)) laveste = n;
          }
          if (laveste) return laveste;
        }
      }
    }
  } catch (e) {}
  return null;
}

function sideprisNaa() {
  try {
    const bz = lesBoozt();
    if (bz && bz.pris) return { pris: bz.pris, offentlig: false };
    const vt = lesValgtTilbud();
    if (vt && vt.pris) return { pris: vt.pris, offentlig: false };
    const woo = wooVariantPris();
    if (woo) return { pris: woo, offentlig: false };
    if (staleLdBarcode()) return null;   // the JSON-LD is the variant the page was loaded on
    return ldPris(true);
  } catch (e) {
    return null;
  }
}

function getCurrentPrice() {
  // 0. Butikkens egen variantdata slår alt annet: valgt størrelse hos
  //    boozt, valgt radioknapp (parfym), valgt WooCommerce-variant (F&L).
  const bz = lesBoozt();
  if (bz && bz.pris) return bz.pris;
  const vt = lesValgtTilbud();
  if (vt && vt.pris) return vt.pris;
  const woo = wooVariantPris();
  if (woo) return woo;

  // 1. JSON-LD offers.price – mest pålitelig når den finnes
  try {
    for (const s of butikkensLd()) {
      let d;
      try {
        d = JSON.parse(s.textContent);
      } catch (e) {
        continue;
      }
      for (const item of Array.isArray(d) ? d : [d]) {
        for (const e of item["@graph"] ? item["@graph"] : [item]) {
          const off = e && e.offers;
          if (!off) continue;
          // FLERE TILBUD = TA DEN LAVESTE. Blivakker lister «Standard Price»
          // 169 først og «Sale Price» 118 etterpå; med off[0] leste vi 169
          // og varslet «billigere hos Coolshop 145» på en vare som kostet
          // 118. Motoren (html_scraper) tar alt den laveste – nå gjør vi det
          // samme. lowPrice (AggregateOffer) teller også.
          let laveste = null;
          for (const o of Array.isArray(off) ? off : [off]) {
            if (!o) continue;
            // BUSINESS / EX-VAT OFFERS ARE NOT PRICES (2 Oct 2026). Elkjøp
            // lists two offers per product: "Standard Price" 8775 for the
            // public and "Business Price (Excl. VAT)" 7020 (= 8775 / 1.25)
            // with eligibleCustomerType Business. "Take the lowest" picked
            // 7020, sent it to the server as the page price, and from then
            // on Power showed "billigere hos Elkjøp 7020" for a dryer that
            // costs 8775 there. Skip offers aimed at business customers or
            // labelled ex VAT; the lowest of the rest is still the rule.
            if (erBedriftsTilbud(o)) continue;
            for (const v of [o.price, o.lowPrice]) {
              const n = v != null ? parsePris(v) : null;
              if (n && (laveste === null || n < laveste)) laveste = n;
            }
          }
          if (laveste) return laveste;
        }
      }
    }
  } catch (e) {}

  // 2. Meta-tagger, så synlige priselementer
  const priceSelectors = [
    'meta[property="product:price:amount"]',
    'meta[itemprop="price"]',
    '[itemprop="price"]',
    '[data-testid*="price" i]',
    '[data-test*="price" i]',
    '[class*="product-price" i]',
    '[class*="price-now" i]',
    '[class*="currentPrice" i]',
    '[id*="price" i]',
    ".product-price",
    'span[class*="price" i]',
    'div[class*="price" i]',
  ];
  // FØRPRIS ER IKKE PRIS. Byggmakker (uten JSON-LD) traff først på
  // beholderen «Førpris: 129 kr / Stykk 69 kr / Stykk», og parsePris tok
  // det første tallet: 129. Da ble «Jernia 119» varslet som billigere på
  // en vare som kostet 69. Regler: et element som er merket som førpris
  // (førpris, før:, veil., ordinær, was, RRP, gjennomstreket …) hoppes over
  // – med mindre det inneholder FLERE priser, da er den LAVESTE nåprisen.
  const FOER = /f[øo]rpris|f[øo]r\s*:|veil\.?\s*pris|veiledende|ordin[æa]r|ordinary|old[-_ ]?price|\bwas\b|\brrp\b|regular|compare|strike|through|tidligere|before/i;
  const allePriser = (t) => {
    const ut = [];
    for (const m of String(t || "").matchAll(/\d[\d\s., ]*/g)) {
      const n = parsePris(m[0]);
      if (n) ut.push(n);
    }
    return ut;
  };
  for (const sel of priceSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const tekst = el.getAttribute("content") || el.textContent || "";
      const merket = FOER.test((el.className || "") + " " + (el.id || "") + " " + tekst);
      const priser = allePriser(tekst);
      if (!priser.length) continue;
      if (priser.length > 1) return Math.min(...priser);   // «Førpris 129 … 69» -> 69
      if (merket) continue;                                 // rent førpris-element
      return priser[0];
    }
  }
  return null;
}

// Varianten på sida: samme URL som sida, ellers samme pris som vises.
// THE PACK SIZE THE CUSTOMER HAS SELECTED (16 Nov 2026). The pet shops keep
// every size of a food on one page (Royal Canin Medium Adult: 4, 10 and
// 15 kg), each with its own barcode in the JSON-LD ProductGroup. Choosing
// 10 kg changed nothing this function looked at, so the 4 kg comparison
// stayed up:
//   * zooplus puts the choice in the QUERY (?activeVariant=1998345.2) and
//     its variants' own URLs differ only there. The match below compared
//     paths, so every variant matched and the first one (4 kg) won.
//   * petxl (and zoo.no) change neither the address nor the JSON-LD; the
//     chosen button is marked data-active="true" ("10 kg 639 kr").
// So: the address with its query first, when exactly one variant has it;
// then the option the page itself marks as selected; then the old rules.
function fullUrl(u) {
  try {
    const x = new URL(u, location.href);
    return (x.hostname.replace(/^www\./i, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase();
  } catch (e) {
    return "";
  }
}

function valgtVariant(varianter, gruppe) {
  const rens = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().toLowerCase();
  const gnavn = rens(gruppe && gruppe.name);
  // What tells a variant from its siblings: its size, else what its name
  // adds to the group's name ("... Medium Adult 10 kg" -> "10 kg").
  const etiketter = varianter.map((v) => {
    const st = rens(v && v.size);
    if (st) return st;
    const n = rens(v && v.name);
    return gnavn && n.startsWith(gnavn) ? n.slice(gnavn.length).trim() : "";
  });
  if (etiketter.filter(Boolean).length < 2) return null;
  let funnet = null;
  let merket;
  try {
    merket = document.querySelectorAll(
      '[data-active="true"], [aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], ' +
      'input[type="radio"]:checked, option:checked');
  } catch (e) {
    return null;
  }
  for (const el of merket) {
    if (el.closest && el.closest("#salescout-toast")) continue;
    let kilde = el;
    if (el.tagName === "INPUT") kilde = (el.labels && el.labels[0]) || el.closest("label") || el.parentElement || el;
    const t = rens(kilde.textContent);
    if (!t || t.length > 80) continue;
    let best = -1;                 // the longest label the text starts with ("15 kg + 3 kg" before "15 kg")
    etiketter.forEach((l, i) => {
      if (l && t.startsWith(l) && (best < 0 || l.length > etiketter[best].length)) best = i;
    });
    if (best < 0) continue;
    if (funnet !== null && funnet !== best) return null;      // two selections that disagree: say nothing
    funnet = best;
  }
  return funnet === null ? null : varianter[funnet];
}

function velgVariant(e) {
  const varianter = Array.isArray(e && e.hasVariant) ? e.hasVariant : [];
  if (!varianter.length) return null;
  const her = normaliserUrl(location.href);
  const herFull = fullUrl(location.href);
  // A variant's own address is on the variant or on its offer (petxl:
  // offers.url ".../vaskbar-bleie-for-hannhunder?p=300011385").
  const adresse = (v) => {
    if (!v) return "";
    if (v.url) return v.url;
    const o = Array.isArray(v.offers) ? v.offers[0] : v.offers;
    return (o && o.url) || "";
  };
  const medUrl = varianter.filter((v) => adresse(v));
  const eksakt = medUrl.filter((v) => fullUrl(adresse(v)) === herFull);
  if (eksakt.length === 1) return eksakt[0];
  // ...or the address names the variant by its article number in the
  // query (?p=<sku>, ?activeVariant=<sku>, ?v=<sku>). On a real click petxl
  // changes the address this way while the JSON-LD in the page keeps
  // describing the size it was loaded on (owner's test, 16 Nov 2026).
  try {
    const verdier = new Set([...new URL(location.href).searchParams.values()].map((x) => String(x).trim().toLowerCase()).filter(Boolean));
    if (verdier.size) {
      const paaNr = varianter.filter((v) => v && v.sku && verdier.has(String(v.sku).trim().toLowerCase()));
      if (paaNr.length === 1) return paaNr[0];
    }
  } catch (x) {}
  const paaSti = medUrl.filter((v) => normaliserUrl(adresse(v)) === her);
  if (paaSti.length === 1) return paaSti[0];
  const valgt = valgtVariant(varianter, e);
  if (valgt) return valgt;
  // Several variants on this path and nothing marked: the first, as before.
  if (paaSti.length > 1) return paaSti[0];
  const pris = getCurrentPrice();
  if (pris) {
    for (const v of varianter) {
      let off = v && v.offers;
      if (Array.isArray(off)) off = off[0];
      const p = off && off.price != null ? parsePris(off.price) : null;
      if (p && Math.abs(p - pris) < 1) return v;
    }
  }
  return null;
}

function normaliserUrl(u) {
  try {
    const x = new URL(u, location.href);
    return (x.hostname.replace(/^www\./i, "") + x.pathname.replace(/\/$/, "")).toLowerCase();
  } catch (e) {
    return "";
  }
}

// SELECTED WOOCOMMERCE VARIANT -> ITS BARCODE (10 Oct 2026). fredrikoglouisa
// keeps 30/50/100 ml on ONE URL with no barcode in the JSON-LD (ProductGroup,
// variants carry only sku). Without an id the lookup is URL-only, the server
// anchors on the cheapest row (30 ml), and switching size changes nothing
// the variant watcher can see - so no popup for the size the customer chose.
// The page does carry one barcode per size, the same place the scraper reads
// it: hidden <p class="description-extra-info" data-vid="<variation_id>">
// GTIN: 0888066174800</p>. Fallback: the variant image, named <EAN>.jpg.
// The selected variation_id is the hidden <input name="variation_id">.
function wooVariantId() {
  try {
    const form = document.querySelector("form.variations_form");
    if (!form) return null;
    const inp = form.querySelector('input[name="variation_id"], input.variation_id');
    let vid = inp && String(inp.value || "").trim();
    const raa = form.getAttribute("data-product_variations");
    let liste = [];
    if (raa && raa !== "false") {
      try { liste = JSON.parse(raa); } catch (e) { liste = []; }
      if (!Array.isArray(liste)) liste = [];
    }
    if (!vid || vid === "0") {
      // The HTML ships variation_id=0 and WooCommerce's own JS fills it in
      // after DOMContentLoaded, i.e. after our first lookup. The preselected
      // size is already in the <select>s, so find the variation that matches
      // every chosen attribute (an empty attribute in the list means "any").
      const valg = {};
      for (const sel of form.querySelectorAll("select[name^='attribute_']")) {
        if (!sel.value) return null;
        valg[sel.name] = sel.value;
      }
      if (!Object.keys(valg).length) return null;
      const v = liste.find((x) => x && x.attributes && Object.keys(valg).every(
        (k) => !x.attributes[k] || x.attributes[k] === valg[k],
      ));
      vid = v ? String(v.variation_id) : "";
      if (!vid) return null;
    }
    for (const p of document.querySelectorAll(".description-extra-info[data-vid]")) {
      if (String(p.getAttribute("data-vid")).trim() !== vid) continue;
      const m = (p.textContent || "").match(/GTIN\s*:\s*(\d{8,14})/i);
      if (m) return m[1];
    }
    {
      const v = liste.find((x) => x && String(x.variation_id) === vid);
      const bilde = v && v.image && (v.image.url || v.image.full_src || "");
      const m = String(bilde || "").match(/\/(\d{13})(?:-\d+x\d+)?\.(?:jpe?g|png|webp)/i);
      if (m) return m[1];
    }
  } catch (e) {}
  return null;
}

function getUniversalId() {
  // boozt: strekkoden til VALGT størrelse, ikke JSON-LD-ens (se lesBoozt).
  const bz = lesBoozt();
  if (bz && bz.id && bz.id.length > 4) return bz.id;
  const vt = lesValgtTilbud();
  if (vt && vt.id) return vt.id;
  // WooCommerce (fredrik_louisa): the selected size's barcode, see wooVariantId.
  const wv = wooVariantId();
  if (wv) return wv;
  // VITA: valgt nyanse/størrelse sin strekkode står i data-ls-gtin, og
  // skifter når kunden velger (adresselinja får «?v=<kode>»). JSON-LD-ens
  // ProductGroup har ingen strekkoder på variantene.
  if (location.hostname.endsWith("vita.no")) {
    const ls = document.querySelector("[data-ls-gtin]");
    const g = ls && String(ls.getAttribute("data-ls-gtin") || "").trim();
    if (g && /^\d{8,14}$/.test(g)) return g;
  }
  // A list page sends no barcode (1.10, see ldSidensProdukter).
  if (erSokeside()) return null;
  const sidens = ldSidensProdukter();
  if (sidens === null) return null;
  try {
    for (let e of sidens) {
      if (e["@type"] === "Product" || e["@type"] === "ProductGroup") {
        // VARIANTER: en ProductGroup (Bangerhead) lister 75 ml og 125 ml
        // som hasVariant med hver sin strekkode og URL. Uten dette tok vi
        // gruppas felt (tomme) og endte med FØRSTE strekkode i HTML-en,
        // som kan være den andre størrelsen: «billigere hos F&L 2 695»
        // (75 ml) ble varslet på 125 ml-sida til 3 295. Velg varianten
        // hvis URL er sida vi står på; ellers den hvis pris er prisen
        // som vises; ellers gruppa selv.
        const v = velgVariant(e);
        if (v) {
          const vid = v.gtin13 || v.gtin || v.gtin14 || v.gtin8 || v.mpn;
          if (vid && String(vid).length > 4) return String(vid).trim();
        }
        // IKKE e.sku: varenummeret er butikkinternt og betyr ingenting
        // hos andre. Komplett-varenummer 1317196 finnes ikke hos Power, så
        // et oppslag på det treffer enten ingenting eller feil vare.
        // Bare globale identifikatorer (GTIN/EAN) og produsentens
        // delenummer (MPN) sier noe om HVILKEN vare dette er.
        const id = e.gtin13 || e.gtin || e.gtin14 || e.gtin8 || e.mpn;
        if (id && String(id).length > 4) return String(id).trim();
      }
    }
  } catch (e) {}

  // ONE BARCODE ON THE PAGE, OR NONE (25 Oct 2026).
  //
  // The microdata fallback took the FIRST <meta itemprop="gtin13"> on the
  // page. On elektroimportoren.no the product's own block has no barcode,
  // but a "related products" carousel loads after a scroll and injects
  // sixteen of them - so after scrolling, the extension looked up the first
  // carousel item and showed "cheaper at Eldirekte 59" for a plain wall box
  // while the customer was on the Flexi+ 1,5 box (79). A page with several
  // different barcodes in its microdata is a listing, not one product, and
  // the fallback must say nothing rather than guess. sku is left out on
  // purpose - see the comment above.
  for (const prop of ["gtin13", "gtin", "gtin14", "gtin8", "mpn"]) {
    const verdier = new Set();
    for (const meta of document.querySelectorAll(`meta[itemprop="${prop}"]`)) {
      const v = (meta.content || "").trim();
      if (v.length > 4) verdier.add(v);
    }
    if (verdier.size === 1) return [...verdier][0];
    if (verdier.size > 1) {
      sslog(`Prico: ${verdier.size} ulike ${prop} i microdata – ignorerer (liste, ikke én vare)`);
      return null;
    }
  }
  return null;
}

function getProductTitle() {
  const h1 = document.querySelector("h1");
  if (h1 && h1.textContent.trim().length > 3) return h1.textContent.trim();
  const og = document.querySelector('meta[property="og:title"]');
  if (og?.content?.trim())
    return og.content.trim().split("|")[0].split("-")[0].trim();
  return (document.title || "").split("|")[0].trim();
}

// Butikker der vi KUN spør med ekte strekkode (8-14 sifre) og aldri faller
// tilbake på tittel: egne merkevarer + generiske produktnavn gjør at
// fuzzy tittel-søk kan matche FEIL produkt -> falske varsler.
const STRICT_ID_HOSTS = ["ellos.no"];

const looksLikeGtin = (s) => /^\d{8,14}$/.test(String(s || "").trim());

// Ellos har ingen Product-JSON-LD, men EAN ligger i Nuxt-payloaden
// (__NUXT_DATA__ er et flatt devalue-array der objektverdier er indekser).
function getEllosEan() {
  try {
    const el = document.getElementById("__NUXT_DATA__");
    if (!el) return null;
    const arr = JSON.parse(el.textContent);
    for (const v of arr) {
      if (v && typeof v === "object" && !Array.isArray(v) && "ean" in v) {
        const ean = arr[v.ean];
        if (looksLikeGtin(ean)) return String(ean).trim();
      }
    }
  } catch (e) {}
  return null;
}

// Er dette i det hele tatt en produktside?
//
// Uten denne sjekken kjørte vi på ALLE sider i butikkene vi støtter – også
// forsida. Da plukket getProductTitle() en overskrift fra en kampanjebanner,
// getCurrentPrice() tok første beste `span[class*="price"]`, og resultatet ble
// et varsel om «Billigere hos Norli, 179,-» på forsida til elkjop.no.
//
// Vi krever et eksplisitt produktsignal fra sida selv, ikke URL-mønstre per
// butikk (som må vedlikeholdes for hver av de 45 butikkene):
//   1. JSON-LD med @type Product/ProductGroup   – sterkest, og det de fleste har
//   2. <meta property="og:type" content="product">
//   3. microdata itemtype=schema.org/Product
function isProductPage() {
  try {
    for (const s of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      let data;
      try {
        data = JSON.parse(s.textContent);
      } catch (e) {
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        for (const e of item["@graph"] ? item["@graph"] : [item]) {
          const t = e && e["@type"];
          const typer = Array.isArray(t) ? t : [t];
          if (typer.some((x) => x === "Product" || x === "ProductGroup"))
            return true;
        }
      }
    }
  } catch (e) {}

  const og = document.querySelector('meta[property="og:type"]');
  if (og && /product/i.test(og.content || "")) return true;

  if (document.querySelector('[itemtype*="schema.org/Product"]')) return true;

  // Ikke alle produktsider har strukturerte data. Dustin har HVERKEN JSON-LD,
  // og:type eller microdata – bare description/robots/viewport. Da må vi bruke
  // URL-en, men på en generisk måte som ikke krever regler per butikk:
  // butikkene bruker de samme stiene (/product/, /art/, /p/, /produkt/) eller
  // et varenummer sist. Kombinert med at sida faktisk har en pris, skiller det
  // produktsider fra forsider og kategorisider – elkjop.no/ og
  // /tv-lyd-og-smarte-hjem treffer ingen av mønstrene.
  // Ingen URL-mønstre her. Vi GJETTER ikke på stien – forsøket på det godtok
  // xxl.no/herre/c/9100000 fordi den slutter på sifre.
  //
  // Serveren avgjør: den slår opp URL-en blant våre ~820 000 produkt-URLer.
  // Finnes den, er det en produktside; finnes den ikke, svarer den tomt uten
  // å gjette. Her holder det derfor med et billig filter som luker bort sider
  // helt uten pris, så vi slipper å spørre på hver eneste side vi besøker.
  return getCurrentPrice() !== null;
}

// STALE BARCODE AFTER A VARIANT SWITCH (6 Oct 2026). magasin loads a
// product on its master URL (/…/BATY03-0008.html, 30 ml) and switches size
// with pushState to the variant URL (/…/S00638844.html, 50 ml) - but never
// updates its JSON-LD, which still holds the 30 ml barcode. If we sent that
// barcode while the user looks at 50 ml, and the 50 ml URL is unknown to
// us, the server would compare 30 ml prices. Rule: once the URL has moved
// away from the one the page was loaded on, a barcode from a JSON-LD whose
// own "url" still points at the load URL is stale - send the URL alone.
function ldProduktSti() {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d;
    try {
      d = JSON.parse(s.textContent);
    } catch (e) {
      continue;
    }
    const noder = [].concat(d).flatMap((x) => (x && x["@graph"]) || [x]);
    for (const n of noder) {
      if (n && /Product/.test(String(n["@type"])) && typeof n.url === "string") {
        try {
          return new URL(n.url, location.href).pathname.replace(/\/$/, "");
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function staleLdBarcode() {
  const her = location.pathname.replace(/\/$/, "");
  return her !== startSti && ldProduktSti() === startSti;
}

function triggerPrefetch() {
  if (!SS_AKTIV) return;
  // URL FIRST, PAGE ONLY FOR VARIANTS (6 Oct 2026).
  //
  // The extension used to decide for itself whether a page was a product
  // page (JSON-LD, og:type, microdata, a visible price) and only then ask
  // the server. That check is what failed on apotek1 and bilxtra, whose
  // pages add their product data a second or two after loading: the
  // extension looked too early, said "not a product", and never asked.
  //
  // The server already knows: it has every product URL we scrape and
  // answers [] in ~50 ms for anything else (front pages, categories,
  // searches). So we simply send the URL of every page on a supported
  // shop and let the server decide. The price shown and the "cheaper at X"
  // decision come from the database, never from reading the page.
  //
  // The page is read for ONE thing only: a barcode/variant id, for shops
  // where choosing a colour or size does NOT change the URL (boozt, vita,
  // fredrik_louisa). The variant watcher further down re-asks when that id
  // changes; the server then picks the row for that exact variant.
  const host = location.hostname.replace("www.", "");
  let universalId = getUniversalId();
  if (!universalId && host.includes("ellos.no")) universalId = getEllosEan();
  // Keep only something that looks like a barcode or product code.
  if (!/^[A-Za-z0-9.\-]{4,40}$/.test(String(universalId || ""))) {
    universalId = null;
  }
  // The stale guard is for a barcode taken from JSON-LD that the page did
  // not update. boozt's comes from the SELECTED colour (lesBoozt reads the
  // swatch and eansData), and boozt changes the path on every colour
  // click ("…_26087656/212031107"), so the guard blanked a correct
  // barcode: the server then pooled all 21 colours of a polo and every
  // colour answered with the same royal blue (15 Nov 2026).
  const bzLive = lesBoozt();
  const fraLiveSide = !!(bzLive && bzLive.id && bzLive.id === universalId);
  if (universalId && !fraLiveSide && staleLdBarcode()) universalId = null;
  const searchQuery = universalId || "";

  const key = `${host}__${location.pathname}__${searchQuery}`;
  if (key === lastSentKey) return;
  lastSentKey = key;
  sisteId = universalId || null;
  vaktOppdater();

  sslog(`Prico lookup: ${location.pathname} (id: ${searchQuery || "-"})`);

  // A tab that was open while the extension updated or reloaded still runs
  // the OLD script, whose background is gone: sendMessage then throws
  // "Extension context invalidated" (seen on every 1.4 -> 1.5 update,
  // 27 Oct 2026). The tab recovers on reload; until then stay quiet. The
  // callback swallows the matching lastError for the same reason.
  try {
    chrome.runtime.sendMessage({
      type: "FETCH_PRICES",
      product: searchQuery,
      url: location.href,
      host: host,
      currentPrice: null,
    }, () => { void chrome.runtime.lastError; });
  } catch (e) {
    SS_AKTIV = false;
  }
}

// Hvor lenge varselet står. Sett ned til 5000 om det oppleves påtrengende –
// før hang det i 10 s i koden, men forsvant i praksis etter ~1 ms fordi det lå
// i body (se kommentaren ved appendChild under).
const TOAST_LEVETID_MS = 10000;

function lukkToast() {
  clearTimeout(utsattLukk);
  utsattLukk = null;
  const t = document.getElementById("salescout-toast");
  if (!t) return;
  if (typeof t._lukk === "function") t._lukk();
  else t.remove();
}

// NO DOUBLE POPUP WHEN THE ANSWER IS THE SAME (12 Nov 2026).
// fredrikoglouisa.no/produkt/donna-born-in-roma-edp/ showed the toast, took
// it away and showed it again: the variant watcher saw the page's id settle
// after the first lookup, closed the toast and asked again - and the server
// answered with the same offer. Two changes:
//   * a variant change no longer closes the toast at once. It asks again
//     and gives the answer UTSATT_LUKK_MS to arrive; only if nothing
//     cheaper comes back for the new variant is the old toast closed;
//   * an answer identical to the toast already on screen (same link, price,
//     reference price, badges) leaves that toast alone.
// A page change still closes at once (the interval above): that toast
// belongs to another product.
const UTSATT_LUKK_MS = 2500;
let utsattLukk = null;
function lukkToastSnart() {
  if (!document.getElementById("salescout-toast")) return;
  clearTimeout(utsattLukk);
  utsattLukk = setTimeout(lukkToast, UTSATT_LUKK_MS);
}

// --- OPPDATERT: Det nye lekre varselet ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // The page's own price, for the price report (background.js:
  // meldPrisavvik). Answered at once from data already in the page; a page
  // without a readable price answers 0 and nothing is reported.
  if (msg.type === "PRICO_SIDEPRIS") {
    let svar = { pris: 0, offentlig: false };
    try {
      const lest = sideprisNaa();
      if (lest && lest.pris > 0) {
        const klubb = Number(msg.medlem_her) || 0;
        const likKlubb = klubb > 0 && Math.abs(lest.pris - klubb) <= klubb * 0.01;
        svar = { pris: lest.pris, offentlig: !!lest.offentlig && !(likKlubb && sidaSierKlubbpris()) };
      }
    } catch (e) {}
    sendResponse(svar);
    return;
  }
  if (msg.type === "CHEAPER_FOUND") {
    // THE ANSWER MUST BE FOR THIS PAGE (1.10, 18 Nov 2026). The background
    // sends its answer to the TAB. If the tab has moved on meanwhile - a
    // click on a search result, a category, the next product - the answer
    // for the page before landed here and showed its toast on the wrong
    // page (a product's "Billigere hos POWER" on a search list). The
    // answer now carries the address it was asked for; one for another
    // page, or another size on the same page, is dropped.
    if (msg.side) {
      const spurt = sidenokkel(msg.side) + "#" + variantnokkel(msg.side);
      const her = sidenokkel(location.href) + "#" + variantnokkel(location.href);
      if (spurt !== her) {
        sslog(`Prico: svaret gjaldt ${spurt}, sida er ${her} - ingen toast`);
        return;
      }
    }
    // CAME FROM PRICO'S OWN PRICE LIST (1.12): the customer chose this shop there, with
    // every price in front of them - see huskPricoKlikk. No notice; the icon window still
    // shows the list.
    if (komFraPrico && komFraPrico === normaliserUrl(location.href)) {
      sslog("Prico: kunden kom hit fra prico.no - ingen toast");
      lukkToast();
      return;
    }
    // The page's own price, when it is lower than ours (see sideprisNaa).
    const vaar = Number(msg.her) || 0;
    const lest = vaar > 0 ? sideprisNaa() : null;
    const side = lest ? lest.pris : null;
    if (side && side < vaar * 0.995 && side >= vaar / 3) {
      const klubb = Number(msg.medlem_her) || 0;
      const erKlubbpris = !msg.medlem_paa && klubb > 0 && Math.abs(side - klubb) <= klubb * 0.01
        && !(lest.offentlig && !sidaSierKlubbpris());
      if (!erKlubbpris) {
        const kravd = Math.max(Number(msg.gulv) || 1, side * (Number(msg.andel) || 0.02));
        if ((Number(msg.price) || 0) > side - kravd) {
          sslog(`Prico: sida koster ${side}, vi hadde ${vaar} - ${msg.store} ${msg.price} er ikke billigere, ingen toast`);
          lukkToast();
          return;
        }
        msg = Object.assign({}, msg, { her: side });
      }
    }
    const nokkel = [msg.link, msg.price, msg.her, msg.store, msg.retailer || "", !!msg.is_outlet,
                    msg.match || "", !!msg.medlemspris].join("|");
    const paaSkjerm = document.getElementById("salescout-toast");
    if (paaSkjerm && paaSkjerm._nokkel === nokkel && !paaSkjerm._lukker) {
      clearTimeout(utsattLukk);          // the same offer again: keep the toast
      utsattLukk = null;
      return;
    }
    lukkToast();

    // ONE STATIC SIZE, WHATEVER THE PAGE SAYS (21 Oct 2026).
    //
    // The toast used to be a <div> hung on <html> with only part of its
    // style set inline, so the page's own rules filled in the rest: on
    // elon.no's maintenance page a `div` rule stretched it to the full
    // window height, with the text sitting at the bottom. Two defences:
    //   1. an element name no stylesheet targets (<prico-varsel>, kept
    //      under the old id), with `all: initial` and EVERY box property
    //      set inline - width, height, margins, offsets - so nothing is
    //      left for the page to decide;
    //   2. the content lives in a shadow root, which page CSS cannot
    //      reach at all (rules on a, button, img, span stop at the host).
    const toast = document.createElement("prico-varsel");
    toast.id = "salescout-toast";
    const rot = toast.attachShadow({ mode: "open" });


    // THE SENTENCE IS THE BUTTON, THE SAVING UNDER IT (12 Nov 2026).
    //
    // Before: a title row "Billigere hos <store>" and a button "Gå til
    // butikk ↗ | price". Now the button reads "Billigere hos <store> ↗ |
    // price", and the line under it shows what the click is worth: the
    // price on the page the customer is on, struck through ("Her: 2 140,-"),
    // and the difference as a badge ("Spar 243,-"). `her` is the reference
    // price background.js compared against (our own row for this page, or
    // the member price when the member switch is on), so the two numbers
    // are the ones that triggered the toast. No reference -> no line.
    //
    // The badges keep a row above the button, beside the X. The outlet
    // badge MUST be visible before the click: a used item at 168 against a
    // new one at 199 is not the same offer, which is why is_outlet exists.
    // "2 140,-" for whole kroner, "49,90" when there are øre.
    const kr = (n) => Math.abs(n - Math.round(n)) < 0.005
      ? Math.round(n).toLocaleString("nb-NO") + ",-"
      : n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // The store name and the link come from the server and end up in
    // markup on someone else's page: no character of theirs may close a
    // tag or an attribute, and the link must be a web address.
    const trygg = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const butikk = trygg(msg.store);
    const lenkeUrl = /^https?:\/\//i.test(String(msg.link || "")) ? trygg(msg.link) : "#";
    const pris = Number(msg.price) || 0;
    const her = Number(msg.her) || 0;
    const spar = her - pris;
    // THE LOOK (1.8, 16 Nov 2026) - same card, drawn by a few rules:
    //   * nested corners: the card is 18 px with 8 px padding, so the
    //     button inside it is 10 (it was 16 and 11, slightly off);
    //   * borders and dividers are alpha colours, so they sit right on any
    //     page and in both themes;
    //   * BLUE since 24 Nov 2026, as prico.no and the popup (styles/main.css);
    //   * the palette is built in OKLCH from one hue; the green was a shade
    //     darker than before because white text on #0d9488 is 3.7:1, under
    //     the 4.5:1 that small text needs;
    //   * the arrow and the cross are stroke icons in the weight of the
    //     text beside them, not font characters;
    //   * dark theme: depth by a lighter surface, almost no shadow.
    const mork = morktTema();
    const F = mork ? {
      flate: "oklch(0.27 0.028 266)", blekk: "rgb(255 255 255 / 0.94)",
      kant: "rgb(255 255 255 / 0.12)",
      skygge: "0 0 0 1px rgb(0 0 0 / 0.35), 0 10px 24px rgb(0 0 0 / 0.35)",
      logo: "oklch(0.74 0.13 262)", dempet: "rgb(255 255 255 / 0.7)",
      kryss: "rgb(255 255 255 / 0.66)", kryssHover: "rgb(255 255 255 / 0.95)",
      pilleBg: "oklch(0.36 0.06 264)", pilleBlekk: "oklch(0.88 0.07 262)",
      merkeL: "0.38", merkeC: "0.06", merkeBlekkL: "0.9", merkeBlekkC: "0.09",
      glans: "rgb(255 255 255 / 0.2)",
    } : {
      flate: "#ffffff", blekk: "oklch(0.228 0.037 265)",
      kant: "rgb(0 0 0 / 0.1)",
      skygge: "0 1px 2px rgb(0 0 0 / 0.05), 0 14px 34px rgb(0 0 0 / 0.12)",
      logo: "oklch(0.52 0.194 261.5)", dempet: "rgb(0 0 0 / 0.62)",
      kryss: "rgb(0 0 0 / 0.55)", kryssHover: "rgb(0 0 0 / 0.9)",
      pilleBg: "oklch(0.94 0.03 262)", pilleBlekk: "oklch(0.4 0.16 262)",
      merkeL: "0.94", merkeC: "0.055", merkeBlekkL: "0.42", merkeBlekkC: "0.1",
      glans: "rgb(255 255 255 / 0.16)",
    };
    // Badges: one lightness and chroma, only the hue differs, so none of
    // them shouts louder than the others (amber 80, blue 255, green 155).
    const merke = (tekst, hue, tittel) =>
      `<span${tittel ? ` title="${tittel}"` : ""} style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 6px; border-radius: 6px; flex-shrink: 0; background: oklch(${F.merkeL} ${F.merkeC} ${hue}); color: oklch(${F.merkeBlekkL} ${F.merkeBlekkC} ${hue});">${tekst}</span>`;
    const sparelinje = her > 0 && spar >= 1
      ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; padding: 0 2px 0 4px; font-size: 12.5px; line-height: 1.3; color: ${F.dempet};">
           <span title="Prisen på sida du står på">Her: <s>${kr(her)}</s></span>
           <span style="flex-shrink: 0; background: ${F.pilleBg}; color: ${F.pilleBlekk}; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap;">Spar ${kr(spar)}</span>
         </div>`
      : "";
    // THE LOGO, TOP LEFT (12 Nov 2026), so the card says whose it is. Drawn
    // inline rather than loaded from images/prico.svg: no request, nothing
    // for the page's image rules to block, and it is there in the first
    // frame. Same drawing as that file; a flat fill instead of the gradient
    // so no id is needed inside the shadow root.
    const LOGO = `<span style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="25" height="25" aria-hidden="true" style="display: block;"><path d="M172,21.62L174.88,22.08L176.62,23.19L177.88,24.99L178.37,27.62L178.37,166.38L177.88,169.23L176.88,170.72L175.62,171.86L173.12,172.56L171.62,172.53L169.38,171.81L168.12,170.73L166.88,169.3L166.25,168.88L165.7,168.12L164.27,166.88L161.88,164.28L161.12,163.74L159.88,162.3L159.25,161.88L158.72,161.12L157.29,159.88L154.88,157.28L154.12,156.75L153.69,156.12L152.25,154.88L151.73,154.12L150.3,152.88L149.88,152.27L147.12,149.75L146.7,149.12L145.26,147.88L144.06,146.38L143.39,144.12L143.34,143.12L144.24,140.12L149.12,135.05L159.72,124.62L160.67,123.38L160.95,121.88L160.62,120.57L159.38,119.22L158.62,118.97L157.62,118.92L156.38,119.19L151.38,123.31L147.62,126.79L143.38,130.16L142.88,130.78L142.12,131.26L139.38,133.72L137.38,135.19L136.83,135.88L135.12,137.19L133.62,138.69L129.38,142.09L128.73,142.88L128.12,143.21L123.88,146.87L123.38,147.13L122.76,147.88L115.26,154.12L114.67,154.88L114.12,155.16L105.42,162.62L104.38,163.32L100.62,166.81L96.38,170.21L91.12,174.77L90.38,175.23L88.69,176.88L87.12,177.86L85.38,178.27L84.38,178.33L82.38,177.92L80.35,176.62L78.32,174.12L77.99,173.38L77.8,171.38L78.06,169.38L80.29,166.38L81.95,164.88L83.38,163.26L83.95,162.88L85.25,161.38L86.88,159.95L90.25,156.38L91.88,154.95L92.26,154.38L95.95,150.88L97.25,149.38L97.94,148.88L102.38,144.28L102.95,143.88L104.25,142.38L105.88,140.95L109.26,137.38L110.88,135.95L111.25,135.38L112.88,133.95L116.25,130.38L117.88,128.95L118.27,128.38L122.88,123.94L123.25,123.38L124.88,121.95L128.26,118.38L129.88,116.95L130.25,116.38L131.88,114.95L135.25,111.38L136.88,109.95L137.26,109.38L138.88,107.94L141.88,104.94L142.25,104.38L143.88,102.95L144.28,102.38L145.88,100.95L147.28,99.38L148.88,97.94L149.25,97.38L150.88,95.95L160.82,85.88L161.95,83.62L162,81.88L161.82,80.88L160.68,78.88L159.62,77.66L157.73,76.12L156.62,75.79L154.62,75.49L152.38,76.05L150.12,77.93L51.16,176.88L49.62,177.89L47.12,178.35L44.82,177.88L43.12,176.78L41.21,174.62L40.25,172.38L40.26,170.62L41.19,168.38L43.15,166.12L43.84,165.62L45.12,164.16L45.87,163.62L48.16,161.12L49.62,159.84L50.12,159.15L52.87,156.62L53.2,156.12L54.62,154.87L55.15,154.12L57.86,151.62L66.12,143.2L73.62,135.87L74.16,135.12L75.62,133.84L76.12,133.15L76.85,132.62L78.12,131.18L80.62,128.87L81.12,128.15L81.83,127.62L83.12,126.15L83.87,125.62L90.12,119.16L92.62,116.87L95.12,114.15L95.85,113.62L97.12,112.17L99.62,109.87L100.15,109.12L104.86,104.62L109.12,100.15L109.87,99.62L112.17,97.12L113.62,95.85L114.15,95.12L114.84,94.62L116.12,93.16L118.62,90.87L119.16,90.12L125.62,83.87L126.12,83.15L126.83,82.62L128.12,81.15L128.87,80.62L130.12,79.2L130.86,78.62L132.88,76.15L133.71,74.12L133.69,72.38L132.72,70.12L131.12,68.3L129.62,67.12L127.62,66.31L126.62,66.22L125.62,66.35L123.38,67.37L119.38,71.13L118.85,71.88L118.17,72.38L116.85,73.88L116.13,74.38L113.82,76.88L112.38,78.15L111.88,78.84L109.12,81.3L106.77,83.88L105.34,85.12L104.88,85.77L104.12,86.33L102.88,87.76L100.3,90.12L99.78,90.88L93.31,97.12L92.88,97.77L92.12,98.35L90.88,99.78L90.12,100.3L87.76,102.88L85.12,105.26L83.88,106.7L83.12,107.22L82.66,107.88L81.22,109.12L80.71,109.88L78.12,112.25L76.88,113.68L76.12,114.22L75.67,114.88L74.23,116.12L73.71,116.88L73.12,117.28L71.88,118.7L71.12,119.23L69.88,120.67L69.22,121.12L68.68,121.88L64.85,125.62L62.62,126.89L60.88,127.02L59.12,126.83L57.38,125.82L56.35,124.88L55.18,123.62L54.21,121.88L54.03,120.38L54.12,118.62L55.32,116.38L78.26,93.38L80.88,90.93L83.24,88.38L85.93,85.88L90.25,81.38L92.88,78.93L97.25,74.38L99.88,71.93L102.25,69.38L102.92,68.88L104.89,66.62L105.59,64.38L105.59,63.12L104.88,60.93L103.62,59.28L102.62,58.33L100.62,57.05L98.38,56.85L96.38,57.14L94.12,58.9L33.46,119.62L32.12,120.76L30.38,121.88L28.38,122.06L26.38,121.78L23.65,119.62L22.13,117.62L21.67,114.88L22.06,112.88L22.38,112.18L23.16,111.12L24.62,109.85L25.38,108.9L26.62,107.83L31.12,103.16L31.62,102.86L33.12,101.15L36.62,97.83L38.12,96.16L38.62,95.85L40.12,94.15L43.12,91.16L43.62,90.85L44.15,90.12L45.85,88.62L47.12,87.15L50.12,84.16L50.62,83.85L51.16,83.12L60.76,73.62L62.71,71.38L63.08,70.38L63.35,68.62L62.97,66.12L62.62,65.47L61.62,64.3L31.04,33.88L28.23,30.88L27.34,28.88L27.16,27.38L27.38,25.94L28.31,23.88L30.38,22.18L33.12,21.63Z" fill="${F.logo}"/></svg>
            <span style="font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: ${F.blekk}; line-height: 1;">Prico</span>
          </span>`;
    // THE SHOP'S LOGO in the button (16 Nov 2026), right before the shop's
    // name as in the icon window's list ("Billigere hos [logo] Proshop"):
    // the same file (prico.no/logos/<retailer>.png). No white tile behind it
    // here (owner, 16 Nov): a logo with its own shape (Coolshop's rounded
    // black square) showed white corners on the green button. The
    // logo and the name wrap to the next line together when "Billigere hos"
    // and they do not fit on one. The page
    // we are on decides whether it may load (its Content-Security-Policy
    // applies to pictures we add), so a logo that fails is simply removed
    // and the button looks as it did without one. no-referrer: our server
    // is not told which page asked.
    const rk = String(msg.retailer || "").trim().toLowerCase();
    const LOGOBILDE = /^[a-z0-9_]{2,40}$/.test(rk)
      ? `<img class="ss-logo" src="https://prico.no/logos/${rk}.png" alt="" width="27" height="27" referrerpolicy="no-referrer" style="flex: 0 0 auto; display: block; width: 27px; height: 27px; border-radius: 7px; object-fit: contain;">`
      : "";
    // The arrow stays on the line of the name's last word: an inline icon
    // is a place a line may break, and "Beautycos" got its arrow alone on
    // the next line.
    const sisteMellomrom = butikk.lastIndexOf(" ");
    const navnStart = butikk.slice(0, sisteMellomrom + 1);
    const navnSlutt = butikk.slice(sisteMellomrom + 1);
    const PIL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M4.5 11.5l7-7M6 4.5h5.5V10"/></svg>`;
    rot.innerHTML = `
      <style>
        :host { display: block; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        a:hover { filter: brightness(0.93); }
        button:hover { color: ${F.kryssHover} !important; }
        a:focus-visible, button:focus-visible { outline: 2px solid ${F.logo}; outline-offset: 2px; }
      </style>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 24px; padding: 0 0 0 4px;">
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap;">
          ${LOGO}
          ${msg.is_outlet ? merke("Outlet", 80, "") : ""}
          ${msg.match === "oe" ? merke("OE-match", 255, "Funnet via OE-nummer: tilsvarende del, kan være annet merke") : ""}
          ${msg.match === "el" ? merke("EL-match", 155, "Funnet via EL-nummer: samme artikkel (EFO-nummer)") : ""}
          ${msg.medlemspris ? merke("Medlemspris", 155, "Medlemspris i kundeklubben – du må være medlem for å få den") : ""}
        </div>
        <button class="ss-close-btn" aria-label="Lukk" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 8px; color: ${F.kryss}; cursor: pointer; padding: 0; flex-shrink: 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>
      </div>
      <a href="${lenkeUrl}" target="_blank" rel="noopener" style="display: flex; align-items: stretch; background: linear-gradient(180deg in oklch, oklch(0.55 0.19 261), oklch(0.49 0.19 262)); background-color: oklch(0.52 0.194 261.5); color: #ffffff; text-decoration: none; border-radius: 10px; box-shadow: inset 0 1px 0 ${F.glans}; font-weight: 500; font-size: 15px; line-height: 1.25; margin-top: 6px; overflow: hidden; transition: filter 0.15s;">
        <span style="flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; column-gap: 6px; row-gap: 3px; padding: 12px 12px 12px 14px; min-width: 0;">
          <span style="white-space: nowrap;">Billigere hos</span>
          <span style="display: inline-flex; align-items: center; gap: 6px; min-width: 0;">
            ${LOGOBILDE}
            <b style="font-weight: 700; min-width: 0; overflow-wrap: anywhere;">${navnStart}<span style="white-space: nowrap;">${navnSlutt}&nbsp;${PIL}</span></b>
          </span>
        </span>
        <span style="flex: 0 0 auto; display: flex; align-items: center; padding: 12px 14px; border-left: 1px solid rgb(255 255 255 / 0.28); font-size: 18px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums;">${kr(pris)}</span>
      </a>
      ${sparelinje}
    `;

    const logoIToast = rot.querySelector(".ss-logo");
    if (logoIToast) logoIToast.addEventListener("error", () => logoIToast.remove(), { once: true });

    // The shop the user goes to from here is muted for the toast (see
    // dempSide in connector.js; same key, same rule).
    const lenke = rot.querySelector("a");
    if (lenke) {
      lenke.addEventListener("click", () => {
        try {
          const u = new URL(msg.link);
          const h = u.hostname.replace(/^www\./i, "").toLowerCase();
          const n = h + u.pathname.replace(/\/$/, "").toLowerCase();
          chrome.storage.local.get("prico_demp").then(({ prico_demp: liste }) => {
            const naa = Date.now();
            const ut = (Array.isArray(liste) ? liste : []).filter((d) => d && d.til > naa && d.n !== n);
            // Exact page for seven minutes, the host for one page load (redirects).
            ut.push({ n, h, til: naa + 7 * 60 * 1000, vertTil: naa + 3 * 60 * 1000 });
            return chrome.storage.local.set({ prico_demp: ut.slice(-20) });
          }).catch(() => {});
        } catch (e) {}
      });
    }

    toast.style.all = "initial";
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      bottom: "auto",
      left: "auto",
      display: "block",
      boxSizing: "border-box",
      // AS WIDE AS ITS ONE LINE (16 Nov 2026). With the shop's logo in the
      // sentence, "Billigere hos [logo] Proshop ↗ | 3 596,-" no longer
      // fits the 300 px the card had, and a second line just for the
      // logo and the name was not wanted. The card is now as wide as that
      // line, never under 300 px and never over 400; only a name too long
      // for 400 (Christiania Glasmagasin) moves to a second line, logo and
      // name together.
      width: "max-content",
      minWidth: "300px",
      maxWidth: "400px",
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      margin: "0",
      overflow: "visible",
      textAlign: "left",
      fontSize: "16px",
      lineHeight: "1.2",
      // Same look as prico.no and the popup (20 Oct 2026): white card,
      // hairline border, Inter when the page has it, black button.
      backgroundColor: F.flate,
      color: F.blekk,
      border: "1px solid " + F.kant,
      // Tight on purpose (12 Nov 2026): the green button is the card; the
      // white is only a frame for it.
      padding: "8px",
      borderRadius: "18px",
      boxShadow: F.skygge,
      // THE TOP OF THE STACK (27 Oct 2026). careofcarl.no gives its sticky
      // header z-index 999999999 (nine nines), and the toast's seven nines
      // slid under it. 2147483647 is the largest value CSS accepts, so no
      // page can stack above it.
      zIndex: "2147483647",
      fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
      WebkitFontSmoothing: "antialiased",
      // Startverdier for inn-animasjonen. Settes til 1/1 rett etter at ruta
      // er i DOM-en, se under.
      transformOrigin: "top right",
      transform: "scale(0.85)",
      opacity: "0",
      transition:
        "transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1.15), opacity 150ms ease-out",
    });

    // Festes til <html>, IKKE <body>.
    //
    // Dustin (og andre SPA-er) bytter ut hele innholdet i body når appen
    // hydrerer, ~1 ms etter at siden ser ferdig lastet ut. Toasten lå i body og
    // forsvant med den – den rakk knapt å blinke. <html> står i ro.
    document.documentElement.appendChild(toast);

    // SPRETT INN: liten -> full størrelse.
    //
    // Animasjonen kjøres med JS og inline stiler, ikke med @keyframes. Vi
    // injiserer i FREMMEDE sider: et <style>-element med et keyframe-navn kan
    // kollidere med butikkens egne, og noen sider rydder bort ukjente
    // <style>-tagger. To transform-verdier og en transition kan ingen ta fra
    // oss.
    //
    // Doble requestAnimationFrame er nødvendig: første tikk lar nettleseren
    // regne ut layouten med startverdiene, andre tikk endrer dem. Med bare ett
    // tikk hopper den rett til sluttilstanden uten å animere.
    const roligBevegelse =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (roligBevegelse) {
      toast.style.transition = "none";
      toast.style.transform = "scale(1)";
      toast.style.opacity = "1";
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          toast.style.transform = "scale(1)";
          toast.style.opacity = "1";
        });
      });
    }

    // UT IGJEN SAMME VEI (28 Oct 2026): the toast used to vanish in one
    // frame when the 10 s ran out or the X was clicked. Now it plays the
    // entrance backwards - full size to 0.85 while it fades - and is
    // removed when the transition ends (a timer backs that up, since
    // transitionend does not fire for an element the page has hidden).
    // The watchdog is disconnected first so it does not put the fading
    // toast back; reduced-motion users get the instant removal as before.
    let lukket = false;
    const fjern = () => {
      if (lukket) return;
      lukket = true;
      toast._lukker = true;              // fading out: a new answer gets a new toast
      vakt.disconnect();
      if (roligBevegelse) {
        toast.remove();
        return;
      }
      let borte = false;
      const taBort = () => {
        if (borte) return;
        borte = true;
        toast.remove();
      };
      toast.addEventListener("transitionend", taBort, { once: true });
      toast.style.transition = "transform 160ms ease-in, opacity 140ms ease-in";
      toast.style.transform = "scale(0.85)";
      toast.style.opacity = "0";
      setTimeout(taBort, 260);
    };
    // Så lukkToast() kan lukke den UTENFRA. Før gjorde «existing.remove()»
    // det – men vakta under så at toasten var borte og satte den tilbake,
    // så to varsler kunne ligge oppå hverandre.
    toast._lukk = fjern;
    toast._nokkel = nokkel;

    // Selv på <html> kan aggressive rammeverk rydde bort ukjente noder. Vakta
    // setter toasten tilbake så lenge den skal leve. Den kobles fra når
    // toasten lukkes, så vi ikke lytter på hele DOM-treet i det uendelige.
    const vakt = new MutationObserver(() => {
      if (!lukket && !document.documentElement.contains(toast)) {
        document.documentElement.appendChild(toast);
      }
    });
    vakt.observe(document.documentElement, { childList: true, subtree: true });

    // Klikk på X for å lukke (uten å klikke på selve linken)
    rot.querySelector(".ss-close-btn").onclick = (e) => {
      e.stopPropagation();
      fjern();
    };

    setTimeout(fjern, TOAST_LEVETID_MS);
  }
});

// Kjør ÉN gang ved oppstart. Før kalte vi triggerPrefetch() direkte OG på
// DOMContentLoaded, så på sider som ikke var ferdig lastet ennå gikk det to
// oppslag mot /prices for samme vare.
// ONLY ON OUR STORES (24 Oct 2026). The script is injected on every .no
// site; the background worker holds the day's store list from the server
// and says whether this host is one of ours. If not, nothing below runs:
// no page reading, no lookup, no watchers.
let SS_AKTIV = false;

function ssStart() {
  SS_AKTIV = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", triggerPrefetch, { once: true });
  } else {
    triggerPrefetch();
  }
}

// THE VARIANT WATCHER ONLY WHERE IT CAN DO SOMETHING (27 Oct 2026). It used
// to observe the whole document on every page of a supported shop. On a
// search or category page with infinite scroll, carousels or a countdown
// that is a callback per mutation and a page read per burst, all visit
// long, for a check that can never fire there: a variant change needs an
// id from the first lookup (sisteId) or a WooCommerce variations form.
// So the watcher is on only while one of those holds, re-evaluated after
// every lookup (SPA navigation into a product page turns it on again).
let vaktPaa = false;
function vaktOppdater() {
  const trengs = variantOppslag < 6 &&
    !!(sisteId || document.querySelector("form.variations_form"));
  if (trengs === vaktPaa) return;
  if (trengs) {
    variantVakt.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      // The marks a page puts on the selected option (petxl: data-active on
      // the size button) - see valgtVariant. Only these four attributes.
      attributes: true,
      attributeFilter: ["data-active", "aria-checked", "aria-pressed", "aria-selected"],
    });
  } else {
    variantVakt.disconnect();
  }
  vaktPaa = trengs;
}

// EVERY SITE, AND IDLE ON ALL BUT OUR SHOPS (1.9, 17 Nov 2026). The
// manifest registers this script on all sites, so a new shop - on .no,
// .com or any other ending - gets the toast without a new release and
// without another permission prompt: the list of shops is the server's.
// (1.8 named 100 shop sites in the manifest, 1.7 said *.no plus seven
// .com shops; in both a new site meant a new version that Chrome kept
// disabled until the user approved it.) That makes this the first thing
// to run on every page the user opens, so the answer to "is this one of
// ours?" must cost nothing: the shop list the background script keeps in
// chrome.storage (prico_hosts) is read right here. A host that is not on
// it ends the script at once - no message to the background worker (which
// would wake it on every page), nothing read from the page, nothing sent.
// Only without a list (the first minutes after install) is the background
// asked, as before.
function erVaarButikk(hosts) {
  const deler = location.hostname.toLowerCase().replace(/^www\./, "").split(".");
  for (let i = 0; i < deler.length - 1; i++) {
    if (hosts[deler.slice(i).join(".")]) return true;      // as finnButikk in background.js
  }
  return false;
}

function spoerBakgrunnen() {
  chrome.runtime.sendMessage({ type: "ER_BUTIKK", host: location.hostname }, (svar) => {
    if (chrome.runtime.lastError) return;
    if (svar && svar.ok) ssStart();
    else sslog("Prico: not a supported store, staying idle on", location.hostname);
  });
}

// CAME FROM PRICO'S OWN PRICE LIST (1.12, 25 Nov 2026). The owner: on prico.no he clicked a
// shop that was NOT the cheapest, and its page greeted him with "Billigere hos ..." - for a
// choice he had just made with every shop's price in front of him. The site sends no
// referrer (on purpose) and a mark in the address would not survive every shop, so the
// extension remembers the click itself: on prico.no, a click on a link to another site
// stores that address (host + path) with the time; a shop page that opens within
// FRA_PRICO_MS at that address shows no notice. Only that page: the next product in the
// same tab is a new address and behaves as always, and so does the same page later. The
// icon window is untouched. If the shop sends the visitor on to another address, nothing
// matches and the notice shows as before.
const FRA_PRICO_MS = 3 * 60 * 1000;
let komFraPrico = null;                 // normaliserUrl of the page the customer was sent to from prico.no
const PAA_PRICO = /(^|\.)prico\.no$/i.test(location.hostname);

function huskPricoKlikk(e) {
  try {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const u = new URL(a.href, location.href);
    if (!/^https?:$/.test(u.protocol) || /(^|\.)prico\.no$/i.test(u.hostname)) return;
    const k = normaliserUrl(u.href);
    if (!k) return;
    chrome.storage.local.get("prico_fra").then((r) => {
      const naa = Date.now();
      const liste = ((r && r.prico_fra) || []).filter((x) => x && x.k !== k && naa - x.t < FRA_PRICO_MS).slice(-7);
      liste.push({ k, t: naa });
      return chrome.storage.local.set({ prico_fra: liste });
    }).catch(() => {});
  } catch (x) {}
}
if (PAA_PRICO) {
  document.addEventListener("click", huskPricoKlikk, true);
  document.addEventListener("auxclick", huskPricoKlikk, true);      // middle click: a new tab
}

try {
  chrome.storage.local.get(["prico_hosts", "prico_fra"]).then((r) => {
    const fra = (r && r.prico_fra) || [];
    const her = normaliserUrl(location.href);
    if (fra.some((x) => x && x.k === her && Date.now() - x.t < FRA_PRICO_MS)) komFraPrico = her;
    const liste = r && r.prico_hosts;
    const kjent = liste && liste.hosts && Object.keys(liste.hosts).length > 10
      && Date.now() - (liste.hentet || 0) < 7 * 24 * 60 * 60 * 1000;
    if (kjent && !erVaarButikk(liste.hosts)) return;       // not a shop: done
    spoerBakgrunnen();          // a shop (the background also keeps the list fresh), or no list yet
  }, () => spoerBakgrunnen());
} catch (e) {
  // Extension context gone (reload): stay idle.
}

// SIDE-IDENTITET = origin + sti. Spørrestreng og anker teller IKKE.
//
// Vakta sammenlignet hele location.href, og SPA-er skriver stadig om URL-en
// uten å bytte side: dustin legger på sporingsparametre og #-anker mens du
// blar. Hver slik endring så ut som navigasjon, så vi hentet prisene på nytt
// og varselet spratt opp igjen. Bytter du faktisk produkt, endres stien – og
// laster du sida på nytt, kjører hele content.js om igjen uansett.
const sidenokkel = (u) => {
  try {
    const x = new URL(u);
    return x.origin + x.pathname.replace(/\/$/, "");
  } catch (e) {
    return u;
  }
};

// ...EXCEPT THE PART OF THE QUERY THAT NAMES A SIZE (16 Nov 2026). The pet
// shops keep every pack size on one page and put the chosen one in the
// query: petxl/zoo.no "?p=300011385", vetzoo "?pid=211483", zooplus
// "?activeVariant=1998345.2", musti a bare "?94510". vetzoo's and musti's
// pages carry no barcode per size, so the variant watcher below (which
// looks for a new barcode) saw nothing, and the toast for XS stayed up on
// L. The server picks the row by that number, so a change of it is a new
// lookup. Only these keys and a bare number count - tracking parameters
// still do not.
const VARIANTNOKLER = ["p", "pid", "activevariant", "variant", "variantid", "variation_id"];
const variantnokkel = (u) => {
  try {
    const sok = new URL(u).search.replace(/^\?/, "");
    if (!sok) return "";
    const ut = [];
    for (const del of sok.split("&")) {
      const i = del.indexOf("=");
      if (i < 0) {
        if (/^[0-9][0-9.\-]{2,20}$/.test(del)) ut.push(del);
      } else if (VARIANTNOKLER.includes(del.slice(0, i).toLowerCase()) && del.length > i + 1) {
        ut.push(del.slice(i + 1));
      }
    }
    return ut.join("|");
  } catch (e) {
    return "";
  }
};

let sisteSide = sidenokkel(location.href) + "#" + variantnokkel(location.href);
setInterval(() => {
  if (!SS_AKTIV) return;
  const naa = sidenokkel(location.href) + "#" + variantnokkel(location.href);
  if (naa !== sisteSide) {
    sisteSide = naa;
    // New page or new variant URL: the old "cheaper at X" belongs to the
    // previous one. Close it; the new lookup opens a fresh one if it applies.
    lukkToast();
    lastSentKey = "";
    sistePris = null;
    variantOppslag = 0;
    setTimeout(triggerPrefetch, 500);
  }
}, 500);

// VARIANT BYTTET UTEN NY SIDE (22. sept. 2026). fredrikoglouisa (WooCommerce)
// bytter 75 ml -> 125 ml ved å skrive om prisen I sida; URL-en står stille,
// så vakta over ser ingenting, og varselet for 75 ml ble stående på 125 ml.
// kicks bytter URL per størrelse og var aldri rammet. Vakta her ser etter at
// PRISEN kunden ser på endrer seg, lukker det gamle varselet og spør på nytt
// med den nye prisen – serveren ankrer varianten på pris (±3 %). Debounce så
// DOM-støy ikke gir ett oppslag per tastetrykk; tak på 6 oppslag per side.
// Endringer inne i vårt eget varsel teller ikke.
let variantTimer = null;
const iToast = (m) => {
  const n = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
  return !!(n && n.closest && n.closest("#salescout-toast"));
};
const variantVakt = new MutationObserver((muts) => {
  // BILLIGSTE SJEKK FØRST (23. sept. 2026). Denne vakta ser hele dokumentet,
  // så den fyrer på alt en side finner på: karuseller, nedtellinger, chat,
  // lat lasting. Vi gjør derfor minst mulig arbeid per fyring.
  //
  // 1) Er taket nådd, kobler vi oss HELT fra. Før sto sjekken inne i
  //    debouncen, så etter seks oppslag fortsatte vakta å kalle closest()
  //    for hver eneste endring på sida, resten av økta, for å komme fram
  //    til «gjør ingenting».
  if (variantOppslag >= 6) {
    variantVakt.disconnect();
    vaktPaa = false;
    return;
  }
  // 2) closest()-skanningen finnes bare for å ignorere endringer VÅRT eget
  //    varsel lager. Ligger det ikke noe varsel i DOM-en, kan ingen endring
  //    være vår, og da trenger vi ikke gå gjennom lista i det hele tatt.
  if (document.getElementById("salescout-toast") && muts.every(iToast)) return;
  clearTimeout(variantTimer);
  variantTimer = setTimeout(() => {
    if (variantOppslag >= 6) return;
    // Variant changes are detected by the page's id (barcode/sku) only; the
    // price watch is off together with the page-price reading (2 Oct 2026).
    // vita has 21 shades at the SAME price, so the id was always the
    // reliable half of this check anyway.
    const naa = null;
    const naaId = getUniversalId();
    const nyPris = false;
    // "No id -> an id" also counts on WooCommerce pages: the size the
    // customer picks after a "choose size" start has a barcode where the
    // first lookup had none (see wooVariantId).
    const nyId = naaId && naaId !== sisteId &&
      (sisteId || document.querySelector("form.variations_form"));
    if (!nyPris && !nyId) return;
    variantOppslag++;
    sslog(`Prico: variant endret (${sistePris}/${sisteId} -> ${naa}/${naaId}), spør på nytt`);
    lukkToastSnart();                    // see "NO DOUBLE POPUP" at lukkToast
    lastSentKey = "";
    triggerPrefetch();
  }, 600);
});
// (observe() is called from ssStart once the store check has passed.)
