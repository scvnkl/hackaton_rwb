const BRAND_WEIGHT = { wb: 1, ozon: 0.7, ym: 0.6 };
let densityGrid = new Map();
let densityCache = new Map();
let cellLon = 0.03;
const cellLat = 0.016;

function rebuildDensity(points) {
  densityCache = new Map();
  densityGrid = new Map();
  // Размер ячейки не меньше радиуса поиска в обеих координатах региона.
  const maxLat = points.reduce((max, p) => Math.max(max, Math.abs(p.latlng[0])), 0);
  cellLon = cellLat / Math.max(0.01, Math.cos(maxLat * Math.PI / 180));
  for (const p of points) {
    const key = [Math.floor(p.latlng[0]/cellLat), Math.floor(p.latlng[1]/cellLon)].join();
    if (!densityGrid.has(key)) densityGrid.set(key, []);
    densityGrid.get(key).push(p);
  }
}

function competitionIndex(p) {
  if (densityCache.has(p.id)) return densityCache.get(p.id);
  const y = Math.floor(p.latlng[0]/cellLat), x = Math.floor(p.latlng[1]/cellLon);
  let n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
    for (const other of densityGrid.get([y+i, x+j].join()) || []) {
      if (p.id === other.id) continue;
      const meters = haversineM(p.latlng, other.latlng);
      if (meters <= 4 * CONFIG.network.catchmentM)
        n += BRAND_WEIGHT[other.brand] * Math.exp(-meters / CONFIG.network.catchmentM);
    }
  densityCache.set(p.id, n);
  return n;
}

function effectiveLoad(p) {
  const base = p.baseLoad ?? 40;
  if (!el("useCompetition").checked) return base;
  const cfg = CONFIG.network;
  const adjustment = Math.round(cfg.maxAdj * Math.tanh((cfg.refDensity - competitionIndex(p)) / 1.5));
  return Math.min(95, Math.max(20, base + adjustment));
}
