const map = L.map("map", { zoomControl: true }).setView([56.635, 47.845], 12);
const streetLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "&copy; Esri" },
);
const satLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "&copy; Esri" },
);

new VectorAtlas(atlasData).addTo(map);
map.attributionControl.addAttribution(
  document.querySelector("#map-credit").innerHTML,
);
const markersLayer = L.layerGroup().addTo(map);
const roadsLayer = L.layerGroup().addTo(map);
const trucksLayer = L.layerGroup().addTo(map);
let plottedTrips = [];
function plot(active = []) {
  const trips = active.length ? active : [previews[routeMode]].filter(Boolean);
  if (
    trips.length === plottedTrips.length &&
    trips.every((r, i) => r === plottedTrips[i])
  )
    return;
  plottedTrips = trips;
  roadsLayer.clearLayers();
  const drawn = new Set();
  for (const r of trips)
    for (const { leg } of r.phases) {
      if (!leg || drawn.has(r.mode + leg.key)) continue;
      drawn.add(r.mode + leg.key);
      L.polyline(
        leg.track.map((p) => p.slice(0, 2)),
        {
          color: r.mode === "hybrid" ? "#c46c12" : "#2563eb",
          weight: 5,
          dashArray: leg.estimatedGeometry ? "6 8" : null,
        },
      )
        .bindTooltip(
          leg.estimatedGeometry
            ? "Схематичное плечо без дорожного трека"
            : "Дорожный трек OSM",
        )
        .addTo(roadsLayer);
    }
}
function renderMarkers() {
  markersLayer.clearLayers();
  const { hubPvz, finalPvz } = activeChain;

  const visiblePvz =
    geoMode === "local"
      ? PVZ_LIST.filter((p) => p.city === "Йошкар-Ола")
      : PVZ_LIST.filter((p) => p.city === finalPvz.city);

  visiblePvz.forEach((pvz) => {
    const pct = calcLoadPct(pvz);
    const isFinal = pvz.id === finalPvz.id;
    const isHub = routeMode === "hybrid" && hubPvz && pvz.id === hubPvz.id;

    let extraClass = "";
    let badgeText = `${pct}%`;
    if (isFinal) {
      extraClass = "final-pvz";
      badgeText = "КОН";
    } else if (isHub) {
      extraClass = "hub-pvz";
      badgeText = "СКЛ";
    }

    const icon = L.divIcon({
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      html: markerLabel(["pvz-circle", extraClass, loadClass(pct)], badgeText),
    });

    const roleLabel = isFinal
      ? "КОНЕЧНЫЙ ПВЗ"
      : isHub
        ? "ГИБРИДНЫЙ ПВЗ-СКЛАД"
        : "ПВЗ";
    const m = L.marker(pvz.latlng, { icon }).addTo(markersLayer);
    m.bindTooltip(`${roleLabel}: ${pvz.name} (${pct}%)`, { direction: "top" });
    m.on("click", () => {
      finalPvzId = pvz.id;
      document.getElementById("finalPvzSelect").value = finalPvzId;
      recalculateAll();
    });
  });

  const scNodesToShow =
    geoMode === "local"
      ? [SC_NODES.sc1, SC_NODES.sc2]
      : [SC_NODES.sc1, SC_NODES.sc2, SC_NODES.ch];

  scNodesToShow.forEach((node) => {
    const icon = L.divIcon({
      className: "",
      iconSize: [122, 32],
      iconAnchor: [61, 16],
      html: markerLabel(["sc-box", node.cls], node.label),
    });
    L.marker(node.latlng, { icon })
      .bindTooltip(node.tooltip, { direction: "top" })
      .addTo(markersLayer);
  });
}

function markerLabel(classes, label) {
  const element = document.createElement("div");
  element.className = classes.filter(Boolean).join(" ");
  element.textContent = label;
  return element;
}
function loadClass(pct) {
  return pct < 55 ? "load-low" : pct < 78 ? "load-medium" : "load-high";
}
