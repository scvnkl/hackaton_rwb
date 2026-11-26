const EARTH_R = 6371000;
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
  const p = cityById.get(id);
  return p ? p.latlng : null;
}
