const legCache = new Map();
const endpoints = {
  valhalla: window.VALHALLA_URL || "https://valhalla1.openstreetmap.de/route",
  osrm: window.OSRM_URL || "https://router.project-osrm.org/route/v1/driving/"
};
let activeRequest;
function legKey(a,b) {
  return regionId + "|" + nodeLatLng(a).join(",") + ">" + nodeLatLng(b).join(",");
}
function decodeShape(encoded) {
  let i = 0, lat = 0, lon = 0;
  const out = [];
  function delta() {
    let value = 0, shift = 0, c;
    do {
      c = encoded.charCodeAt(i++) - 63;
      if (!Number.isInteger(c) || c < 0 || c > 63 || shift > 30) throw Error("Некорректная геометрия Valhalla");
      value |= (c & 31) << shift;
      shift += 5;
    } while (c >= 32);
    return (value & 1) ? ~(value >> 1) : (value >> 1);
  }
  while (i < encoded.length) {
    lat += delta(); lon += delta();
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}
function roadLeg(key, data) {
  const points = decodeShape(data.shape);
  if (points.length < 2 || !(data.sec > 0) || !(data.km > 0)) throw Error("Нет автомобильного плеча");
  let dist = 0;
  const track = points.map((p,i) => {
    if (i) dist += haversineM(points[i-1], p);
    return [...p, dist];
  });
  if (!dist) throw Error("Пустой дорожный трек");
  for (const p of track) p[2] = p[2] / dist * data.sec;
  return {key, km:data.km, min:data.sec / 60, track, source:"valhalla"};
}

const estimateCache = new Map();
// Порядок источников: сохранённый трек Valhalla/OSRM → офлайн-граф OSM (A*) → онлайн-сервис → оценка.
function legOf(a,b) {
  const key = a + ">" + b;
  const id = legKey(a,b);
  if (legCache.has(id)) return legCache.get(id);
  const saved = REGION_ROADS[regionId]?.[key];
  let leg;
  if (saved) leg = roadLeg(key, saved);
  else if (regionId === "yoshkar-ola" || regionId === "cheboksary") {
    const raw = roads[key];
    if (raw) leg = {key, km:raw.km, min:raw.track.at(-1)[2]/60, track:raw.track, source:"osm"};
  }
  const from = nodeLatLng(a), to = nodeLatLng(b);
  if (!leg && from && to) {
    const graph = routerFor(regionId);
    const r = graph?.route(from, to);
    if (r && r.sec > 0 && r.km > 0) leg = {key, km:r.km, min:r.sec/60, track:r.track, source:"graph"};
  }
  if (leg) { legCache.set(id,leg); return leg; }
  if (!from || !to) return undefined;
  // Нет графа на этом участке: оценка не блокирует расчёт, а онлайн-запрос уточнит трек.
  if (!estimateCache.has(id)) estimateCache.set(id, estimatedLeg(key, from, to));
  return estimateCache.get(id);
}
const isEstimated = (a,b) => { legOf(a,b); return !legCache.has(legKey(a,b)); };

function hasSavedItinerary(ids){
  return ids.slice(1).every((b,i)=>legOf(ids[i],b));
}

function coverageFor(incident){
  const options=[chain("direct",null),...hubPool.map(p=>chain("hybrid",p))];
  const chains=options.map(ids=>roadItinerary(ids,incident));
  return {chains,complete:chains.filter(ids=>ids.slice(1).every((b,i)=>!isEstimated(ids[i],b))).length};
}

async function fetchLegOnline(a, b, signal) {
  const [la,lo]=nodeLatLng(a), [lb,lob]=nodeLatLng(b);
  const key=a+">"+b;
  const timeout=AbortSignal.any([signal,AbortSignal.timeout(8000)]);
  try {
    const params = new URLSearchParams({json:JSON.stringify({locations:[{lat:la,lon:lo},{lat:lb,lon:lob}],
      costing:"auto", units:"kilometers", directions_type:"none", shape_format:"polyline6"})});
    const response = await fetch(endpoints.valhalla + "?" + params, {signal:timeout});
    if (!response.ok) throw Error("Valhalla HTTP " + response.status);
    const {trip} = await response.json();
    const leg = trip?.legs?.[0];
    if (leg) return roadLeg(key,{shape:leg.shape,km:leg.summary.length,sec:leg.summary.time});
  } catch (e) { if (signal.aborted) throw e; }
  const url = endpoints.osrm + lo + "," + la + ";" + lob + "," + lb + "?overview=full&geometries=geojson";
  const response = await fetch(url, {signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
  if (!response.ok) throw Error("OSRM HTTP " + response.status);
  const route = (await response.json()).routes?.[0];
  if (!route) throw Error("Нет маршрута OSRM");
  const pts = route.geometry.coordinates.map(([x,y]) => [y,x]);
  let dist = 0;
  const track = pts.map((p,i) => { if (i) dist += haversineM(pts[i-1],p); return [...p, dist]; });
  for (const p of track) p[2] = dist ? p[2]/dist*route.duration : 0;
  return {key, km:route.distance/1000, min:route.duration/60, track, source:"osrm"};
}

async function refreshDestination() {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++roadGeneration;
  hubPool = candidatePoints();
  recalculateAll();
  requestScenarioAddresses();
  const {chains}=coverageFor(el("incident").value);
  const pending = [];
  for (const ids of chains) for (let i=1;i<ids.length;i++)
    if (isEstimated(ids[i-1],ids[i]) && !pending.some(([a,b])=>a===ids[i-1]&&b===ids[i])) pending.push([ids[i-1],ids[i]]);
  function status() {
    const {complete} = coverageFor(el("incident").value);
    const graph = routerFor(regionId);
    el("roadStatus").textContent = (complete === chains.length ? "✓ " : "") + "По улицам: " + complete + "/" + chains.length +
      (complete < chains.length ? " · остальные — оценка (пунктир)" : "");
    el("roadStatus").title = graph ? "Маршруты строятся офлайн по графу улиц OpenStreetMap (A*), уточняются Valhalla/OSRM при наличии сети" : "Маршруты Valhalla/OSRM";
  }
  status();
  if (!pending.length) return;
  el("roadStatus").textContent += " · уточняем онлайн…";
  let changed = false;
  for (const [a,b] of pending) {
    if (generation !== roadGeneration) return;
    try {
      const leg = await fetchLegOnline(a,b,controller.signal);
      if (leg) { legCache.set(legKey(a,b), leg); changed = true; }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof TypeError || e.name === "TimeoutError" || /HTTP (429|5\d\d)/.test(e.message)) break;
    }
  }
  if (generation !== roadGeneration) return;
  status();
  if (!changed) return;
  const time = elapsed, resume = playing;
  recalculateAll();
  if(!planIssue){
    elapsed=time;
    updateClock();
    if(resume && elapsed<CONFIG.shiftMinutes)toggleSimulation();
  }
}
