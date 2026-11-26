let gisKey = document.querySelector('meta[name="wb-sim-2gis-key"]').content.trim();
try { gisKey = localStorage.getItem("wb-sim.2gis-key") || gisKey; } catch {}
let gisLayer = null;
let gisTimeout;

function gisStatus(message) {
  el("gisStatus").hidden = !message;
  el("gisStatus").textContent = message;
}

function stopGisLayer() {
  clearTimeout(gisTimeout);
  if (gisLayer) {
    const previous = gisLayer;
    gisLayer = null;
    previous.remove();
  }
  gisStatus("");
}

function showGisLayer() {
  if (gisLayer) return;
  const layer = L.tileLayer(
    "https://tile{s}.maps.2gis.com/v2/tiles/online_sd/{z}/{x}/{y}.png?key=" + encodeURIComponent(gisKey),
    {subdomains:"01234", maxNativeZoom:18, maxZoom:19, zIndex:3,
      attribution:'© <a href="https://2gis.ru/">2ГИС</a>'}
  );
  gisLayer = layer;
  let loaded = false;
  function fallback() {
    if (layer !== gisLayer) return;
    setStyleMode("vector");
    gisStatus("2ГИС недоступен. Включена обычная карта. Для повтора нажмите «2ГИС».");
  }
  layer.on("loading", () => {
    if (layer !== gisLayer) return;
    loaded = false;
    gisStatus("Загрузка 2ГИС…");
    clearTimeout(gisTimeout);
    gisTimeout = setTimeout(fallback, 12000);
  });
  layer.on("tileload", () => {
    if (layer !== gisLayer) return;
    loaded = true;
    clearTimeout(gisTimeout);
    gisStatus("");
  });
  layer.on("tileerror", event => { event.tile.style.visibility = "hidden"; });
  // Leaflet still uses the map after emitting "load". Remove the layer on the next turn.
  layer.on("load", () => {
    if (!loaded && layer === gisLayer) {
      clearTimeout(gisTimeout);
      gisTimeout = setTimeout(fallback, 0);
    }
  });
  layer.addTo(map);
}
