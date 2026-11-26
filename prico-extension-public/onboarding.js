// onboarding.js – finner et EKTE produkt som er billigere i en annen butikk,
// og lenker brukeren til den DYRESTE butikkens produktside — der vil
// Prico-varselet garantert dukke opp. Første inntrykk = magi.
const API = "https://api.prico.no";

// Populære produkter som finnes i flere butikker (GTIN-matchet i databasen).
const CANDIDATES = [
  "airpods pro",
  "playstation 5",
  "iphone 15",
  "galaxy s24",
  "sonos era",
  "lego technic",
];

// Outlet/åpen eske teller ikke: netonnet flagger B-vare i lenken uten at
// is_outlet er satt i databasen.
const isUsed = (o) => o.is_outlet || /b-vare|outlet|open-box/i.test(o.link || "");

// To tilbud er samme produkt hvis ≥65 % av ordene matcher BEGGE veier.
// Tall beholdes ("AirPods 4" vs "AirPods Pro 3" skal avvises; "Pro 2" vs
// "Pro 2 MagSafe" skal godtas).
function sameProduct(a, b) {
  const tok = (s) =>
    new Set(String(s || "").toLowerCase().split(/[^a-z0-9æøå]+/)
      .filter((w) => w.length > 1 || /\d/.test(w)));
  const ta = tok(a), tb = tok(b);
  if (!ta.size || !tb.size) return false;
  const hits = [...ta].filter((w) => tb.has(w)).length;
  return hits / ta.size >= 0.65 && hits / tb.size >= 0.65;
}

// Beste par: billigste tilbud som har et DYRERE tilbud på samme produkt.
function pickPair(offers) {
  const byPrice = [...offers]
    .filter((o) => o && o.link && o.price > 0)
    .sort((a, b) => a.price - b.price);
  for (const cheap of byPrice) {
    if (isUsed(cheap)) continue;
    const pricey = [...byPrice].reverse().find(
      (o) => o !== cheap && !isUsed(o) && o.price > cheap.price + 10 &&
             sameProduct(o.name, cheap.name),
    );
    if (pricey) return { cheapest: cheap, priciest: pricey };
  }
  return null;
}

async function findDemo() {
  // Serveren først: /demo slår opp et EKTE par i basen (samme strekkode,
  // to butikker, reell prisforskjell). Søkeordlista under er reserve, og
  // den gjettet feil i praksis – kandidatene var elektronikk, som er der
  // matchingen vår er svakest.
  try {
    const r = await fetch(`${API}/demo`);
    if (r.ok) {
      const d = await r.json();
      if (d && d.cheapest && d.priciest && d.priciest.link) return d;
    }
  } catch (e) {
    /* faller ned på søkeordene */
  }

  for (const q of CANDIDATES) {
    try {
      const res = await fetch(`${API}/prices?q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const offers = await res.json();
      if (!Array.isArray(offers) || offers.length < 2) continue;
      const pair = pickPair(offers);
      if (pair) return pair;
    } catch (e) {
      /* prøv neste kandidat */
    }
  }
  return null;
}

// Hvor mange butikker følger vi akkurat nå? Hentes fra serveren, ikke skrevet
// inn i HTML-en. Tidligere sto det «45 norske nettbutikker» og «35+ andre» i
// teksten, mens tallet i basen var 38 – hardkodede tall drifter alltid.
async function visButikkantall() {
  const el = document.getElementById("antall-butikker");
  if (!el) return;
  try {
    const r = await fetch(`${API}/retailers`);
    const d = await r.json();
    const n = (d && d.retailers && d.retailers.length) || 0;
    if (n > 2) el.textContent = String(n);
  } catch (e) {
    /* lar «alle» stå – bedre enn et tall vi ikke vet er riktig */
  }
}

(async () => {
  visButikkantall();

  const text = document.getElementById("demo-text");
  const btn = document.getElementById("demo-btn");

  const demo = await findDemo();
  if (!demo) {
    // Ingen eksempel akkurat nå: skjul knappen helt i stedet for å vise en
    // knapp som ikke fører noe sted. Overskrifta nevner knappen, så den
    // byttes til en setning som står på egne ben.
    const h1 = document.querySelector("h1");
    if (h1) h1.textContent = "Du er klar!";
    return;
  }

  // BARE KNAPPEN (22. sept. 2026): teksten om varen og besparelsen er fjernet
  // – overskrifta sier hva knappen gjør. Knappeteksten kan endres her.
  btn.href = demo.priciest.link;
  btn.textContent = "Klikk meg for eksempel ↗";
  btn.style.display = "block";
})();
