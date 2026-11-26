/* Офлайн-маршрутизация по дорожному графу OpenStreetMap.
 * Граф строится из тех же данных, что и подложка (data/atlas.js, data/regions/streets.js):
 * у соседних улиц общие вершины на перекрёстках, поэтому A* находит путь по реальным улицам
 * к любому ПВЗ без внешних сервисов. Стоимость ребра — время в пути (км/ч по классу дороги). */
const ROUTER_SPEED = {
  motorway: 90, trunk: 75, primary: 55, secondary: 48, tertiary: 40,
  unclassified: 32, residential: 28, living_street: 15, road: 25, service: 15,
  motorway_link: 50, trunk_link: 45, primary_link: 40, secondary_link: 36, tertiary_link: 32,
};
const ROUTE_DETOUR_SNAP = 1.4; // подъезд от дороги к точке: прямая × коэффициент
const routerGraphs = new Map();

class RoadGraph {
  constructor(data) {
    const verts = data.vertices;
    const n = verts.length;
    this.lat = new Float64Array(n);
    this.lon = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.lat[i] = verts[i][0]; this.lon[i] = verts[i][1]; }
    const edges = [];
    this.names = [];
    this.vname = new Int32Array(n).fill(-1);
    const nameIndex = new Map();
    for (const [, name, kind, maxspeed, oneway, ids] of data.roads) {
      if (name && kind !== "service") {
        if (!nameIndex.has(name)) { nameIndex.set(name, this.names.length); this.names.push(name); }
        const ni = nameIndex.get(name);
        for (const i of ids) if (this.vname[i] < 0) this.vname[i] = ni;
      }
      const base = ROUTER_SPEED[kind] || 20;
      const kmh = maxspeed > 0 ? Math.min(base, maxspeed) : base;
      for (let k = 1; k < ids.length; k++) {
        const a = ids[k - 1], b = ids[k];
        if (a === b) continue;
        const m = haversineM(verts[a], verts[b]);
        const sec = m / (kmh / 3.6);
        edges.push(a, b, m, sec);
        if (!oneway) edges.push(b, a, m, sec);
      }
    }
    const count = edges.length / 4;
    const deg = new Int32Array(n + 1);
    for (let e = 0; e < count; e++) deg[edges[e * 4] + 1]++;
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    this.start = deg;
    this.to = new Int32Array(count);
    this.m = new Float32Array(count);
    this.sec = new Float32Array(count);
    const fill = deg.slice(0, n);
    for (let e = 0; e < count; e++) {
      const a = edges[e * 4], slot = fill[a]++;
      this.to[slot] = edges[e * 4 + 1];
      this.m[slot] = edges[e * 4 + 2];
      this.sec[slot] = edges[e * 4 + 3];
    }
    this.n = n;
    this.maxSpeed = 90 / 3.6;
    this.component = this.components();
    // Сетка для быстрой привязки точки к ближайшей вершине главной компоненты.
    this.cell = 0.005;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      if (this.component[i] !== this.mainComponent) continue;
      if (this.start[i + 1] === this.start[i]) continue;
      const key = Math.floor(this.lat[i] / this.cell) + ":" + Math.floor(this.lon[i] / this.cell);
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, list = []);
      list.push(i);
    }
  }

  // Слабо связные компоненты: точки привязываются только к самой большой сети,
  // чтобы маршрут не «застревал» на изолированном дворовом проезде.
  components() {
    const parent = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) parent[i] = i;
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let a = 0; a < this.n; a++)
      for (let e = this.start[a]; e < this.start[a + 1]; e++) {
        const ra = find(a), rb = find(this.to[e]);
        if (ra !== rb) parent[ra] = rb;
      }
    const size = new Map();
    const comp = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      comp[i] = find(i);
      if (this.start[i + 1] > this.start[i]) size.set(comp[i], (size.get(comp[i]) || 0) + 1);
    }
    let best = -1, bestSize = 0;
    for (const [c, s] of size) if (s > bestSize) { best = c; bestSize = s; }
    this.mainComponent = best;
    return comp;
  }

  nearest(latlng, maxM = 1500) {
    const [lat, lon] = latlng;
    const cy = Math.floor(lat / this.cell), cx = Math.floor(lon / this.cell);
    let best = -1, bestM = Infinity;
    for (let r = 0; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        for (const i of this.grid.get((cy + dy) + ":" + (cx + dx)) || []) {
          const m = haversineM(latlng, [this.lat[i], this.lon[i]]);
          if (m < bestM) { bestM = m; best = i; }
        }
      }
      if (best >= 0 && bestM < r * this.cell * 60000) break;
    }
    return best >= 0 && bestM <= maxM ? {v: best, m: bestM} : null;
  }

  // Ближайшая именованная улица — для подписи ПВЗ без адреса в справочнике.
  streetNear(latlng, maxM = 350) {
    const [lat, lon] = latlng;
    const cy = Math.floor(lat / this.cell), cx = Math.floor(lon / this.cell);
    let best = -1, bestM = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      for (const i of this.grid.get((cy + dy) + ":" + (cx + dx)) || []) {
        if (this.vname[i] < 0) continue;
        const m = haversineM(latlng, [this.lat[i], this.lon[i]]);
        if (m < bestM) { bestM = m; best = i; }
      }
    return best >= 0 && bestM <= maxM ? this.names[this.vname[best]] : null;
  }

  // A* по времени в пути с эвристикой «прямая на максимальной скорости».
  path(s, t) {
    if (s === t) return [s];
    const n = this.n, g = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const tl = [this.lat[t], this.lon[t]];
    const h = v => haversineM([this.lat[v], this.lon[v]], tl) / this.maxSpeed;
    const heap = new MinHeap();
    g[s] = 0; heap.push(s, h(s));
    while (heap.size) {
      const v = heap.pop();
      if (closed[v]) continue;
      if (v === t) break;
      closed[v] = 1;
      for (let e = this.start[v]; e < this.start[v + 1]; e++) {
        const w = this.to[e], cand = g[v] + this.sec[e];
        if (cand < g[w]) { g[w] = cand; prev[w] = v; heap.push(w, cand + h(w)); }
      }
    }
    if (!Number.isFinite(g[t])) return null;
    const out = [];
    for (let v = t; v !== -1; v = prev[v]) out.push(v);
    return out.reverse();
  }

  edge(a, b) {
    for (let e = this.start[a]; e < this.start[a + 1]; e++) if (this.to[e] === b) return e;
    return -1;
  }

  route(from, to) {
    const a = this.nearest(from), b = this.nearest(to);
    if (!a || !b) return null;
    const vertices = this.path(a.v, b.v);
    if (!vertices) return null;
    const snapSpeed = 12 / 3.6;
    let sec = a.m * ROUTE_DETOUR_SNAP / snapSpeed, m = a.m * ROUTE_DETOUR_SNAP;
    const track = [[from[0], from[1], 0]];
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (i) { const e = this.edge(vertices[i - 1], v); sec += this.sec[e]; m += this.m[e]; }
      else sec = a.m * ROUTE_DETOUR_SNAP / snapSpeed;
      track.push([this.lat[v], this.lon[v], sec]);
    }
    sec += b.m * ROUTE_DETOUR_SNAP / snapSpeed;
    m += b.m * ROUTE_DETOUR_SNAP;
    track.push([to[0], to[1], sec]);
    // Перекрёстки и светофоры: +0,5 с на вершину пути, не более 2 минут на плечо.
    const extra = Math.min(120, vertices.length * 0.5);
    const scale = sec > 0 ? (sec + extra) / sec : 1;
    for (const p of track) p[2] *= scale;
    return {km: m / 1000, sec: sec + extra, track};
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    let i = k.length; k.push(key); p.push(pri);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= pri) break;
      k[i] = k[j]; p[i] = p[j]; i = j;
    }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p, top = k[0];
    const lastK = k.pop(), lastP = p.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && p[c + 1] < p[c]) c++;
        if (p[c] >= lastP) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lastK; p[i] = lastP;
    }
    return top;
  }
}

function routerDataFor(region) {
  if (region === "yoshkar-ola" || region === "cheboksary") return typeof atlasData !== "undefined" ? atlasData : null;
  return typeof REGION_STREETS !== "undefined" ? REGION_STREETS[region] : null;
}

function routerFor(region) {
  if (routerGraphs.has(region)) return routerGraphs.get(region);
  const data = routerDataFor(region);
  let graph = null;
  try { graph = data ? new RoadGraph(data) : null; } catch (e) { graph = null; }
  // Граф переиспользуется для двух пилотных регионов с общим atlasData.
  if (region === "yoshkar-ola" || region === "cheboksary") {
    routerGraphs.set("yoshkar-ola", graph);
    routerGraphs.set("cheboksary", graph);
  } else routerGraphs.set(region, graph);
  return graph;
}

/* Оценочное плечо, когда нет ни графа, ни ответа сервиса: прямая × 1.35, 25 км/ч. */
function estimatedLeg(key, a, b) {
  const metres = haversineM(a, b) * 1.35;
  const sec = metres / (25 / 3.6) + 60;
  return {key, km: metres / 1000, min: sec / 60, source: "estimate", estimatedGeometry: true,
    track: [[a[0], a[1], 0], [b[0], b[1], sec]]};
}
