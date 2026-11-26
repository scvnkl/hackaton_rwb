/* Адреса ПВЗ вместо координат.
 * В справочниках OSM у многих точек нет адреса — только «Wildberries · node/…».
 * 1) Мгновенно: ближайшая улица из офлайн-графа («у ул. Ленина»).
 * 2) В фоне: обратное геокодирование Nominatim (резерв — Photon) → «ул. Ленина, 12».
 * Ответы кешируются в браузере, поэтому повторный запуск и офлайн-показ видят адреса сразу.
 * Порядок: конечный ПВЗ и хабы → точка под курсором → видимые на карте. Не чаще 1 запроса/с. */
const GEO_CACHE_KEY = "wb-sim.addr.v1";
let geoCache = {};
try { geoCache = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); } catch { geoCache = {}; }
const geoQueue = [];
const geoQueued = new Set();
let geoBusy = false, geoOffline = false, geoRefreshTimer = 0;
const geoKey = p => p.latlng[0].toFixed(5) + "," + p.latlng[1].toFixed(5);

const shortStreet = s => s
  .replace(/Проспект/g, "проспект").replace(/Улица/g, "улица")
  .replace(/^улица\s+(.+)$/i, "ул. $1").replace(/\s+улица$/i, " ул.")
  .replace(/^проспект\s+/i, "пр-т ").replace(/\s+проспект$/i, " пр-т")
  .replace(/^переулок\s+/i, "пер. ").replace(/\s+переулок$/i, " пер.")
  .replace(/^бульвар\s+/i, "б-р ").replace(/\s+бульвар$/i, " б-р")
  .replace(/^шоссе\s+/i, "ш. ").replace(/\s+шоссе$/i, " ш.")
  .replace(/^площадь\s+/i, "пл. ").replace(/\s+площадь$/i, " пл.");

// «Западная улица 23А» → «Западная ул., 23А»
function tidyAddress(text) {
  const m = text.match(/^(.*?)[,\s]+(\d+[0-9A-Za-zА-Яа-я\/-]*(?:\s*(?:к|корп\.?|стр\.?|с)\s*\d+)?)$/);
  return m ? shortStreet(m[1].trim()) + ", " + m[2] : shortStreet(text);
}

function applyAddress(p, address) {
  if (!address) return false;
  p.address = address;
  p.label = address;
  p.needsAddress = false;
  return true;
}

function cachedAddress(p) {
  const hit = geoCache[geoKey(p)];
  return hit ? applyAddress(p, hit) : false;
}

function requestAddress(p, urgent = false) {
  if (!p || !p.needsAddress || geoOffline) return;
  if (cachedAddress(p)) return scheduleAddressRefresh();
  if (geoQueued.has(p.id)) {
    if (urgent) { const i = geoQueue.indexOf(p); if (i > 0) { geoQueue.splice(i, 1); geoQueue.unshift(p); } }
    return;
  }
  geoQueued.add(p.id);
  urgent ? geoQueue.unshift(p) : geoQueue.push(p);
  pumpGeocoder();
}

async function reverseGeocode(p) {
  const [lat, lon] = p.latlng;
  const signal = AbortSignal.timeout(8000);
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?" + new URLSearchParams(
      {lat, lon, format: "jsonv2", zoom: 18, addressdetails: 1, "accept-language": "ru"}), {signal});
    if (r.ok) {
      const a = (await r.json()).address || {};
      const street = a.road || a.pedestrian || a.square || a.neighbourhood || a.suburb;
      if (street) return shortStreet(street) + (a.house_number ? ", " + a.house_number : "");
    }
  } catch (e) { if (e instanceof TypeError && !navigator.onLine) throw e; }
  const r = await fetch("https://photon.komoot.io/reverse?" + new URLSearchParams({lat, lon, lang: "default", limit: 1}),
    {signal: AbortSignal.timeout(8000)});
  if (!r.ok) throw Error("Photon HTTP " + r.status);
  const f = (await r.json()).features?.[0]?.properties || {};
  const street = f.street || f.name;
  return street ? shortStreet(street) + (f.housenumber ? ", " + f.housenumber : "") : null;
}

async function pumpGeocoder() {
  if (geoBusy) return;
  geoBusy = true;
  let failures = 0;
  while (geoQueue.length && !geoOffline) {
    const p = geoQueue.shift();
    geoQueued.delete(p.id);
    if (!p.needsAddress) continue;
    if (cachedAddress(p)) { scheduleAddressRefresh(); continue; }
    try {
      const address = await reverseGeocode(p);
      failures = 0;
      if (address) {
        geoCache[geoKey(p)] = address;
        try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache)); } catch {}
        applyAddress(p, address);
        scheduleAddressRefresh();
      } else p.needsAddress = false;
    } catch {
      // Две ошибки подряд — сети нет: остаёмся на подписях по ближайшей улице.
      if (++failures >= 2) geoOffline = true;
    }
    await new Promise(done => setTimeout(done, 1100));
  }
  geoBusy = false;
}

// Обновляем подписи пачкой, не пересчитывая смену.
function scheduleAddressRefresh() {
  clearTimeout(geoRefreshTimer);
  geoRefreshTimer = setTimeout(() => {
    dedupeLabels(PVZ_LIST);
    const keep = el("finalPvzSelect").value;
    populateSelect();
    el("finalPvzSelect").value = keep;
    el("stockPoint").replaceChildren(...PVZ_LIST.map(p => new Option(pvzName(p), p.id)));
    if (!planIssue && runs[routeMode]) { updateClock(true); renderDecision(); }
    else renderMarkers();
    if (drawerOpen) renderAnalyticsDrawer();
  }, 400);
}

function dedupeLabels(points) {
  const seen = new Map();
  for (const p of points) {
    const base = p.address || p.baseLabel || p.label;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    p.label = n > 1 ? base + " (" + n + ")" : base;
  }
}

// Важные точки сценария: конечный ПВЗ, кандидаты-хабы, затем видимые на карте.
function requestScenarioAddresses() {
  requestAddress(cityById.get(finalPvzId), true);
  for (const p of hubPool) requestAddress(p);
  const bounds = map.getBounds();
  for (const p of PVZ_LIST) if (p.needsAddress && bounds.contains(p.latlng)) requestAddress(p);
}
