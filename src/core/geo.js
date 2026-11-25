const EARTH_R = 6371000;
const ROAD_MATRIX =
  typeof MATRIX_DATA === "object" && MATRIX_DATA ? MATRIX_DATA : {};

function haversineM(a, b) {
  const [lat1, lon1] = a,
    [lat2, lon2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

function nodeLatLng(id) {
  if (id === SC_NODES.sc1.id) return SC_NODES.sc1.latlng;
  if (id === SC_NODES.sc2.id) return SC_NODES.sc2.latlng;
  if (SC_NODES.ch && id === SC_NODES.ch.id) return SC_NODES.ch.latlng;
  const p = PVZ_LIST.find((x) => x.id === id);
  return p ? p.latlng : null;
}

function straightTrack(A, B, min) {
  return [
    [A[0], A[1], 0],
    [B[0], B[1], min * 60],
  ];
}

/* Единая точка получения плеча: Valhalla → OSM-трек → оценка по прямой. */
function legOf(aId, bId) {
  const key = aId + ">" + bId;
  const real = typeof roads === "undefined" ? null : roads[key];
  const m = ROAD_MATRIX[key];

  if (
    m &&
    Number.isFinite(m.km) &&
    m.km >= 0 &&
    Number.isFinite(m.min) &&
    m.min > 0
  ) {
    const A = nodeLatLng(aId),
      B = nodeLatLng(bId);
    return {
      key,
      km: m.km,
      min: m.min,
      track: real
        ? real.track.map(([lat, lon, sec]) => [
            lat,
            lon,
            (sec * m.min * 60) / real.track.at(-1)[2],
          ])
        : straightTrack(A, B, m.min),
      estimatedGeometry: !real,
      source: "valhalla",
    };
  }
  if (real) {
    return {
      key,
      km: real.km,
      min: real.track.at(-1)[2] / 60,
      track: real.track,
      source: "osm",
    };
  }
  const A = nodeLatLng(aId),
    B = nodeLatLng(bId);
  if (!A || !B) return null;
  const km = (haversineM(A, B) * CONFIG.detour) / 1000;
  const min = (km / CONFIG.avgKmh) * 60;
  return {
    key,
    km,
    min,
    track: straightTrack(A, B, min),
    estimatedGeometry: true,
    source: "estimate",
  };
}

/* Диагностика покрытия — покажите это жюри, если спросят про качество данных. */
function coverageReport() {
  let valhalla = 0,
    osm = 0,
    estimate = 0;
  for (const a of PVZ_LIST)
    for (const b of PVZ_LIST) {
      if (a.id === b.id || a.city !== b.city) continue;
      const l = legOf(a.id, b.id);
      if (!l) continue;
      if (l.source === "valhalla") valhalla++;
      else if (l.source === "osm") osm++;
      else estimate++;
    }
  return { valhalla, osm, estimate };
}
