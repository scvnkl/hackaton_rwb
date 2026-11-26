const map = L.map("map", { zoomControl: true }).setView([56.635, 47.845], 12);
const streetLayer = L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors" },
);
const satLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "&copy; Esri" },
);

const localAtlas = new VectorAtlas(atlasData).addTo(map);
const regionAtlases = new Map();
const pointRenderer = L.canvas();
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
            : (leg.source==="valhalla"?"Дорожный маршрут Valhalla":"Дорожный трек OSM"),
        )
        .addTo(roadsLayer);
    }
}
let mapContext={hubs:new Set(),handling:new Set(),reserved:new Map(),key:null};
function updateMapContext(current,force=false) {
  const reserve=new Map();
  for(const v of runs[routeMode]?.book || []){
    if(v.a<=elapsed && elapsed<v.b)reserve.set(v.id,(reserve.get(v.id)||0)+v.litres);
  }
  const shown=current.length?current:[previews[routeMode]].filter(Boolean);
  const hubs=new Set([...reserve.keys(),...shown.filter(r=>r.hub).map(r=>r.hub.id)]);
  const handling=new Set(current.filter(r=>r.hub && r.res.some(v=>v.work && v.a<=elapsed && elapsed<v.b)).map(r=>r.hub.id));
  const key=JSON.stringify([routeMode,finalPvzId,shown.map(r=>[r.van,r.start,r.ids]),[...handling],[...reserve]]);
  if(!force && mapContext.key===key)return;
  mapContext={hubs,handling,reserved:reserve,key};
  renderMarkers();
  const final=cityById.get(finalPvzId);
  if(final)renderLoadDetail(final,reserve.get(finalPvzId)||0);
  if(!planIssue){
    el("chainExplanation").textContent=current.length?current.map(r=>"Машина "+r.van+" · "+pathName(r)).join("\n"):
      shown.length?"Пример партии · "+pathName(shown[0])+(shown[0].reason?" · "+shown[0].reason:""):"Нет рейса";
  }
}
function renderMarkers() {
  markersLayer.clearLayers();

  const visiblePvz = PVZ_LIST;
  const bounds = map.getBounds().pad(0.1);
  visiblePvz.forEach((pvz) => {
    if (!bounds.contains(pvz.latlng) && pvz.id !== finalPvzId && !mapContext.hubs.has(pvz.id)) return;
    const pct = calcLoadPct(pvz,mapContext.reserved.get(pvz.id)||0);
    const isFinal = pvz.id === finalPvzId;
    const isHub = mapContext.hubs.has(pvz.id);

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
        ? (mapContext.handling.has(pvz.id)?"ПВЗ-СКЛАД · обработка партии":"ПВЗ-СКЛАД рейса")
        : "ПВЗ";
    const m = visiblePvz.length > 350 && !isFinal && !isHub
      ? L.circleMarker(pvz.latlng, {radius:5, color: pct > 80 ? "#bd354d" : "#7c3caa", renderer:pointRenderer})
      : L.marker(pvz.latlng, {icon, zIndexOffset:isFinal ? 650 : isHub ? 600 : 0});
    const tip = document.createElement("span");
    tip.textContent = roleLabel + " · " + pvz.name + " · модельная загрузка " + pct + "%";
    m.addTo(markersLayer).bindTooltip(tip, {direction:"top"});
    m.on("click", () => {
      el("finalPvzSelect").value = pvz.id;
      onFinalPvzChange();
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
