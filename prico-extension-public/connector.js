// web_script/connector.js

function guessStoreFromUrl(url) {
  try {
    const h = new URL(url).hostname.replace("www.", "").toLowerCase();
    if (h.includes("komplett.no")) return "komplett";
    if (h.includes("elkjop.no")) return "elkjop";
    if (h.includes("power.no")) return "power";
    if (h.includes("netonnet.no")) return "netonnet";
    return h;
  } catch {
    return "ukjent";
  }
}

// Visningsnavn for butikkene. Basen bruker små bokstaver og understrek
// (fredrik_louisa, christiania_glasmagasin); det skal ikke stå slik i
// varselet på sida eller i popup-lista. Brukes av background.js (toast) og
// connector.js (lista). Ukjent navn -> stor forbokstav, understrek -> mellomrom.
const STORE_NAMES = {
  acne: "Acne Studios",
  antonsport: "Anton Sport",
  apotek1: "Apotek 1",
  apotekfordeg: "Apotek for deg",
  ark: "ARK",
  asos: "ASOS",
  bangerhead: "Bangerhead",
  bilxtra: "BilXtra",
  blivakker: "Blivakker",
  boots: "Boots",
  boozt: "Boozt",
  byggmakker: "Byggmakker",
  cdon: "CDON",
  christiania_glasmagasin: "Christiania Glasmagasin",
  coolshop: "Coolshop",
  csmegastore: "CS Megastore",
  dustin: "Dustin",
  eldirekte: "Eldirekte",
  elektroimportoren: "Elektroimportøren",
  elkjop: "Elkjøp",
  ellos: "Ellos",
  elon: "Elon",
  eurodel: "Eurodel",
  eurosko: "Eurosko",
  farmasiet: "Farmasiet",
  fjellsport: "Fjellsport",
  fredrik_louisa: "Fredrik & Louisa",
  hifiklubben: "Hi-Fi Klubben",
  hoyer: "Høyer",
  ideler: "iDeler",
  intersport: "Intersport",
  jernia: "Jernia",
  kicks: "KICKS",
  kjell: "Kjell & Company",
  komplett: "Komplett",
  lyko: "Lyko",
  magasin: "Magasin",
  maxgaming: "MaxGaming",
  megaflis: "Megaflis",
  med24: "Med24",
  monter: "Monter",
  multicom: "Multicom",
  netonnet: "NetOnNet",
  norli: "Norli",
  parfym: "Parfym.no",
  power: "POWER",
  proshop: "Proshop",
  skruvat: "Skruvat",
  thansen: "Thansen",
  vita: "VITA",
  villoid: "Villoid",
  vitusapotek: "Vitusapotek",
  xxl: "XXL",
  // Kept in step with background.js (12 Nov 2026): the server's list names
  // these too, but this table is what shows before that list has loaded.
  autodoc: "Autodoc",
  bakerenogkokken: "Bakeren og Kokken",
  careofcarl: "Care of Carl",
  zalando: "Zalando",
  deal: "Deal",
  illums: "Illums Bolighus",
  kitchentime: "Kitchentime",
  kitchn: "Kitch'n",
  nordicnest: "Nordic Nest",
  obs: "Obs",
  sport1: "Sport 1",
  tilbords: "Tilbords",
  extraleker: "Extra Leker",
  lekekassen: "Lekekassen",
  lekia: "Lekia",
  ringo: "Ringo",
  sprell: "Sprell",
  apotera: "Apotera",
  byggern: "Bygger'n",
  maxbo: "Maxbo",
  obsbygg: "Obs Bygg",
  staypro: "Staypro",
  avxperten: "avXperten",
  nordicfeel: "NordicFeel",
  foto: "Foto.no",
  "24hshop": "24hshop",
  dyrlegeshop: "Dyrlegeshop",
  vetzoo: "VetZoo",
  petxl: "PetXL",
  zoo: "ZOO.no",
  zooplus: "zooplus",
  musti: "Musti",
  vpg: "VPG",
  sportsnett: "Sportsnett",
  braasport: "Braasport",
  gymgrossisten: "Gymgrossisten",
  "3djake": "3DJake",
  lightup: "Lightup.no",
  gamingbutikken: "GamingButikken",
  outnorth: "Outnorth",
  beautycos: "Beautycos",
  ledonline: "LEDonline",
  clasohlson: "Clas Ohlson",
  mekster: "Mekster",
  motorpart: "Motor Part",
};

// Names from the server's store list (cached by background.js under
// prico_hosts) win over the built-in table, so a new store is named
// right without an extension release. Loaded once when the popup opens.
let apiNavn = {};
chrome.storage.local.get("prico_hosts").then((r) => {
  apiNavn = (r && r.prico_hosts && r.prico_hosts.navn) || {};
}).catch(() => {});

function storeName(retailer) {
  const key = String(retailer || "").trim().toLowerCase();
  if (apiNavn[key]) return apiNavn[key];
  if (STORE_NAMES[key]) return STORE_NAMES[key];
  const s = key.replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "ukjent";
}

// SHOP LOGOS (1.8, 16 Nov 2026). One 64 px file per shop, named after the
// retailer key, served from our own site (website/dist/logos in the
// repository) - not bundled, so a new shop gets its logo without an
// extension release, and not fetched from the shop or a favicon service,
// so opening the window tells no third party which shops are listed. A
// shop without a file (or a blocked request) shows its first letter.
const LOGO_URL = "https://prico.no/logos/";
function logoEl(retailer, navn, liten) {
  const klasse = "store-logo" + (liten ? " liten" : "");
  const bokstav = () => {
    const el = document.createElement("span");
    el.className = klasse + " mono";
    el.setAttribute("aria-hidden", "true");
    el.textContent = (String(navn || "").trim().charAt(0) || "?").toUpperCase();
    return el;
  };
  const key = String(retailer || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(key)) return bokstav();
  const img = document.createElement("img");
  img.className = klasse;
  img.alt = "";
  img.decoding = "async";
  img.addEventListener("error", () => img.replaceWith(bokstav()), { once: true });
  img.src = LOGO_URL + key + ".png";
  return img;
}

function fmtPrice(v) {
  const n =
    typeof v === "number"
      ? v
      : Number(
          String(v)
            .replace(/[^\d.,-]/g, "")
            .replace(",", "."),
        );
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("nb-NO").format(n);
  } catch {
    return String(n);
  }
}

const STORAGE_OUTLET = "showOutlet";
// OE-treff (bildeler funnet via OE-nummer, se «match: "oe"» fra /prices).
// På som standard: det er hele poenget med bildel-søket. Av gir samme
// oppførsel som for alle andre butikker – bare strekkode/varenummer.
const STORAGE_OE = "showOe";
// Medlemspris (20 Oct 2026). Off by default: the price everyone pays. On:
// each offer counts as min(price, member_price), the list is re-sorted on
// that, and such lines are tagged «Medlemspris». Read by background.js
// too, for the alert. User-facing text stays Norwegian.
const STORAGE_MEDLEM = "medlem";

// Terskel for varselet på sida, i prosent. Samme nøkkel og samme grenser som
// i background.js (lesMinRabatt der). 2 % var den faste verdien før.
const STORAGE_MIN_RABATT = "minRabatt";
const MIN_RABATT_STANDARD = 2;

function normaliserRabatt(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return MIN_RABATT_STANDARD;
  return Math.min(90, Math.max(0, n));
}

// Må gi NØYAKTIG samme streng som normaliserUrl i background.js, ellers
// sammenligner popup-en to ulike skrivemåter av samme side og viser ingenting.
// A PAGE THE USER CHOSE FROM OUR LIST GETS NO TOAST (27 Oct 2026). When a
// row in the popup (or the toast's button, see content.js) opens a shop,
// the user has decided to shop there; "billigere hos X" on that page would
// only nag. The destination is muted for DEMP_MS in chrome.storage
// (prico_demp: [{n: host+path, til: ms}]); background.js checks it
// before sending CHEAPER_FOUND. The popup itself still works there.
// THE HOST TOO, BRIEFLY (28 Oct 2026). Shops often do not land the user on
// the exact link we stored: boozt rewrites the URL with the chosen size,
// magasin bounces variant URLs to the master page, others redirect to a
// canonical slug - and then the exact-page key never matched. So the
// shop's host is muted as well, for the first page load on that host
// within DEMP_VERT_MS of the click (background.js clears it once spent);
// the next product on the same shop gets the alert as usual.
const DEMP_MS = 7 * 60 * 1000;
const DEMP_VERT_MS = 3 * 60 * 1000;
async function dempSide(url) {
  const n = normaliserUrl(url);
  if (!n) return;
  let h = "";
  try { h = new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch (e) {}
  try {
    const { prico_demp: liste } = await chrome.storage.local.get("prico_demp");
    const naa = Date.now();
    const ut = (Array.isArray(liste) ? liste : []).filter((d) => d && d.til > naa && d.n !== n);
    ut.push({ n, h, til: naa + DEMP_MS, vertTil: naa + DEMP_VERT_MS });
    await chrome.storage.local.set({ prico_demp: ut.slice(-20) });
  } catch (e) {}
}

function normaliserUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return (
      url.hostname.replace(/^www\./i, "").toLowerCase() +
      url.pathname.replace(/\/$/, "").toLowerCase()
    );
  } catch (e) {
    return null;
  }
}

async function visOutlet() {
  const { [STORAGE_OUTLET]: v } = await chrome.storage.local.get(STORAGE_OUTLET);
  return v === true;                       // av som standard
}

async function visOe() {
  const { [STORAGE_OE]: v } = await chrome.storage.local.get(STORAGE_OE);
  return v !== false;                      // på som standard
}

async function visMedlem() {
  const { [STORAGE_MEDLEM]: v } = await chrome.storage.local.get(STORAGE_MEDLEM);
  return v === true;                       // av som standard
}

// The price to show and sort on for an offer: the member price when the
// switch is on and the shop has one that is lower; otherwise the public one.
function effektivPris(o, medlem) {
  const p = Number(o && o.price) || 0;
  const m = Number(o && o.member_price) || 0;
  if (medlem && m > 0 && (p <= 0 || m < p)) return { pris: m, medlem: true };
  return { pris: p, medlem: false };
}

// Fjerner det brukeren har skrudd av. Brukes både på det lagrede svaret og
// på det ferske fra serveren, så lista aldri blinker med treff som skal bort.
function filtrer(liste, showOutlet, showOe, medlem) {
  let ut = liste;
  if (!showOutlet) ut = ut.filter((o) => !o || !o.is_outlet);
  if (!showOe) ut = ut.filter((o) => !o || o.match !== "oe");
  if (medlem) {
    // Re-sort on the member price where it applies; the server sorted on
    // the public price. Price-less rows stay at the end, as before.
    ut = [...ut].sort((a, b) => {
      const pa = effektivPris(a, true).pris, pb = effektivPris(b, true).pris;
      return (pa <= 0) - (pb <= 0) || pa - pb;
    });
  }
  return ut;
}

// A MESSAGE THE USER CAN ACT ON (8 Oct 2026). Errors used to be shown raw:
// "Feil: Failed to fetch". On a filtered network (airport, hotel, work)
// the browser cannot reach api.prico.no at all, and that text read as
// "Prico is broken". The fetch itself cannot tell us why it failed, so
// we separate what we can: offline, a network that blocks us, rate limit,
// and trouble on our side. User-facing text stays Norwegian.
function feilTekst(error) {
  const tekst = String((error && error.message) || error || "");
  const status = error && error.status;
  if (status === 429) {
    return "For mange oppslag på kort tid. Vent et minutt og prøv igjen.";
  }
  if (status >= 500) {
    return "Prico har et midlertidig problem. Prøv igjen om litt.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(tekst)) {
    if (navigator.onLine === false) {
      return "Du er ikke koblet til internett.";
    }
    return "Får ikke kontakt med Prico. Nettverket du er på (for eksempel på flyplass, hotell eller jobb) kan blokkere oss. Prøv igjen på et annet nett.";
  }
  return "Noe gikk galt. Prøv igjen om litt.";
}

// The "lowest in 30 days" line under a shop's name (see render): muted
// "Lavest 30 d: 1 199 kr" when the shop has been cheaper this month, green
// "Laveste på 30 d" when today's price is the lowest it has been.
function lavestLinje(lavest, offentlig) {
  lavest = Number(lavest) || 0;
  offentlig = Number(offentlig) || 0;
  if (!(lavest > 0 && offentlig > 0)) return null;
  const l = document.createElement("div");
  l.className = "lavest";
  if (lavest < offentlig) {
    l.textContent = `Lavest 30 d: ${fmtPrice(lavest)} kr`;
    l.title = "Den laveste prisen butikken har hatt på varen de siste 30 dagene";
  } else {
    l.textContent = "Laveste på 30 d";
    l.classList.add("lavest-naa");
    l.title = "Prisen i dag er den laveste butikken har hatt på varen de siste 30 dagene";
  }
  return l;
}

// The chart segment at the right end of a row plus its panel in the card.
function histSegment(line, rad, link, store, pris) {
  const knapp = document.createElement("button");
  knapp.className = "hist-btn";
  knapp.type = "button";
  knapp.title = "Prishistorikk";
  knapp.setAttribute("aria-label", `Prishistorikk hos ${store}`);
  knapp.setAttribute("aria-expanded", "false");
  knapp.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'd="M3 17l5-6 4 3 5-7 4 4"/></svg>';
  const panel = document.createElement("div");
  panel.className = "hist-panel";
  panel.hidden = true;
  knapp.addEventListener("click", () => {
    visHistorikk(panel, knapp, link, store, pris);
  });
  rad.appendChild(knapp);
  line.appendChild(rad);
  line.appendChild(panel);
}

function render(list, error, opts) {
  opts = opts || {};
  const div = document.getElementById("product-list");
  if (!div) return;

  div.innerHTML = "";

  if (error) {
    const line = document.createElement("div");
    line.className = "content-line";
    const p = document.createElement("p");
    p.textContent = feilTekst(error);
    line.appendChild(p);
    div.appendChild(line);
    return;
  }

  if (!Array.isArray(list) || list.length === 0) {
    const line = document.createElement("div");
    line.className = "content-line";
    const p = document.createElement("p");
    p.textContent =
      "Åpne en produktside i en støttet nettbutikk, så viser Prico " +
      "billigere alternativer her.";
    line.appendChild(p);
    div.appendChild(line);
    return;
  }

  // THE PAGE YOU ARE ON, FIRST (27 Oct 2026). Every offer repeats our
  // stored price for the page (anker_pris), its member price and its
  // 30-day low, and the popup knows the page URL and the shop. So the
  // product in front of the user gets the top card: "DU ER HER · SHOP",
  // the price large, the 30-day low under it, and the same chart segment
  // as the alternatives. Not clickable - it is the page.
  const her = opts.her || null;
  const forste = list[0] && typeof list[0] === "object" ? list[0] : {};
  const ankerPris = Number(forste.anker_pris) || 0;
  const ankerMedlem = Number(forste.anker_medlemspris) || 0;
  let ankerBruk = !!opts.medlem && ankerMedlem > 0 && ankerMedlem < ankerPris ? ankerMedlem : ankerPris;
  // THE PAGE'S OWN PRICE WHEN IT IS LOWER THAN OURS (16 Nov 2026) - the same
  // rule as the toast (content.js: sideprisNaa). Our row is from the last
  // sweep; a shop that started an offer since then shows the new price on
  // the page, and "Du er her" and every "Spar"/"dyrere" under it should be
  // measured against that. Read from the open page by the script below,
  // never sent anywhere. Lower only, at least a third of ours, and not the
  // page's member price while the member switch is off.
  const sidePris = Number(opts.sidePris) || 0;
  let fraSida = false;
  if (sidePris > 0 && ankerBruk > 0 && sidePris < ankerBruk * 0.995 && sidePris >= ankerBruk / 3) {
    // ...unless the page declares the price public (content.js: tilbudNivaa).
    const erKlubbpris = !opts.medlem && ankerMedlem > 0 && Math.abs(sidePris - ankerMedlem) <= ankerMedlem * 0.01 && !opts.sideOffentlig;
    if (!erKlubbpris) {
      ankerBruk = sidePris;
      fraSida = true;
    }
  }
  if (her && her.url && ankerPris > 0) {
    const line = document.createElement("div");
    line.className = "content-line anchor-line";
    const rad = document.createElement("div");
    rad.className = "line-row";
    const venstre = document.createElement("div");
    venstre.className = "line-main";

    // THE PRODUCT (1.8): the page's own picture and name on top of the
    // card, when /prices sends them (anker_bilde, anker_navn). The picture
    // comes from the shop the user is already on.
    const pNavn = String(forste.anker_navn || "").trim();
    if (pNavn) {
      const hode = document.createElement("div");
      hode.className = "produkt-hode";
      const bildeUrl = String(forste.anker_bilde || "");
      if (/^https:\/\//i.test(bildeUrl)) {
        const flis = document.createElement("div");
        flis.className = "produkt-bilde";
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => flis.remove(), { once: true });
        img.src = bildeUrl;
        flis.appendChild(img);
        hode.appendChild(flis);
      }
      const n = document.createElement("div");
      n.className = "produkt-navn";
      n.textContent = pNavn;
      n.title = pNavn;
      hode.appendChild(n);
      line.appendChild(hode);
    }

    const label = document.createElement("div");
    label.className = "anchor-label";
    label.appendChild(logoEl(her.key, her.store, true));
    label.appendChild(document.createTextNode(`Du er her · ${her.store}`));
    const pris = document.createElement("div");
    pris.className = "anchor-price";
    pris.textContent = `${fmtPrice(ankerBruk)} kr`;
    if (ankerBruk !== ankerPris && !fraSida) {
      const m = document.createElement("span");
      m.className = "medlem-tag";
      m.textContent = "Medlemspris";
      m.title = `Medlemspris i kundeklubben. Uten medlemskap: ${fmtPrice(ankerPris)} kr`;
      pris.appendChild(m);
    }
    venstre.appendChild(label);
    venstre.appendChild(pris);
    const lavest = Number(forste.anker_lowest_30d) || 0;
    if (lavest > 0) {
      const l = document.createElement("div");
      l.className = "anchor-low";
      l.textContent = fraSida && ankerBruk <= lavest
        ? "Ny pris i dag"
        : lavest < ankerBruk
          ? `Laveste siste 30 d: ${fmtPrice(lavest)} kr`
          : "Laveste pris siste 30 d";
      venstre.appendChild(l);
    }
    rad.appendChild(venstre);
    histSegment(line, rad, her.url, her.store, ankerPris);
    div.appendChild(line);

    const overskrift = document.createElement("p");
    overskrift.className = "section-label";
    overskrift.textContent = "Andre butikker";
    div.appendChild(overskrift);
  }

  // The reference for "Spar X kr": the page's price as the user sees it
  // (member price when the switch is on and the shop has one).
  const ref = ankerBruk > 0 ? ankerBruk : 0;
  let billigstMerket = false;
  // One box for all the offers (1.8); see .offers in main.css.
  const gruppe = document.createElement("div");
  gruppe.className = "offers";
  div.appendChild(gruppe);

  list.forEach((item) => {
    const pObj = item && typeof item === "object" ? item : {};
    const url = pObj.url || pObj.link || "";
    const store = storeName(
      pObj.store || pObj.retailer || (url ? guessStoreFromUrl(url) : "ukjent"),
    );
    // Medlemspris: with the switch on, the lower member price is shown and
    // tagged; the public price goes in the tooltip so both are visible.
    const eff = effektivPris(pObj, !!(opts && opts.medlem));
    const price = eff.pris;
    const erOutlet = !!pObj.is_outlet;

    // ONE CARD: shop name with its tags and the 30-day line on the left,
    // the price and the saving on the right, the chart segment at the end.
    const line = document.createElement("div");
    line.className = "content-line";
    const rad = document.createElement("div");
    rad.className = "line-row";
    const venstre = document.createElement("div");
    venstre.className = "line-main";
    if (url) {
      venstre.classList.add("clickable");
      venstre.addEventListener("click", async () => {
        await dempSide(url);
        chrome.tabs.create({ url, active: true });
      });
    }

    venstre.appendChild(logoEl(pObj.retailer || pObj.store, store, false));
    const tekst = document.createElement("div");
    tekst.className = "line-text";
    const navn = document.createElement("div");
    navn.className = "store-name";
    navn.textContent = store;
    // Outlet/B-vare markeres tydelig, ikke bare i teksten – kunden må se at
    // prisen gjelder en brukt/demo-vare før hun klikker.
    if (erOutlet) {
      const tag = document.createElement("span");
      tag.className = "outlet-tag";
      tag.textContent = "Outlet";
      navn.appendChild(tag);
    }
    // Bildeler: treffet er funnet via OE-nummer (samme del, annet
    // varenummer/merke) – ikke nødvendigvis samme artikkel.
    if (pObj.match === "oe") {
      const tag = document.createElement("span");
      tag.className = "oe-tag";
      tag.textContent = "OE-match";
      tag.title = "Funnet via OE-nummer: tilsvarende del, kan være annet merke";
      navn.appendChild(tag);
    }
    if (eff.medlem) {
      const tag = document.createElement("span");
      tag.className = "medlem-tag";
      tag.textContent = "Medlemspris";
      tag.title = `Medlemspris i kundeklubben. Uten medlemskap: ${fmtPrice(pObj.price)} kr`;
      navn.appendChild(tag);
    }
    tekst.appendChild(navn);
    // LOWEST PRICE IN 30 DAYS (27 Oct 2026). lowest_30d comes from /prices:
    // the lowest price this shop has had for the product in the last 30
    // days, today's price included. Compared against the public price,
    // not the member price. User-facing text stays Norwegian.
    const l = lavestLinje(pObj.lowest_30d, pObj.price);
    if (l) tekst.appendChild(l);
    venstre.appendChild(tekst);

    const hoyre = document.createElement("div");
    hoyre.className = "line-price";
    const prisEl = document.createElement("div");
    prisEl.className = "price";
    prisEl.textContent = price > 0 ? `${fmtPrice(price)} kr` : "—";
    hoyre.appendChild(prisEl);
    // "Spar X kr" against the page's price; the first (cheapest) such
    // card gets the green border.
    if (ref > 0 && price > 0 && price < ref) {
      const spar = document.createElement("span");
      spar.className = "spar-pill";
      spar.textContent = `Spar ${fmtPrice(ref - price)} kr`;
      hoyre.appendChild(spar);
      if (!billigstMerket) {
        line.classList.add("best-line");
        billigstMerket = true;
        const b = document.createElement("span");
        b.className = "billigst-tag";
        b.textContent = "Billigst";
        navn.appendChild(b);
      }
    } else if (ref > 0 && price > ref) {
      // Not cheaper than the page: say by how much, where the saving
      // would have stood.
      const d = document.createElement("span");
      d.className = "dyrere";
      d.textContent = `${fmtPrice(price - ref)} kr dyrere`;
      hoyre.appendChild(d);
    }
    venstre.appendChild(hoyre);
    rad.appendChild(venstre);

    if (url) {
      histSegment(line, rad, url, store, Number(pObj.price) || 0);
    } else {
      line.appendChild(rad);
    }

    gruppe.appendChild(line);
  });

  // The shipping footnote ("Priser uten frakt ...") was removed 27 Oct 2026
  // at the redesign; prices are still without shipping, the popup just no
  // longer says so on every list.
}

// ---------------------------------------------------------------------------
// PRICE HISTORY (27 Oct 2026)
// ---------------------------------------------------------------------------
// The chart icon on a row opens a panel with the shop's price curve for the
// product, from GET /price_history?link=<the offer's link> (every point
// where sale_price changed, oldest first). Fetched only when asked for, so
// the popup itself is as fast as before; one fetch per row per popup
// (cached in histCache). Drawn as a step line in plain SVG - the popup's
// content security policy allows no chart library, and prices are steps,
// not slopes. A row with many points but few distinct prices is a variant
// zig-zag (several colours/sizes overwriting one row), not a price that
// moved; the panel says so instead of drawing it, by the same rule as the
// server's lowest_30d (FLAPP_MAKS 12, under a third distinct).
const HIST_API = "https://api.prico.no/price_history?link=";
const HIST_FLAPP_MAKS = 12;
const histCache = new Map();

async function hentHistorikk(link, pris) {
  if (histCache.has(link)) return histCache.get(link);
  // The price picks the row when several share the link (sizes on one URL).
  const r = await fetch(HIST_API + encodeURIComponent(link) +
    (pris > 0 ? "&pris=" + encodeURIComponent(pris) : ""));
  if (!r.ok) {
    const feil = new Error(`HTTP ${r.status}`);
    feil.status = r.status;
    throw feil;
  }
  const d = await r.json();
  const pts = (Array.isArray(d && d.points) ? d.points : [])
    .map((x) => ({ t: new Date(x.t), pris: Number(x.price) }))
    .filter((x) => Number.isFinite(x.pris) && x.pris > 0 && !isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  histCache.set(link, pts);
  return pts;
}

function fmtDato(d, lang) {
  try {
    return new Intl.DateTimeFormat("nb-NO", lang || { day: "numeric", month: "short" }).format(d);
  } catch {
    return `${d.getDate()}.${d.getMonth() + 1}`;
  }
}

function erFlapp(pts) {
  const grense = Date.now() - 30 * 24 * 3600 * 1000;
  const nylige = pts.filter((x) => x.t.getTime() >= grense);
  const ulike = new Set(nylige.map((x) => x.pris)).size;
  return nylige.length > HIST_FLAPP_MAKS && ulike * 3 < nylige.length;
}

// The periods under the chart (27 Oct 2026: 30/60/90 days). The lines
// above the chart - lowest and average - follow the chosen period.
const HIST_PERIODER = [
  { navn: "30 d", dager: 30 },
  { navn: "60 d", dager: 60 },
  { navn: "90 d", dager: 90 },
];
const HIST_STANDARD = 0;             // 30 d

// The series for a period: the price in force at the start of the window
// (the last point before it), the points inside it, and the last price
// carried to today. Prices are steps: a price holds until the next point.
function histSerie(pts, dager) {
  const naa = Date.now();
  let start = dager ? naa - dager * 24 * 3600 * 1000 : pts[0].t.getTime();
  const inne = pts.filter((x) => x.t.getTime() >= start);
  const foer = pts.filter((x) => x.t.getTime() < start);
  const serie = [];
  if (foer.length) serie.push({ t: new Date(start), pris: foer[foer.length - 1].pris });
  else if (inne.length) start = inne[0].t.getTime();
  for (const x of inne) serie.push(x);
  const sist = serie[serie.length - 1].pris;
  serie.push({ t: new Date(naa), pris: sist, idag: true });
  return { serie, start, slutt: naa };
}

// A "nice" tick step so the price axis gets 3-5 round labels.
function nicePris(maks) {
  const raa = maks / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raa || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raa) return m * p;
  return 10 * p;
}

// Filled step chart in plain SVG with a hover marker (date + price).
let histTeller = 0;
function tegnKurve(serie, start, slutt, store) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 296, H = 128, padL = 44, padR = 8, padT = 8, padB = 22;
  // One gradient id per chart. With a shared id, fill: url(#…) resolved
  // to the FIRST gradient in the document, and once that chart's panel
  // was closed (hidden subtree) every other chart lost its fill.
  const fyllId = `hist-fyll-${++histTeller}`;
  const boks = document.createElement("div");
  boks.className = "hist-chart";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("class", "hist-svg");
  boks.appendChild(svg);

  const priser = serie.map((x) => x.pris);
  const hi = Math.max(...priser);
  const steg = nicePris(hi * 1.1);
  const topp = Math.ceil((hi * 1.1) / steg) * steg;
  const x = (t) => padL + ((t - start) / Math.max(1, slutt - start)) * (W - padL - padR);
  const y = (p) => padT + (1 - p / topp) * (H - padT - padB);
  const el = (navn, attrs, tekst) => {
    const e = document.createElementNS(NS, navn);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    if (tekst != null) e.textContent = tekst;
    svg.appendChild(e);
    return e;
  };

  // Fill under the line: a gradient from the ink colour to nothing.
  const defs = el("defs", {});
  const grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", fyllId);
  grad.setAttribute("x1", "0"); grad.setAttribute("x2", "0");
  grad.setAttribute("y1", "0"); grad.setAttribute("y2", "1");
  for (const [off, op] of [["0%", "0.22"], ["100%", "0.02"]]) {
    const st = document.createElementNS(NS, "stop");
    st.setAttribute("offset", off);
    st.setAttribute("class", "hist-stop");
    st.setAttribute("stop-opacity", op);
    grad.appendChild(st);
  }
  defs.appendChild(grad);

  // Price axis: horizontal hairlines with labels at the left.
  for (let v = 0; v <= topp + 1e-9; v += steg) {
    el("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: "hist-grid" });
    el("text", { x: padL - 6, y: y(v) + 3, class: "hist-axis", "text-anchor": "end" }, fmtPrice(v));
  }
  // Month labels along the bottom, one per month boundary in the window.
  const d0 = new Date(start);
  const m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
  const mndNavn = (d) => fmtDato(d, { month: "short" }).replace(".", "");
  if (m.getTime() - start > (slutt - start) * 0.12) {
    el("text", { x: x(start), y: H - 6, class: "hist-axis", "text-anchor": "start" }, mndNavn(d0));
  }
  while (m.getTime() < slutt) {
    const px = x(m.getTime());
    el("line", { x1: px, x2: px, y1: padT, y2: H - padB, class: "hist-grid" });
    if (slutt - m.getTime() > (slutt - start) * 0.08) {
      el("text", { x: px + 3, y: H - 6, class: "hist-axis", "text-anchor": "start" }, mndNavn(m));
    }
    m.setMonth(m.getMonth() + 1);
  }

  // The step line and the area under it.
  let d = "";
  for (let i = 0; i < serie.length; i++) {
    const px = x(serie[i].t.getTime()), py = y(serie[i].pris);
    d += i === 0 ? `M${px.toFixed(1)},${py.toFixed(1)}` : ` H${px.toFixed(1)} V${py.toFixed(1)}`;
  }
  const bunn = y(0);
  el("path", {
    d: d + ` V${bunn.toFixed(1)} H${x(start).toFixed(1)} Z`,
    class: "hist-area", fill: `url(#${fyllId})`,
  });
  el("path", { d, class: "hist-line" });

  // Hover: a dashed marker, a dot on the line and a tooltip with the date
  // and the price in force there.
  const marker = el("line", { x1: 0, x2: 0, y1: padT, y2: H - padB, class: "hist-marker" });
  const prikk = el("circle", { cx: 0, cy: 0, r: 3.5, class: "hist-dot" });
  marker.style.display = prikk.style.display = "none";
  const tip = document.createElement("div");
  tip.className = "hist-tip";
  tip.hidden = true;
  boks.appendChild(tip);

  const prisVed = (t) => {
    let p = serie[0].pris;
    for (const s of serie) { if (s.t.getTime() <= t) p = s.pris; else break; }
    return p;
  };
  svg.addEventListener("mousemove", (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    if (sx < padL || sx > W - padR) return;
    const t = start + ((sx - padL) / (W - padL - padR)) * (slutt - start);
    const pris = prisVed(t);
    marker.setAttribute("x1", sx); marker.setAttribute("x2", sx);
    prikk.setAttribute("cx", sx); prikk.setAttribute("cy", y(pris));
    marker.style.display = prikk.style.display = "";
    const dato = new Date(t);
    tip.textContent = "";
    const l1 = document.createElement("div");
    l1.textContent = `${fmtDato(dato, { day: "numeric", month: "short", year: "numeric" })} (${fmtDato(dato, { weekday: "long" })})`;
    const l2 = document.createElement("div");
    l2.textContent = `${fmtPrice(pris)} kr hos ${store}`;
    tip.appendChild(l1); tip.appendChild(l2);
    tip.hidden = false;
    const venstre = (sx / W) * r.width;
    tip.style.left = `${venstre > r.width * 0.55 ? venstre - tip.offsetWidth - 10 : venstre + 10}px`;
    tip.style.top = `${Math.max(0, (y(pris) / H) * r.height - 34)}px`;
  });
  svg.addEventListener("mouseleave", () => {
    marker.style.display = prikk.style.display = "none";
    tip.hidden = true;
  });
  return boks;
}

function byggPanel(panel, pts, store) {
  panel.textContent = "";
  const kurve = document.createElement("div");
  const fot = document.createElement("div");
  fot.className = "hist-foot";
  const knapper = document.createElement("div");
  knapper.className = "hist-periods";
  const tall = document.createElement("div");
  tall.className = "hist-stats";
  fot.appendChild(knapper);
  fot.appendChild(tall);
  panel.appendChild(kurve);
  panel.appendChild(fot);

  const linje = (tekst, verdi) => {
    const d = document.createElement("div");
    d.append(tekst);
    const b = document.createElement("b");
    b.textContent = `${fmtPrice(verdi)} kr`;
    d.appendChild(b);
    return d;
  };
  const vis = (idx) => {
    const per = HIST_PERIODER[idx];
    const { serie, start, slutt } = histSerie(pts, per.dager);
    const idag = serie[serie.length - 1].pris;
    const lavest = Math.min(...serie.map((x) => x.pris));
    // Average over the period, weighted by how long each price stood
    // (a price that held for 25 days counts 25 times a one-day campaign).
    let sum = 0, tid = 0;
    for (let i = 0; i < serie.length - 1; i++) {
      const varighet = serie[i + 1].t.getTime() - serie[i].t.getTime();
      if (varighet > 0) { sum += serie[i].pris * varighet; tid += varighet; }
    }
    const snitt = tid > 0 ? Math.round(sum / tid) : idag;
    tall.textContent = "";
    tall.appendChild(linje("Pris i dag: ", idag));
    tall.appendChild(linje(`Lavest ${per.navn}: `, lavest));
    tall.appendChild(linje(`Snitt ${per.navn}: `, snitt));
    kurve.textContent = "";
    kurve.appendChild(tegnKurve(serie, start, slutt, store));
    [...knapper.children].forEach((k, i) => k.classList.toggle("hist-period-on", i === idx));
  };
  HIST_PERIODER.forEach((per, i) => {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "hist-period";
    k.textContent = per.navn;
    k.addEventListener("click", () => vis(i));
    knapper.appendChild(k);
  });
  vis(HIST_STANDARD);
}

// ONE SMOOTH CHANGE (owner, 16 Nov 2026). Opening a chart, the shop list or
// the settings changes the height of the window. It used to happen in two
// jumps for a chart ("Henter prishistorikk …", then the chart). A chart
// is now fetched BEFORE its panel opens, so there is one change, and what
// opens fades in (main.css: vis-inn).
//
// NOT a View Transition, although the light/dark switch uses one: Chrome
// sizes the icon window to its content, so opening a panel resizes the
// window, and a transition is aborted when the viewport changes size
// ("InvalidStateError: Transition was aborted because of invalid state.
// Viewport size changed" on chrome://extensions, owner's test 16 Nov; the
// first build used one here and it never ran in the real window - the
// test page was a tab with a fixed size). The theme switch does not
// change the height, so it keeps its cross-fade.
function medOvergang(endre) {
  endre();
}

async function visHistorikk(panel, knapp, link, store, pris) {
  const settAapen = (aapen) => {
    panel.hidden = !aapen;
    knapp.setAttribute("aria-expanded", aapen ? "true" : "false");
    knapp.classList.toggle("hist-btn-open", aapen);
  };
  if (!panel.hidden) {
    medOvergang(() => settAapen(false));
    return;
  }
  if (!panel.dataset.lastet) {
    if (knapp.dataset.henter) return;           // a second click while it loads
    knapp.dataset.henter = "1";
    knapp.classList.add("hist-btn-henter");
    panel.dataset.lastet = "1";
    try {
      const pts = await hentHistorikk(link, pris);
      if (!pts.length) {
        panel.textContent = "Ingen prishistorikk for denne varen ennå.";
      } else if (erFlapp(pts)) {
        panel.textContent =
          "Prishistorikken er ikke pålitelig for denne varen: butikken viser " +
          "flere varianter på samme side, så prisene blander seg.";
      } else {
        byggPanel(panel, pts, store);
      }
    } catch (e) {
      panel.dataset.lastet = "";
      panel.textContent = feilTekst(e);
    } finally {
      delete knapp.dataset.henter;
      knapp.classList.remove("hist-btn-henter");
    }
  }
  medOvergang(() => settAapen(true));
}

async function loadAndRender() {
  try {
    const {
      latestPrices = [],
      latestHost = null,
      latestUrl = null,
      showOutlet = false,
    } = await chrome.storage.local.get([
      "latestPrices",
      "latestHost",
      "latestUrl",
      STORAGE_OUTLET,
    ]);
    const showOe = await visOe();
    const medlem = await visMedlem();

    // latestPrices er GLOBAL. Uten denne sjekken viste popup-en resultatene
    // fra forrige side: sto du på dustin.no kunne du se «dustin – 1 686 kr»,
    // fordi lista var hentet mens du var på NetOnNet (der Dustin med rette er
    // et alternativ). Vi viser derfor bare treff som hører til FANEN DU ER I.
    // Vi sammenligner HELE URL-en, ikke bare verten. Vertssjekken alene var
    // for løs: alt du hadde slått opp tidligere på SAMME butikk passerte, så
    // popup-en kunne vise forrige produkts tilbud for produktet du står på nå.
    // Det var det som gjorde at «teknikmagasinet 59 kr» ble hengende igjen på
    // AirPods Pro 3 lenge etter at serveren sluttet å svare det.
    // POPUP-EN SPØR API-ET SELV. DEN VENTER IKKE PÅ content.js.
    //
    // Før leste vi bare det content.js hadde lagt i storage, og viste
    // «åpne en produktside» hvis det ikke fantes noe for denne fanen. Men
    // content.js kjører BARE på domenene som står i manifest.matches, og den
    // lista er statisk – Chrome låser den ved installasjon. Den hadde drevet
    // fra virkeligheten: 1. september sto 11 butikker med ferske rader UTEN
    // content script (apotekfordeg, vitusapotek, boots, byggmakker,
    // csmegastore, dustin, fredrik_louisa, magasin, med24, multicom, parfym),
    // mens 21 domener vi ikke lenger skraper fortsatt lå i lista.
    //
    // Resultatet var det verst tenkelige: på apotekfordeg og vitusapotek sa
    // utvidelsen «vi støtter ikke denne sida», mens API-et hele tiden svarte
    // med apotek1 til 161 kr. Vi hadde svaret og viste det ikke.
    //
    // Nå er URL-en det eneste vi trenger: fanen gir den, basen bestemmer om
    // vi kjenner sida. Legger du til en butikk i basen, virker utvidelsen der
    // samme øyeblikk – ingen ny manifest, ingen ny utrulling til Chrome Web
    // Store. Det er samme oppførsel som butikklista på nettsida.
    //
    // content.js er fortsatt nyttig for merket på selve sida, men det er ikke
    // lenger noe prissammenligningen er avhengig av.
    let tabUrl = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) tabUrl = tab.url;
    } catch (e) {}

    if (!tabUrl || !/^https?:/i.test(tabUrl)) {
      render([], null);                     // chrome://, about:blank osv.
      return;
    }

    const naaUrl = normaliserUrl(tabUrl);

    // ONLY ON OUR STORES (25 Oct 2026) - the same gate as content.js. The
    // popup used to run its page-reading script on whatever tab was open;
    // now it first checks the host against the day's store list. On any
    // other site it shows the "open a product page" text and reads nothing.
    // `her` = the page itself: its URL without query/fragment (what /prices
    // and /price_history look up) and the shop's display name, for the
    // first row of the list (see render).
    let her = null;
    try {
      const u0 = new URL(tabUrl);
      her = { url: u0.origin + u0.pathname, store: storeName(guessStoreFromUrl(tabUrl)) };
    } catch (e) {}
    try {
      const { prico_hosts: liste } = await chrome.storage.local.get("prico_hosts");
      if (liste && liste.hosts && Object.keys(liste.hosts).length) {
        const h = new URL(tabUrl).hostname.toLowerCase().replace(/^www\./, "");
        const deler = h.split(".");
        let kjent = false;
        for (let i = 0; i < deler.length - 1 && !kjent; i++) {
          const treff = liste.hosts[deler.slice(i).join(".")];
          if (treff) {
            kjent = true;
            if (her && treff.retailer) {
              her.store = storeName(treff.retailer);
              her.key = treff.retailer;       // for the logo
            }
          }
        }
        if (!kjent) {
          render([], null);
          return;
        }
      }
    } catch (e) {}

    // STREKKODEN FRA SIDA, I TILLEGG TIL URL-EN (21. sept. 2026).
    //
    // URL-en alene bommet på magasin: kunden sto på variant-URL-en
    // /mcl-le-boi-edp-200ml/S11759394.html, mens vi hadde lagret den
    // kanoniske /…/AWCM00.html. Ingen rad på URL-en -> tomt svar -> popup-en
    // sa ingenting, selv om fredrik_louisa hadde samme strekkode 1 000 kr
    // billigere. Med gtin/mpn fra sida (samme kilder som content.js bruker)
    // finner serveren varen uansett hvilken skrivemåte av URL-en kunden er
    // på. activeTab gir tilgang til fanen når popup-en er åpen.
    let sideId = null;
    let sidePris = null;
    let sideOffentlig = false;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const ok = (v) => v && String(v).trim().length > 4;
          const norm = (u) => { try { const x = new URL(u, location.href); return (x.hostname.replace(/^www\./i, "") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch (e) { return ""; } };
          const her = norm(location.href);
          const tall = (v) => { const m = String(v == null ? "" : v).match(/\d[\d\s.,]*/); if (!m) return null; let t = m[0].replace(/\s/g, ""); if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""); else if (t.includes(",")) t = t.length - t.lastIndexOf(",") <= 3 ? t.replace(",", ".") : t.replace(/,/g, ""); const n = parseFloat(t); return Number.isFinite(n) && n > 0 ? n : null; };
          // Business / ex-VAT offers are not the page's price (as in content.js:
          // erBedriftsTilbud). Elkjøp lists "Business Price (Excl. VAT)" 4 621,60
          // beside "Standard Price" 5 777; the lowest of the PUBLIC offers counts.
          const bedrift = (o) => { try { const t = o.eligibleCustomerType; const id = t && (typeof t === "string" ? t : t["@id"] || t.name || ""); if (id && /business/i.test(String(id))) return true; return /business|bedrift|excl\.?\s*vat|ex\.?\s*vat|eks(?:kl)?\.?\s*mva|uten\s*mva/i.test([o.name, o.description, o.category].filter(Boolean).join(" ")); } catch (e) { return false; } };
          // Same tiers as content.js (tilbudNivaa): an offer with a member tier
          // gives its regular incl.-VAT tier; a price the page declares public
          // (eligibleCustomerType schema.org/Public, no member tier) is "offentlig".
          const MEDLEM = /member|medlem|kundeklubb|klubbpris|club\s*price/i;
          const UTENMVA = /excl|ex\.?\s*vat|eks(?:kl)?\.?\s*mva|uten\s*mva/i;
          let offentlig = false;
          const nivaa = (o) => {
            if (MEDLEM.test(String(o.name || ""))) return null;
            const spes = [].concat(o.priceSpecification || []).filter((x) => x && typeof x === "object");
            const erMedlem = (q) => !!q.validForMemberTier || MEDLEM.test(String(q.name || ""));
            let best = null;
            if (o.validForMemberTier || spes.some(erMedlem)) {
              for (const q of spes) {
                if (erMedlem(q) || q.valueAddedTaxIncluded === false || UTENMVA.test(String(q.name || ""))) continue;
                if (/strikethrough|listprice/i.test(String(q.priceType || ""))) continue;
                const n = tall(q.price); if (n && (best === null || n < best)) best = n;
              }
              return best ? { pris: best, offentlig: false } : null;
            }
            for (const v of [o.price, o.lowPrice]) { const n = tall(v); if (n && (best === null || n < best)) best = n; }
            if (!best) return null;
            const t = o.eligibleCustomerType; const id = t && (typeof t === "string" ? t : t["@id"] || t.name || "");
            return { pris: best, offentlig: /public/i.test(String(id || "")) };
          };
          const lavestePris = (e) => { let best = null; let off = e && e.offers; for (const o of Array.isArray(off) ? off : [off]) { if (!o || bedrift(o)) continue; if (o.priceCurrency && String(o.priceCurrency).toUpperCase() !== "NOK") continue; const n = nivaa(o); if (n && (best === null || n.pris < best.pris)) best = n; } if (best) offentlig = best.offentlig; return best ? best.pris : null; };
          let id = null, pris = null;
          // BOOZT: valgt størrelse fra product.eansData (SPA – JSON-LD-en
          // beholder størrelsen sida ble lastet med). Samme som content.js.
          if (location.hostname.endsWith("boozt.com")) {
            try {
              // Ordinær pris for én vare – Deal (mdvPrice) krever kjøp for 699 kr. Se content.js.
              const bpris = (x) => parseFloat(x && x.actual_price);
              const s = [...document.scripts].find((x) => x.type === "application/json" && (x.textContent || "").includes('"eansData"'));
              const p = s && JSON.parse(s.textContent).product;
              const liste = p && p.eansData ? Object.values(p.eansData).filter((v) => v && v.ean) : [];
              // Adresselinjas «/<ean_id>» først (valgt farge + størrelse), så
              // valgt størrelsesknapp i fargen sida viser. Samme som content.js.
              const iUrl = location.pathname.match(/_\d{6,}\/(\d+)\/?$/);
              let v = iUrl && p && p.eansData && p.eansData[iUrl[1]] && p.eansData[iUrl[1]].ean ? p.eansData[iUrl[1]] : null;
              const farge = p && p.current ? (p.current.colourDetail || p.current.colorDetail) : null;
              const valgt = [...document.querySelectorAll('button[class*="--primary"]')].map((b) => b.textContent.trim().toLowerCase());
              if (!v) v = liste.find((x) => valgt.includes(String(x.size_detail || "").trim().toLowerCase()) && (!farge || (x.colourDetail || x.colorDetail) === farge));
              if (!v) { const synlig = [...document.querySelectorAll('[class*="price" i]')].map((e) => tall(e.textContent)).find((n) => n); if (synlig) v = liste.find((x) => Math.abs(bpris(x) - synlig) < 1); }
              if (!v) v = p && p.current && p.current.ean ? p.current : liste[0];
              if (v) { id = String(v.ean).trim(); const n = bpris(v); if (Number.isFinite(n) && n > 0) pris = n; }
            } catch (e) {}
          }
          // VITA: valgt nyanse sin strekkode i data-ls-gtin (se content.js).
          if (!id && location.hostname.endsWith("vita.no")) {
            const ls = document.querySelector("[data-ls-gtin]");
            const g = ls && String(ls.getAttribute("data-ls-gtin") || "").trim();
            if (g && /^\d{8,14}$/.test(g)) id = g;
          }
          // PARFYM: valgt <input name="variantId"> + JSON-LD-tilbudet med
          // «?v=<id>» i url-en (strekkode i mpn). Samme som content.js.
          if (!id) {
            try {
              const skjema = document.querySelector("form[data-prodid-selected]") || document;
              const r = skjema.querySelector('input[name="variantId"]:checked');
              if (r) {
                const vid = String(r.value || "").trim();
                const passer = new RegExp("[?&]v=" + vid + "(?:&|$)");
                const rp = tall(r.getAttribute("data-price"));
                if (rp) pris = rp;
                for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
                  let d; try { d = JSON.parse(sc.textContent); } catch (e) { continue; }
                  for (const it of Array.isArray(d) ? d : [d]) {
                    for (const e of (it && it["@graph"]) || [it]) {
                      if (!e || !e.offers) continue;
                      const liste = [];
                      for (const o of Array.isArray(e.offers) ? e.offers : [e.offers]) { if (o && Array.isArray(o.offers)) liste.push(...o.offers); else if (o) liste.push(o); }
                      const o = liste.find((x) => x && x.url && passer.test(x.url));
                      if (!o) continue;
                      const g = o.gtin13 || o.gtin || o.mpn;
                      if (g && /^\d{8,14}$/.test(String(g).trim())) id = String(g).trim();
                      const n = tall(o.price); if (n) pris = n;
                    }
                  }
                }
              }
            } catch (e) {}
          }
          // WOOCOMMERCE (fredrikoglouisa): valgt variant sin pris fra
          // data-product_variations; strekkoden fra F&L sitt skjulte
          // <p class="description-extra-info" data-vid="…">GTIN: …</p>.
          try {
            const form = document.querySelector("form.variations_form");
            const inp = form && form.querySelector('input[name="variation_id"]');
            const vid = inp && String(inp.value || "").trim();
            if (form && vid && vid !== "0") {
              const raa = form.getAttribute("data-product_variations");
              const v = raa && raa !== "false" ? (JSON.parse(raa) || []).find((x) => x && String(x.variation_id) === vid) : null;
              const n = v && v.display_price != null ? parseFloat(v.display_price) : null;
              if (Number.isFinite(n) && n > 0) pris = n;
              const ekstra = document.querySelector(`.description-extra-info[data-vid="${vid}"]`);
              const m = ekstra && (ekstra.textContent || "").match(/GTIN\s*:\s*(\d{8,14})/i);
              if (m) id = m[1];
            }
          } catch (e) {}
          // A LIST IS NOT A PRODUCT (1.10, 18 Nov 2026) - the same rule as
          // content.js (ldSidensProdukter): when the page's JSON-LD describes
          // several DIFFERENT products, the page's own is the one whose url
          // is this address; if none is, the page is a list and no barcode
          // is read from it (a search result gave the first console's).
          const ldSti = (x) => {
            const o = x && (Array.isArray(x.offers) ? x.offers[0] : x.offers);
            const u = x && (x.url || (o && o.url));
            if (typeof u !== "string" || !u) return null;
            try { return new URL(u, location.href).pathname.replace(/\/$/, ""); } catch (er) { return null; }
          };
          const ldHer = location.pathname.replace(/\/$/, "");
          let ldListe = false, ldBareDenne = false;
          try {
            const noder = [];
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
              let d;
              try { d = JSON.parse(s.textContent); } catch (e) { continue; }
              for (const item of Array.isArray(d) ? d : [d]) {
                for (const e of item && item["@graph"] ? item["@graph"] : [item]) {
                  const t = e && e["@type"];
                  if (t === "Product" || t === "ProductGroup" || (Array.isArray(t) && t.includes("Product"))) noder.push(e);
                }
              }
            }
            const rens = (v) => String(v == null ? "" : v).trim().toLowerCase();
            const grupper = [];
            for (const e of noder) {
              const m = new Set([e.gtin13, e.gtin, e.gtin14, e.gtin8, e.mpn, e.sku, e.productGroupID, e.name].map(rens).filter(Boolean));
              if (!m.size) continue;
              const treff = grupper.filter((g) => [...m].some((x) => g.has(x)));
              for (const g of treff) { for (const x of g) m.add(x); grupper.splice(grupper.indexOf(g), 1); }
              grupper.push(m);
            }
            if (grupper.length > 1) {
              ldBareDenne = noder.some((e) => ldSti(e) === ldHer);
              ldListe = !ldBareDenne;
            }
          } catch (e) {}
          const sokeside = (() => {
            try {
              if (/(?:^|\/)(?:search|searchresults?|sok|s%c3%b8k|søk|soek|sog|s%c3%b8g|søg|catalogsearch|finn|find)(?:\/|$)/i.test(location.pathname)) return true;
              for (const [navn, verdi] of new URLSearchParams(location.search)) {
                if (verdi && ["q", "query", "search", "sok", "søk", "searchterm", "search_query", "searchtext", "keyword", "keywords", "term"].includes(navn.trim().toLowerCase())) return true;
              }
            } catch (e) {}
            return false;
          })();
          if (sokeside) ldListe = true;
          for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
            let d;
            try { d = JSON.parse(s.textContent); } catch (e) { continue; }
            for (const item of Array.isArray(d) ? d : [d]) {
              for (const e of item && item["@graph"] ? item["@graph"] : [item]) {
                if (!e) continue;
                const t = e["@type"];
                const erProdukt = t === "Product" || t === "ProductGroup" || (Array.isArray(t) && t.includes("Product"));
                if (!erProdukt) continue;
                if (ldListe) continue;                              // a list: no product is "this page"
                if (ldBareDenne && ldSti(e) !== ldHer) continue;    // another product shown on the page
                // Variant med sidas URL først (Bangerhead: 75 ml og 125 ml
                // som hasVariant med hver sin strekkode og URL).
                const varianter = Array.isArray(e.hasVariant) ? e.hasVariant : [];
                // The selected variant, as content.js finds it (velgVariant,
                // 16 Nov 2026): the address with its query when exactly one
                // variant has it (zooplus ?activeVariant=), the only one on
                // this path, the option the page marks as selected (petxl:
                // data-active on the size button), else the first on the path.
                const full = (u) => { try { const x = new URL(u, location.href); return (x.hostname.replace(/^www\./i, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase(); } catch (er) { return ""; } };
                const adr = (x) => { if (!x) return ""; if (x.url) return x.url; const o = Array.isArray(x.offers) ? x.offers[0] : x.offers; return (o && o.url) || ""; };
                const medUrl = varianter.filter((x) => adr(x));
                const eksakt = medUrl.filter((x) => full(adr(x)) === full(location.href));
                const paaSti = medUrl.filter((x) => norm(adr(x)) === her);
                let v = eksakt.length === 1 ? eksakt[0] : null;
                if (!v) {            // the article number in the query (?p=<sku>, ?activeVariant=<sku>)
                  try {
                    const verdier = new Set([...new URL(location.href).searchParams.values()].map((s) => String(s).trim().toLowerCase()).filter(Boolean));
                    const paaNr = verdier.size ? varianter.filter((x) => x && x.sku && verdier.has(String(x.sku).trim().toLowerCase())) : [];
                    if (paaNr.length === 1) v = paaNr[0];
                  } catch (er) {}
                }
                if (!v && paaSti.length === 1) v = paaSti[0];
                if (!v && varianter.length > 1) {
                  const rens = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
                  const gnavn = rens(e.name);
                  const etiketter = varianter.map((x) => { const st = rens(x && x.size); if (st) return st; const n = rens(x && x.name); return gnavn && n.startsWith(gnavn) ? n.slice(gnavn.length).trim() : ""; });
                  if (etiketter.filter(Boolean).length > 1) {
                    let funnet = null, uenig = false;
                    for (const el of document.querySelectorAll('[data-active="true"], [aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], input[type="radio"]:checked, option:checked')) {
                      let kilde_ = el;
                      if (el.tagName === "INPUT") kilde_ = (el.labels && el.labels[0]) || el.closest("label") || el.parentElement || el;
                      const tekst = rens(kilde_.textContent);
                      if (!tekst || tekst.length > 80) continue;
                      let best = -1;
                      etiketter.forEach((l, i) => { if (l && tekst.startsWith(l) && (best < 0 || l.length > etiketter[best].length)) best = i; });
                      if (best < 0) continue;
                      if (funnet !== null && funnet !== best) uenig = true;
                      funnet = best;
                    }
                    if (funnet !== null && !uenig) v = varianter[funnet];
                  }
                }
                if (!v && paaSti.length > 1) v = paaSti[0];
                const kilde = v || e;
                const kid = kilde.gtin13 || kilde.gtin || kilde.gtin14 || kilde.gtin8 || kilde.mpn;
                if (!id && ok(kid)) id = String(kid).trim();
                if (pris === null) pris = lavestePris(kilde);
              }
            }
          }
          if (!id && !ldListe) {
            // One barcode on the page, or none - same rule as content.js
            // (25 Oct 2026): a lazy-loaded carousel on elektroimportoren.no
            // adds sixteen gtin13 metas, and the first one is not the
            // product the customer is on. Several distinct values = a
            // listing, so the fallback says nothing.
            for (const p of ["gtin13", "gtin", "gtin14", "gtin8", "mpn"]) {
              const verdier = new Set();
              for (const m of document.querySelectorAll(`meta[itemprop="${p}"]`)) {
                if (ok(m.content)) verdier.add(m.content.trim());
              }
              if (verdier.size === 1) { id = [...verdier][0]; break; }
              if (verdier.size > 1) break;
            }
          }
          // The page's own state says club price (Elkjøp's initialPriceProbe):
          // then the price is not public whatever the offer says.
          if (offentlig) {
            try {
              for (const sc of document.scripts) {
                const t = sc.textContent;
                if (t && t.includes("initialPriceProbe") && /initialPriceProbe\\?":\{[^{}]{0,300}?isClubPrice\\?":\s*true/.test(t)) { offentlig = false; break; }
              }
            } catch (e) {}
          }
          return { id, pris, offentlig };
        },
      });
      if (res && res.result && typeof res.result === "object") {
        if (typeof res.result.id === "string") sideId = res.result.id;
        if (typeof res.result.pris === "number") sidePris = res.result.pris;
        sideOffentlig = res.result.offentlig === true;
      }
    } catch (e) {
      // chrome://-sider, PDF-er, sider uten tilgang – da holder URL-en.
    }

    // Tegn lagret svar med én gang HVIS det gjelder nøyaktig denne sida, så
    // popup-en ikke blinker tom mens nettverket jobber. Sjekken på hele
    // URL-en må stå: uten den viste popup-en forrige produkts tilbud.
    if (naaUrl && latestUrl === naaUrl && Array.isArray(latestPrices) && latestPrices.length) {
      render(filtrer(latestPrices, showOutlet, showOe, medlem), null, { skjulteOutlet: !showOutlet, medlem, her, sidePris, sideOffentlig });
    }

    // Fasiten kommer fra serveren. Vi sender origin + pathname, altså UTEN
    // spørrestreng og fragment – de kan inneholde søkeord, sesjons-id-er og
    // annet som ikke angår oss, og /prices stripper dem uansett.
    let liste = [];
    try {
      const u = new URL(tabUrl);
      // The page price (sidePris) is read but NOT sent any more (2 Oct 2026):
      // the server stopped trusting it after two bad reads in two days
      // (ex-VAT prices from a review widget and from a business offer)
      // poisoned rows for everyone. URL + id is what the lookup needs.
      const r = await fetch(
        "https://api.prico.no/prices?url=" +
          encodeURIComponent(u.origin + u.pathname) +
          (sideId ? "&q=" + encodeURIComponent(sideId) : ""),
      );
      if (!r.ok) {
        // 429 / 5xx used to fall through as "no alternatives found".
        const feil = new Error(`HTTP ${r.status}`);
        feil.status = r.status;
        throw feil;
      }
      const d = await r.json();
      liste = Array.isArray(d) ? d : (d && (d.offers || d.prices)) || [];
    } catch (e) {
      render([], e);
      return;
    }

    await chrome.storage.local.set({ latestPrices: liste, latestUrl: naaUrl });

    render(filtrer(liste, showOutlet, showOe, medlem), null, { skjulteOutlet: !showOutlet, medlem, her, sidePris, sideOffentlig });
  } catch (e) {
    render([], e);
  }
}

// Tannhjulet åpner innstillingene, butikk-knappen åpner butikklista. Ett
// panel om gangen; lista med tilbud er skjult mens et panel er åpent og
// tegnes på nytt når det lukkes (i tilfelle et valg ble endret). Panelene
// er lukket hver gang popup-en åpnes – valgene ligger i chrome.storage.
document.addEventListener("DOMContentLoaded", () => {
  const liste = document.getElementById("product-list");
  const paneler = [
    { knapp: document.getElementById("settings-btn"), panel: document.getElementById("settings-panel") },
    { knapp: document.getElementById("stores-btn"), panel: document.getElementById("stores-panel") },
  ].filter((p) => p.knapp && p.panel);

  const lukkAlle = () => {
    for (const p of paneler) {
      p.panel.setAttribute("hidden", "");
      p.knapp.setAttribute("aria-expanded", "false");
    }
  };

  for (const p of paneler) {
    p.knapp.addEventListener("click", () => {
      const varAapen = !p.panel.hasAttribute("hidden");
      // one cross-fade from the list to the panel and back (medOvergang)
      medOvergang(() => {
        lukkAlle();
        if (!varAapen) {
          p.panel.removeAttribute("hidden");
          p.knapp.setAttribute("aria-expanded", "true");
        }
        if (liste) liste.hidden = !varAapen;
      });
      if (varAapen) loadAndRender();
    });
  }

  // Butikklista: alle butikkene i STORE_NAMES, alfabetisk, med antall.
  const grid = document.getElementById("stores-grid");
  const heading = document.getElementById("stores-heading");
  if (grid) {
    const navn = Object.values(STORE_NAMES).sort((a, b) => a.localeCompare(b, "nb"));
    if (heading) heading.textContent = `Vi følger ${navn.length} butikker`;
    for (const n of navn) {
      const el = document.createElement("span");
      el.textContent = n;
      grid.appendChild(el);
    }
  }
});

// LIGHT OR DARK (1.8, 16 Nov 2026). tema.js has already set data-tema on
// <html> from the stored choice (light when none is made). The button flips
// it, remembers it for the next time the window opens (localStorage, read
// synchronously before the first paint) and tells the toast on the page
// (chrome.storage.local.prico_tema, read by content.js).
document.addEventListener("DOMContentLoaded", () => {
  const knapp = document.getElementById("theme-btn");
  if (!knapp) return;
  const rot = document.documentElement;
  const merk = () => {
    const mork = rot.getAttribute("data-tema") === "mork";
    knapp.setAttribute("aria-pressed", mork ? "true" : "false");
    knapp.title = mork ? "Bytt til lyst utseende" : "Bytt til mørkt utseende";
  };
  merk();
  try {
    const valgt = localStorage.getItem("prico_tema");
    if (valgt === "mork" || valgt === "lys") chrome.storage.local.set({ prico_tema: valgt }).catch(() => {});
  } catch (e) {}
  // THE SWITCH IS ANIMATED (16 Nov 2026). A plain attribute flip repainted
  // the whole window in one frame, which read as a flash. Now the whole
  // window fades evenly from one theme to the other (View Transitions: the
  // browser cross-fades a picture of the old window with the new one), and
  // the sun/moon swaps with the same overshoot curve as the toast's
  // entrance. The first version grew the new theme out of the button as a
  // circle; the owner found it uneven ("a circle in a square"), so it is a
  // plain cross-fade. Without the API, every colour fades instead; with
  // "reduce motion" set in the system, it just switches.
  const sett = (ny) => {
    rot.setAttribute("data-tema", ny);
    merk();
  };
  knapp.addEventListener("click", () => {
    const ny = rot.getAttribute("data-tema") === "mork" ? "lys" : "mork";
    try { localStorage.setItem("prico_tema", ny); } catch (e) {}
    try { chrome.storage.local.set({ prico_tema: ny }).catch(() => {}); } catch (e) {}
    const rolig = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (rolig) {
      sett(ny);
    } else if (typeof document.startViewTransition === "function") {
      try {
        const overgang = document.startViewTransition(() => sett(ny));   // timing: main.css
        // An aborted transition (the window was resized under it) rejects
        // these; the theme is set either way, so nothing is to be done.
        for (const lofte of [overgang.ready, overgang.finished, overgang.updateCallbackDone]) {
          if (lofte && typeof lofte.catch === "function") lofte.catch(() => {});
        }
      } catch (e) {
        sett(ny);
      }
    } else {
      rot.classList.add("tema-bytter");
      sett(ny);
      setTimeout(() => rot.classList.remove("tema-bytter"), 340);
    }
  });
});

// MORE BELOW (16 Nov 2026). Chrome caps the window at 600 px and the list
// scrolls. With seven shops the sixth sat cut in half at the bottom edge and
// nothing said there was a seventh. While there is more below, the bottom of
// the window fades out (html.mer-under, see main.css); at the end of the
// list the fade is gone.
(function () {
  const rot = document.documentElement;
  const sjekk = () => {
    const igjen = rot.scrollHeight - (rot.scrollTop + rot.clientHeight);
    rot.classList.toggle("mer-under", igjen > 12);
  };
  window.addEventListener("scroll", sjekk, { passive: true });
  window.addEventListener("resize", sjekk);
  document.addEventListener("DOMContentLoaded", () => {
    sjekk();
    new MutationObserver(sjekk).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"],
    });
    if (window.ResizeObserver) new ResizeObserver(sjekk).observe(document.body);
  });
})();

// Outlet-bryteren: husk valget, vis Av/På, og tegn lista på nytt med én gang.
document.addEventListener("DOMContentLoaded", async () => {
  const boks = document.getElementById("show-outlet");
  const tilstand = document.getElementById("outlet-state");
  if (!boks) return;
  const visTilstand = () => {
    if (!tilstand) return;
    tilstand.textContent = boks.checked ? "På" : "Av";
    tilstand.classList.toggle("on", boks.checked);
  };
  boks.checked = await visOutlet();
  visTilstand();
  boks.addEventListener("change", async () => {
    await chrome.storage.local.set({ [STORAGE_OUTLET]: boks.checked });
    visTilstand();
    loadAndRender();
  });
});

// OE-bryteren: samme mønster som outlet. Leses også av background.js, som
// ikke varsler om et OE-treff når bryteren er av.
document.addEventListener("DOMContentLoaded", async () => {
  const boks = document.getElementById("show-oe");
  const tilstand = document.getElementById("oe-state");
  if (!boks) return;
  const visTilstand = () => {
    if (!tilstand) return;
    tilstand.textContent = boks.checked ? "På" : "Av";
    tilstand.classList.toggle("on", boks.checked);
  };
  boks.checked = await visOe();
  visTilstand();
  boks.addEventListener("change", async () => {
    await chrome.storage.local.set({ [STORAGE_OE]: boks.checked });
    visTilstand();
  });
});

// Medlemsbryteren: samme mønster som outlet. Leses også av background.js,
// som da sammenligner med medlemsprisene når det avgjør varselet.
document.addEventListener("DOMContentLoaded", async () => {
  const boks = document.getElementById("show-medlem");
  const tilstand = document.getElementById("medlem-state");
  if (!boks) return;
  const visTilstand = () => {
    if (!tilstand) return;
    tilstand.textContent = boks.checked ? "På" : "Av";
    tilstand.classList.toggle("on", boks.checked);
  };
  boks.checked = await visMedlem();
  visTilstand();
  boks.addEventListener("change", async () => {
    await chrome.storage.local.set({ [STORAGE_MEDLEM]: boks.checked });
    visTilstand();
    loadAndRender();
  });
});

// Terskelen for varselet: vis lagret verdi, lagre ved endring. Verdien
// leses av background.js neste gang en produktside åpnes – lista i
// popup-en påvirkes ikke, den viser alltid alle alternativene.
document.addEventListener("DOMContentLoaded", async () => {
  const felt = document.getElementById("min-rabatt");
  if (!felt) return;
  const { [STORAGE_MIN_RABATT]: lagret } = await chrome.storage.local.get(STORAGE_MIN_RABATT);
  felt.value = normaliserRabatt(lagret ?? MIN_RABATT_STANDARD);
  const lagre = async () => {
    const v = normaliserRabatt(felt.value);
    felt.value = v;
    await chrome.storage.local.set({ [STORAGE_MIN_RABATT]: v });
  };
  felt.addEventListener("change", lagre);
  felt.addEventListener("blur", lagre);
});

// ✅ Update live when background finishes fetching
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PRICES_READY") {
    loadAndRender();
  }
});

document.addEventListener("DOMContentLoaded", loadAndRender);
