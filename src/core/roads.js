const legCache = new Map();
const endpoints = {
  valhalla: window.VALHALLA_URL || "https://valhalla1.openstreetmap.de/route"
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
  if (leg) legCache.set(id,leg);
  return leg;
}

async function fetchChain(ids, signal) {
  if (ids.every((id,i) => !i || legOf(ids[i-1],id))) return;
  const locations = ids.map(id => {
    const [lat,lon] = nodeLatLng(id);
    return {lat,lon,type:"break"};
  });
  const params = new URLSearchParams({json:JSON.stringify({locations, costing:"auto",
    units:"kilometers", directions_type:"none", shape_format:"polyline6"})});
  const response = await fetch(endpoints.valhalla + "?" + params,
    {signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if (!response.ok) throw Error("Valhalla HTTP " + response.status);
  const {trip} = await response.json();
  if (!trip || trip.legs.length !== ids.length-1) throw Error("Неполный ответ Valhalla");
  if (signal.aborted) return;
  const legs = trip.legs.map((leg,i) => roadLeg(ids[i]+">"+ids[i+1],
    {shape:leg.shape,km:leg.summary.length,sec:leg.summary.time}));
  for (const [i,leg] of legs.entries()) legCache.set(legKey(ids[i],ids[i+1]),leg);
}

async function refreshDestination() {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++roadGeneration;
  hubPool = candidatePoints();
  neighborhood = summarizeNeighborhood(cityById.get(finalPvzId));
  recalculateAll();
  const final = finalPvzId;
  const addReverse = (ids) => [...ids, ids.at(-2), final, "sc-1"];
  const chains = [addReverse(chain("direct",null)), ...hubPool.map(p => addReverse(chain("hybrid",p)))];
  const pending = chains.filter(ids => ids.some((b,i) => i && !legOf(ids[i-1],b)));
  function status() {
    const complete = chains.filter(ids => ids.every((b,i) => !i || legOf(ids[i-1],b))).length;
    el("roadStatus").textContent = "Цепочки с дорожным треком: " + complete + " из " + chains.length +
      (complete < chains.length ? ". Недоступные плечи исключены." : ".");
  }
  status();
  if (!pending.length) return;
  el("roadStatus").textContent += " Запрос Valhalla…";
  for (const ids of pending) {
    if (generation !== roadGeneration) return;
    try { await fetchChain(ids,controller.signal); }
    catch (e) {
      if (controller.signal.aborted) return;
      // Общий сетевой сбой: сохраняем рассчитанные цепочки, оставляем повтор вручную.
      if (e instanceof TypeError || e.name === "TimeoutError" || /HTTP (429|5\d\d)/.test(e.message)) break;
    }
  }
  if (generation !== roadGeneration) return;
  status();
  const time = elapsed, resume = playing;
  recalculateAll();
  elapsed = time;
  updateClock();
  if (resume && elapsed < CONFIG.shiftMinutes) toggleSimulation();
}
