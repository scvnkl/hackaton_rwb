const BRAND_WEIGHT = { wb: 1, ozon: 0.7, ym: 0.6 };
const densityGrid = new Map();
const densityCache = new Map();
let cellLat, cellLon, indexedPoints;

function rebuildDensity(points) {
  densityGrid.clear();
  densityCache.clear();
  indexedPoints = points;
  const maxLat = points.reduce((max, p) => Math.max(max, Math.abs(p.latlng[0])), 0);
  // A search disk fits in the origin cell and its immediate neighbors.
  cellLat = (4 * CONFIG.network.catchmentM / EARTH_R) * 180 / Math.PI * 1.01;
  cellLon = cellLat / Math.cos(Math.min(89, maxLat + cellLat) * Math.PI / 180);
  for (const p of points) {
    const key = [Math.floor(p.latlng[0]/cellLat), Math.floor(p.latlng[1]/cellLon)].join();
    if (!densityGrid.has(key)) densityGrid.set(key, []);
    densityGrid.get(key).push(p);
  }
}

function summarizeNeighborhood(point) {
  if (densityCache.has(point.id)) return densityCache.get(point.id);
  const [lat,lon] = point.latlng;
  const y = Math.floor(lat/cellLat), x = Math.floor(lon/cellLon);
  const counts = {wb:0,ozon:0,ym:0}, weights = {wb:0,ozon:0,ym:0};
  const radius = 4 * CONFIG.network.catchmentM;
  const nearby = [];
  if (Math.abs(lon) + cellLon >= 180) nearby.push(indexedPoints);
  else for (let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
    const cell=densityGrid.get([y+dy,x+dx].join());
    if(cell) nearby.push(cell);
  }
  let nearest = Infinity, total = 0;
  for(const cell of nearby) for(const other of cell){
    if(other.id===point.id)continue;
    const metres=haversineM(point.latlng,other.latlng);
    if(metres>radius)continue;
    nearest=Math.min(nearest,metres);
    counts[other.brand]++;
    weights[other.brand]+=BRAND_WEIGHT[other.brand]*Math.exp(-metres/CONFIG.network.catchmentM);
    total++;
  }
  const profile={counts,weights,nearest,radius,perKm2:total/(Math.PI*(radius/1000)**2)};
  densityCache.set(point.id,profile);
  return profile;
}

function competitionIndex(point) {
  const w=summarizeNeighborhood(point).weights;
  return w.wb + (el("useCompetition").checked ? w.ozon+w.ym : 0);
}

function effectiveLoad(point) {
  const {fixedLoad,sharedLoad,refDensity}=CONFIG.network;
  return fixedLoad + sharedLoad/(1+competitionIndex(point)/refDensity);
}
