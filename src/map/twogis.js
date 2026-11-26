/* Единая подложка карты: 2ГИС. На экране всегда ровно один слой.
 * 1) 2ГИС Raster Tiles API v2, если задан ключ;
 * 2) публичные тайлы 2ГИС (без ключа);
 * 3) при отсутствии интернета — офлайн-подложка OSM из комплекта проекта.
 * Маршруты рисуются поверх по уличному графу, поэтому совпадают с улицами подложки. */
let gisKey = document.querySelector('meta[name="wb-sim-2gis-key"]').content.trim();
try { gisKey = localStorage.getItem("wb-sim.2gis-key") || gisKey; } catch {}
let baseLayer = null, baseKind = "", gisTimeout, gisAttempt = 0;

const GIS_SOURCES = {
  keyed: () => L.tileLayer(
    "https://tile{s}.maps.2gis.com/v2/tiles/online_sd/{z}/{x}/{y}.png?key=" + encodeURIComponent(gisKey),
    {subdomains: "0123", maxNativeZoom: 18, maxZoom: 19, attribution: '© <a href="https://2gis.ru/">2ГИС</a>'}),
  public: () => L.tileLayer(
    "https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1",
    {subdomains: "0123", maxNativeZoom: 18, maxZoom: 19, attribution: '© <a href="https://2gis.ru/">2ГИС</a>'}),
};

function gisStatus(text, tone = "") {
  const badge = el("gisStatus");
  badge.textContent = text;
  badge.dataset.tone = tone;
}

function removeBase() {
  clearTimeout(gisTimeout);
  if (baseLayer) { const old = baseLayer; baseLayer = null; map.removeLayer(old); }
  for (const layer of [localAtlas, streetLayer, ...regionAtlases.values()]) map.removeLayer(layer);
}

function offlineLayer() {
  if (["yoshkar-ola", "cheboksary"].includes(regionId)) return localAtlas;
  if (REGION_STREETS[regionId]) {
    if (!regionAtlases.has(regionId)) regionAtlases.set(regionId, new VectorAtlas(REGION_STREETS[regionId]));
    return regionAtlases.get(regionId);
  }
  return streetLayer;
}

function showOffline(reason) {
  removeBase();
  baseKind = "offline";
  baseLayer = offlineLayer();
  baseLayer.addTo(map);
  gisStatus("Офлайн-карта OSM" + (reason ? " · " + reason : ""), "warn");
}

function showGis(kind = gisKey ? "keyed" : "public") {
  removeBase();
  const attempt = ++gisAttempt;
  const layer = GIS_SOURCES[kind]();
  baseLayer = layer; baseKind = "2gis-" + kind;
  let ok = 0, failed = 0;
  const fail = () => {
    if (attempt !== gisAttempt || layer !== baseLayer) return;
    if (kind === "keyed") return showGis("public");
    showOffline("2ГИС недоступен");
  };
  gisStatus("Загрузка карты 2ГИС…");
  gisTimeout = setTimeout(() => { if (!ok) fail(); }, 9000);
  layer.on("tileload", () => {
    if (layer !== baseLayer) return;
    if (!ok++) { clearTimeout(gisTimeout); gisStatus("Карта 2ГИС", "ok"); }
  });
  layer.on("tileerror", () => {
    if (layer !== baseLayer) return;
    // Несколько ошибок подряд без единого тайла — ключ или сеть недоступны.
    if (++failed >= 6 && !ok) { clearTimeout(gisTimeout); setTimeout(fail, 0); }
  });
  layer.addTo(map);
}

function stopGisLayer() { removeBase(); }

// Совместимость со старым API: любой режим приводит к одной подложке 2ГИС.
function setStyleMode() {
  if (baseKind.startsWith("2gis") && baseLayer && map.hasLayer(baseLayer)) return;
  if (baseKind === "offline") return showOffline("2ГИС недоступен");
  showGis();
}
