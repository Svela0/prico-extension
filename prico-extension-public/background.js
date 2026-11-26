// web_script/background.js
// api.prico.no since 27 Oct 2026 (the rename). From 1.6 this is the only
// host the extension talks to; the old host is not in the manifest any more.
const DEFAULT_API = "https://api.prico.no";

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
  // Added 24 Oct 2026 (extension 1.5).
  autodoc: "Autodoc",
  bakerenogkokken: "Bakeren og Kokken",
  careofcarl: "Care of Carl",
  zalando: "Zalando",
  deal: "Deal",
  illums: "Illums Bolighus",
  kitchentime: "Kitchentime",
  kitchn: "Kitch'n",
  nordicnest: "Nordic Nest",
  royaldesign: "Royal Design",
  barnashus: "Barnas Hus",
  verktoy: "Verktøy.no",
  outland: "Outland",
  obs: "Obs",
  sport1: "Sport 1",
  tilbords: "Tilbords",
  // Toy shops, added 25 Oct 2026.
  extraleker: "Extra Leker",
  lekekassen: "Lekekassen",
  lekia: "Lekia",
  ringo: "Ringo",
  sprell: "Sprell",
  apotera: "Apotera",
  // Building and tool shops, added 27 Oct 2026.
  byggern: "Bygger'n",
  maxbo: "Maxbo",
  obsbygg: "Obs Bygg",
  staypro: "Staypro",
  // Added 28 Oct 2026.
  avxperten: "avXperten",
  nordicfeel: "NordicFeel",
  // Camera, gadgets, pet and sport shops, added 28 Oct 2026.
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

// STORE LIST FROM THE SERVER, ONCE A DAY (24 Oct 2026).
//
// The content script is injected on every .no site (see manifest) but must
// only act on OUR stores. Which domains those are is decided by the server:
// GET /hosts gives {host -> {retailer, navn}}, derived from the product
// links in the database, so a new store is on the list as soon as it has
// rows - no extension release, no permission prompt. The list is cached in
// chrome.storage for 24 h; on a host that is not on it the content script
// exits before reading anything, so nothing leaves the browser on sites
// we do not scrape. The names in the list override STORE_NAMES above,
// which stays as the offline fallback.
const HOSTS_KEY = "prico_hosts";
const HOSTS_TTL_MS = 24 * 60 * 60 * 1000;
let hostsCache = null;          // {hosts, navn, hentet} - in memory for this worker

async function hentHosts(force = false) {
  if (!hostsCache) {
    const { [HOSTS_KEY]: lagret } = await chrome.storage.local.get(HOSTS_KEY);
    if (lagret && lagret.hosts) hostsCache = lagret;
  }
  const fersk = hostsCache && Date.now() - (hostsCache.hentet || 0) < HOSTS_TTL_MS;
  if (fersk && !force) return hostsCache;
  try {
    const res = await fetch(new URL("/hosts", DEFAULT_API).toString());
    const data = await res.json();
    if (data && data.hosts && Object.keys(data.hosts).length > 10) {
      hostsCache = { hosts: data.hosts, navn: data.navn || {}, hentet: Date.now() };
      await chrome.storage.local.set({ [HOSTS_KEY]: hostsCache });
    }
  } catch (e) {
    // Offline or the API is down: keep whatever we had, even if old.
  }
  if (!hostsCache) {
    // Nothing cached and the API unreachable (first minute after install
    // on a bad network): the list bundled with this build keeps the
    // extension working on the stores known at release time.
    try {
      const res = await fetch(chrome.runtime.getURL("hosts_fallback.json"));
      const data = await res.json();
      hostsCache = { hosts: data.hosts || {}, navn: data.navn || {}, hentet: 0 };
    } catch (e) {}
  }
  return hostsCache;
}

// "shop.example.no" matches an entry for "example.no" as well as for itself.
function finnButikk(hostname, hosts) {
  const h = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const deler = h.split(".");
  for (let i = 0; i < deler.length - 1; i++) {
    const kandidat = deler.slice(i).join(".");
    if (hosts[kandidat]) return hosts[kandidat];
  }
  return null;
}

chrome.runtime.onStartup.addListener(() => { hentHosts(); });
chrome.alarms.create("prico-hosts", { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "prico-hosts") hentHosts(true);
});

function storeName(retailer) {
  const key = String(retailer || "").trim().toLowerCase();
  if (hostsCache && hostsCache.navn && hostsCache.navn[key]) return hostsCache.navn[key];
  if (STORE_NAMES[key]) return STORE_NAMES[key];
  const s = key.replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "ukjent";
}

// Førstegangsopplevelse: vis brukeren varselet i aksjon rett etter installasjon.
// Brukere som ser magien de første 30 sekundene beholder utvidelsen.
chrome.runtime.onInstalled.addListener((details) => {
  // 1.6 renamed the storage keys and the alarm (the old name is gone from
  // the code): drop what a 1.5 install left behind, so the store list is
  // fetched fresh under the new key and the old alarm stops firing.
  chrome.storage.local.remove(["salehawk_hosts", "salehawk_demp"]).catch(() => {});
  chrome.alarms.clear("salehawk-hosts").catch(() => {});
  hentHosts(true);
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Is this page on one of our stores? Answered from the cached list.
  if (msg?.type === "ER_BUTIKK") {
    hentHosts().then((c) => {
      const b = c && c.hosts ? finnButikk(msg.host, c.hosts) : null;
      sendResponse({ ok: !!b, retailer: b ? b.retailer : null });
    }, () => sendResponse({ ok: false, retailer: null }));
    return true;
  }
  // URL alone is enough: the server looks the page up by it (6 Oct 2026).
  if (msg?.type === "FETCH_PRICES" && (msg.product || msg.url)) {
    const tabId = sender.tab ? sender.tab.id : null;

    fetchPrices(msg.product, msg.host, msg.currentPrice, tabId, msg.url).then(
      (ok) => sendResponse(ok),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) }),
    );
    return true;
  }
});

async function fetchPrices(productTitle, host, currentPrice, tabId, pageUrl) {
  try {
    const url = new URL("/prices", DEFAULT_API);
    url.searchParams.set("q", productTitle || "");
    if (pageUrl) url.searchParams.set("url", pageUrl);
    // The page price is no longer sent (2 Oct 2026): reading it on the page
    // was wrong too often and the server wrote the bad number into our row.
    // The server answers with its own price for this page (anker_pris on
    // every offer), and that is what the alert compares against.

    const res = await fetch(url.toString());
    let data = await res.json();
    if (data && !Array.isArray(data) && Array.isArray(data.offers)) data = data.offers;
    // Reference price for the alert: the server's row for the page we are
    // on. Falls back to the page price only if an older content.js still
    // sends one (it no longer does).
    const refPris = (Array.isArray(data) && data.length && data[0].anker_pris) || currentPrice || null;
    // Our row for this page, before the list is filtered: for the price
    // report at the end (meldPrisavvik).
    const ankerPris = Number(Array.isArray(data) && data.length && data[0].anker_pris) || 0;
    const ankerMedlem = Number(Array.isArray(data) && data.length && data[0].anker_medlemspris) || 0;

    if (Array.isArray(data) && host) {
      // Butikken du står i er ikke et alternativ – unntatt dens egne
      // OUTLET-eksemplarer av samme vare (Elkjøp: én side per eksemplar,
      // egen pris og tilstand). Serveren slipper dem gjennom merket
      // is_outlet; her beholder vi dem så popup-lista kan vise dem når
      // outlet-bryteren er på.
      data = data.filter(
        (item) =>
          item &&
          item.retailer &&
          (item.is_outlet ||
            !host.toLowerCase().includes(String(item.retailer).toLowerCase())),
      );
    }

    if (data && data.length > 0 && tabId) {
      // Brukt/B-vare/outlet skal ikke utløse «billigere hos X»: da
      // sammenligner vi en brukt vare mot en ny, og kunden klikker seg til noe
      // annet enn hun tror. Onboarding-sida filtrerte allerede slik; her gjorde
      // vi det ikke, så toasten kunne trigge på en outlet-pris.
      // Listen i popup-en beholder alt (med Outlet-merket) – det er bare
      // BESLUTNINGEN om å vise varselet som krever lik vare i lik stand.
      const erBrukt = (o) =>
        o.is_b_grade ||
        o.is_outlet ||
        /(^|[/\-_\s(\[])(outlet|b-?vare|brukt|used|refurb|open-?box|demo)([/\-_\s.)\]]|$)/i.test(
          o.link || "",
        );

      // OE-treff (tilsvarende bildel, kan være annet merke) varsles bare når
      // brukeren har bryteren «Vis OE-match» på – som er standard.
      const { showOe } = await chrome.storage.local.get("showOe");
      let nye = data.filter((o) => !erBrukt(o) && (showOe !== false || o.match !== "oe"));
      // MEDLEMSPRIS (20 Oct 2026). With the "Jeg er medlem i kundeklubbene"
      // switch on, both sides are the lower of public and member price: the
      // page's (anker_medlemspris) and each offer's (member_price). The
      // server sorts on the public price, so re-sort here. Off (default):
      // exactly as before, the prices everyone pays.
      const { medlem } = await chrome.storage.local.get("medlem");
      const eff = (o) => {
        const p = Number(o.price) || 0, m = Number(o.member_price) || 0;
        return medlem === true && m > 0 && (p <= 0 || m < p) ? m : p;
      };
      let ref = refPris;
      if (medlem === true) {
        nye = [...nye].sort((a, b) => (eff(a) <= 0) - (eff(b) <= 0) || eff(a) - eff(b));
        const am = Number(data[0] && data[0].anker_medlemspris) || 0;
        if (am > 0 && (!ref || am < ref)) ref = am;
      }
      const cheapest = nye[0];

      // TERSKEL FOR VARSELET: PROSENT, IKKE KRONER.
      //
      // Her sto «cheapest.price < currentPrice - 5», altså et fast kronebeløp.
      // Det slår helt ulikt ut i hver ende av sortimentet:
      //   Jordan tanntråd   49,90 -> 48    = 1,90 kr  (3,8 prosent)  ingen varsel
      //   TV                11 990 -> 11 985 = 5 kr   (0,04 prosent) VARSEL
      // Vi tiet altså om en reell besparelse på tanntråden, og ropte om fem
      // kroner på en TV. Det er stikk motsatt av hva som er nyttig.
      //
      // Nå kreves en ANDEL av prisen kunden ser på, med et lite gulv i kroner
      // så øre-forskjeller aldri utløser noe:
      //   49,90  -> krever 1,00 kr   (1,90 holder -> varsel)
      //   500    -> krever 10 kr
      //   11 990 -> krever 240 kr
      //
      // Skru på MIN_ANDEL hvis varselet blir for masete. Terskelen gjelder
      // BARE varselet – popup-lista viser alle alternativer uansett.
      // Brukeren setter prosenten selv i popup-en («Varsle ved minst N %
      // lavere pris», lagret som minRabatt). 2 % er standarden, som før.
      const { minRabatt } = await chrome.storage.local.get("minRabatt");
      const MIN_ANDEL = lesMinRabatt(minRabatt) / 100;
      const MIN_KRONER = 1;              // absolutt gulv, mot øre-støy
      const kravd = Math.max(MIN_KRONER, (ref || 0) * MIN_ANDEL);

      // A page the user opened from our own list or toast is muted for
      // seven minutes (prico_demp, written by connector.js/content.js):
      // they chose to shop there, and the alert would only nag.
      let dempet = false;
      try {
        const { prico_demp: liste } = await chrome.storage.local.get("prico_demp");
        if (Array.isArray(liste) && liste.length && pageUrl) {
          const u = new URL(pageUrl);
          const h = u.hostname.replace(/^www\./i, "").toLowerCase();
          const n = h + u.pathname.replace(/\/$/, "").toLowerCase();
          const naa = Date.now();
          // The exact page (seven minutes), or the shop's host for ONE page
          // load after the click: the landing page often differs from the
          // link through redirects and URL rewrites, so the first page on
          // that host is the one the user chose and stays quiet - and the
          // host mute is spent there, so the next product on the same shop
          // gets the alert as usual (28 Oct 2026).
          let brukt = false;
          for (const d of liste) {
            if (!d) continue;
            if (d.n === n && d.til > naa) dempet = true;
            else if (d.h && d.h === h && (d.vertTil || 0) > naa) {
              dempet = true;
              d.vertTil = 0;
              brukt = true;
            }
          }
          if (brukt) chrome.storage.local.set({ prico_demp: liste }).catch(() => {});
        }
      } catch (e) {}

      if (cheapest && ref && !dempet && eff(cheapest) <= ref - kravd) {
        chrome.tabs.sendMessage(tabId, {
          type: "CHEAPER_FOUND",
          store: storeName(cheapest.retailer),
          retailer: cheapest.retailer,    // the key, for the shop's logo in the toast (1.8)
          // The page this answer is for (1.10): content.js drops it when the
          // tab has moved to another page in the meantime.
          side: pageUrl || "",
          price: eff(cheapest),
          link: cheapest.link || cheapest.url,
          is_outlet: cheapest.is_outlet,
          match: cheapest.match,          // «oe» = funnet via OE-nummer (bildeler), «el» = via EL-nummer (elektro)
          medlemspris: eff(cheapest) !== (Number(cheapest.price) || 0),  // the price shown is a member price
          // The price this offer was compared against: the page the
          // customer is on (12 Nov 2026). The toast shows it struck through
          // and the difference as "Spar N,-".
          her: ref,
          // For the page-price check in content.js (16 Nov 2026): the
          // threshold as it was applied here, and the page's member price
          // with the state of the member switch, so a member price printed
          // in the page's data is not mistaken for a price drop.
          andel: MIN_ANDEL,
          gulv: MIN_KRONER,
          medlem_her: Number(data[0] && data[0].anker_medlemspris) || 0,
          medlem_paa: medlem === true,
        });
      }
    }

    // Lagre HVILKEN SIDE resultatene gjelder – hele URL-en, ikke bare verten.
    //
    // Vi lagret før bare `latestHost`. Da holdt det at du var på SAMME BUTIKK
    // for at gamle treff skulle vises: sto du på kjell.com og åpnet popup-en,
    // fikk du svaret fra forrige kjell-produkt du hadde besøkt. Etter at
    // serveren var fikset viste popup-en fortsatt «teknikmagasinet 59 kr» for
    // AirPods Pro 3, fordi lista lå igjen fra før fiksen – og verten stemte.
    await chrome.storage.local.set({
      latestPrices: data,
      latestHost: host || null,
      latestUrl: normaliserUrl(pageUrl),
      latestAt: Date.now(),
    });
    chrome.runtime.sendMessage({ type: "PRICES_READY" }).catch(() => {});
    // Last, and not awaited: tell the server when the page's price is not
    // the one it has for this page.
    meldPrisavvik(tabId, pageUrl, ankerPris, ankerMedlem);
    return { ok: true };
  } catch (err) {
    // warn, not error: a blocked or offline network is not a bug in the
    // extension, and console.error filled chrome://extensions > Errors.
    console.warn("Fetch error:", err);
    // Feilet henting skal ikke etterlate FORRIGE sides svar i popup-en. Bedre
    // å vise ingenting enn feil butikk til feil pris.
    await chrome.storage.local.set({
      latestPrices: [],
      latestHost: host || null,
      latestUrl: normaliserUrl(pageUrl),
      latestAt: Date.now(),
    });
    chrome.runtime.sendMessage({ type: "PRICES_READY" }).catch(() => {});
    return { ok: false, error: String(err) };
  }
}

// Terskel for varselet i prosent, samme grenser som connector.js: 0–90,
// standard 2. Alt annet (tomt, tekst, NaN) blir standarden.
// PRICE REPORT: "YOUR ROW FOR THIS PAGE LOOKS WRONG" (1.8, 16 Nov 2026).
//
// Our prices are from the last sweep, up to a day old. The page the
// customer is on shows today's price, and content.js can read it from the
// shop's structured data in about a millisecond (sideprisNaa). When that
// price differs from the server's row for the page, the address and the
// price are sent to /price_report, and the server puts the product in a
// queue for its own scraper to read again. The server never stores the
// reported price as a price - a report is a hint (see price_report in
// web/app.py).
//
//   * After everything else: the toast is decided and drawn, the popup's
//     data is stored, then this runs, and nothing waits for it.
//   * Both directions: a page that is cheaper than our row (we miss it as
//     an offer on other shops' pages) and one that is dearer (we promise a
//     price that is gone).
//   * Not the page's member price (unless the page declares it public),
//     not a number under a third or over three times ours.
//   * Once per address per hour from this browser; the server keeps one
//     row per product whatever the number of reports.
//   * What is sent: the page's address (already sent with the lookup), the
//     price on the page and the price we had. Nothing about the user.
const MELDT = new Map();              // normalised address -> time of the last report
const MELD_PAUSE_MS = 60 * 60 * 1000;

function meldPrisavvik(tabId, pageUrl, vaar, medlem) {
  try {
    if (!tabId || !pageUrl || !(vaar > 0)) return;
    const nokkel = normaliserUrl(pageUrl);
    if (!nokkel || Date.now() - (MELDT.get(nokkel) || 0) < MELD_PAUSE_MS) return;
    chrome.tabs.sendMessage(tabId, { type: "PRICO_SIDEPRIS", medlem_her: medlem }).then(
      (svar) => {
        const side = Number(svar && svar.pris) || 0;
        if (!(side > 0)) return;
        if (Math.abs(side - vaar) <= vaar * 0.005) return;       // the row is right
        if (side < vaar / 3 || side > vaar * 3) return;          // another product, or a bad read
        const offentlig = !!(svar && svar.offentlig === true);
        if (medlem > 0 && !offentlig && Math.abs(side - medlem) <= medlem * 0.01) return;   // the club price
        if (MELDT.size > 500) MELDT.clear();
        MELDT.set(nokkel, Date.now());
        const u = new URL("/price_report", DEFAULT_API);
        u.searchParams.set("url", pageUrl);
        u.searchParams.set("pris", String(side));
        u.searchParams.set("var", String(vaar));
        if (offentlig) u.searchParams.set("off", "1");
        fetch(u.toString(), { keepalive: true }).catch(() => {});
      },
      () => {},                        // no content script in the tab (popup-only site)
    );
  } catch (e) {}
}

function lesMinRabatt(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 2;
  return Math.min(90, Math.max(0, n));
}

// Samme normalisering som serveren bruker (_norm_link i extension_search):
// uten protokoll, www, spørrestreng, anker og avsluttende skråstrek. Da kan
// popup-en sammenligne fanen sin URL med den vi hentet for, tegn for tegn.
function normaliserUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    const vert = url.hostname.replace(/^www\./i, "").toLowerCase();
    const sti = url.pathname.replace(/\/$/, "").toLowerCase();
    return vert + sti;
  } catch (e) {
    return null;
  }
}
