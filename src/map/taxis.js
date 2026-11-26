/* Такси сети WB на карте.
 * Фон: несколько попутных такси ездят по своим маршрутам по улицам — только маленькие иконки, без линий.
 * Назначенное на срочный заказ такси получает пунктир «СЦ-1 → ПВЗ» и едет по нему по часам смены. */
const taxiLayer = L.layerGroup().addTo(map);
let taxiFleet = [], taxiFleetKey = "", taxiAssigned = new Map();

function trackOf(a, b) {
  const r = routerFor(regionId)?.route(a, b);
  if (r && r.track.length > 1) return r.track;
  const sec = haversineM(a, b) * 1.35 / (30 / 3.6);
  return [[a[0], a[1], 0], [b[0], b[1], sec]];
}
function posOnTrack(track, sec) {
  const end = track.at(-1)[2];
  if (sec <= 0) return track[0].slice(0, 2);
  if (sec >= end) return track.at(-1).slice(0, 2);
  let i = 1;
  while (i < track.length - 1 && track[i][2] < sec) i++;
  const [la, lo, ta] = track[i - 1], [lb, lob, tb] = track[i];
  const k = tb > ta ? (sec - ta) / (tb - ta) : 0;
  return [la + (lb - la) * k, lo + (lob - lo) * k];
}
const taxiIcon = (label, active) => L.divIcon({
  className: "",
  html: '<div class="taxi-pin' + (active ? " active" : "") + '">🚕' + (label ? "<span>" + label + "</span>" : "") + "</div>",
  iconSize: [active ? 30 : 22, active ? 30 : 22], iconAnchor: [active ? 15 : 11, active ? 15 : 11],
});

// Фоновые маршруты: пары далёких друг от друга ПВЗ, детерминированно для повторяемого показа.
function buildTaxiFleet() {
  const key = regionId + ":" + PVZ_LIST.length;
  if (key === taxiFleetKey) return;
  taxiFleetKey = key;
  taxiLayer.clearLayers();
  taxiAssigned.clear();
  taxiFleet = [];
  if (PVZ_LIST.length < 8) return;
  const pairs = [[0.05, 0.62], [0.27, 0.88], [0.41, 0.12], [0.73, 0.33]];
  for (const [i, j] of pairs) {
    const a = PVZ_LIST[Math.floor(i * PVZ_LIST.length)], b = PVZ_LIST[Math.floor(j * PVZ_LIST.length)];
    const track = trackOf(a.latlng, b.latlng);
    const marker = L.marker(track[0].slice(0, 2), {icon: taxiIcon("", false), interactive: true, zIndexOffset: 500})
      .bindTooltip("Такси WB · едет с пассажиром, есть место для посылки", {direction: "top"}).addTo(taxiLayer);
    taxiFleet.push({track, marker, phase: (i * 997) % 1});
  }
}

function updateTaxiMap() {
  if (planIssue) return;
  buildTaxiFleet();
  const sec = elapsed * 60;
  for (const t of taxiFleet) {
    const dur = t.track.at(-1)[2];
    if (!dur) continue;
    // Туда-обратно по своему маршруту.
    const s = (sec + t.phase * 2 * dur) % (2 * dur);
    t.marker.setLatLng(posOnTrack(t.track, s <= dur ? s : 2 * dur - s));
  }
  // Назначенные на срочные заказы.
  for (const [id, o] of taxiDone) {
    if (o.van) continue;
    let a = taxiAssigned.get(id);
    if (!a) {
      const track = trackOf(SC_NODES.sc1.latlng, o.p.latlng);
      const line = L.polyline(track.map(p => p.slice(0, 2)), {color: "#f5b400", weight: 4, opacity: 0.9, dashArray: "6 7", interactive: false}).addTo(taxiLayer);
      const marker = L.marker(track[0].slice(0, 2), {icon: taxiIcon(o.car.replace(/\D/g, ""), true), zIndexOffset: 950})
        .bindTooltip(o.car + " · срочный заказ → " + pvzName(o.p) + " · прибытие ≈ " + o.eta, {direction: "top"}).addTo(taxiLayer);
      a = {track, line, marker, start: o.startMin + TAXI.pickupMin};
      taxiAssigned.set(id, a);
    }
    const run = (elapsed - a.start) * 60;
    a.marker.setLatLng(posOnTrack(a.track, run));
    const arrived = run >= a.track.at(-1)[2];
    a.line.setStyle({opacity: arrived ? 0.25 : 0.9});
  }
  for (const [id, a] of taxiAssigned) if (!taxiDone.has(id)) { taxiLayer.removeLayer(a.line); taxiLayer.removeLayer(a.marker); taxiAssigned.delete(id); }
}
