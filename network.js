"use strict";
const METRES = 111195;
function distance(a, b) {
  const dx = (a[1] - b[1]) * Math.cos(((a[0] + b[0]) * Math.PI) / 360);
  return METRES * Math.hypot(a[0] - b[0], dx);
}
class Heap {
  constructor() {
    this.items = [];
  }
  push(x) {
    const a = this.items;
    let i = a.length;
    a.push(x);
    while (i) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= x[0]) break;
      a[i] = a[j];
      i = j;
    }
    a[i] = x;
  }
  pop() {
    const a = this.items,
      first = a[0],
      last = a.pop();
    if (!a.length) return first;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let j = i * 2 + 1;
      if (j + 1 < a.length && a[j + 1][0] < a[j][0]) j++;
      if (a[j][0] >= last[0]) break;
      a[i] = a[j];
      i = j;
    }
    a[i] = last;
    return first;
  }
}
class RoadNetwork {
  constructor(data) {
    this.data = data;
    this.cache = new Map();
    const v = data.vertices;
    this.adj = v.map(() => []);
    const rev = v.map(() => []);
    this.rules = new Map();
    for (const [vertex, from, to, type] of data.turns) {
      const key = vertex + ":" + from;
      const list = this.rules.get(key) || [];
      list.push([to, type]);
      this.rules.set(key, list);
    }
    for (const [way, name, kind, speed, one, ids] of data.roads) {
      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1],
          b = ids[i],
          m = distance(v[a], v[b]);
        if (a === b) continue;
        const edge = (u, w) => {
          this.adj[u].push({ to: w, m, sec: (m * 3.6) / speed, way });
          rev[w].push(u);
        };
        if (one >= 0) edge(a, b);
        if (one <= 0) edge(b, a);
      }
    }
    // Select the largest strongly connected component; both outbound and return trips are possible.
    const seen = new Uint8Array(v.length),
      finish = [];
    for (let root = 0; root < v.length; root++) {
      if (seen[root]) continue;
      const stack = [[root, 0]];
      seen[root] = 1;
      while (stack.length) {
        let top = stack.at(-1),
          edges = this.adj[top[0]];
        if (top[1] === edges.length) {
          finish.push(top[0]);
          stack.pop();
          continue;
        }
        let n = edges[top[1]++].to;
        if (!seen[n]) {
          seen[n] = 1;
          stack.push([n, 0]);
        }
      }
    }
    seen.fill(0);
    let largest = [];
    for (let i = finish.length - 1; i >= 0; i--) {
      const root = finish[i];
      if (seen[root]) continue;
      let group = [root];
      seen[root] = 1;
      for (let j = 0; j < group.length; j++)
        for (const n of rev[group[j]])
          if (!seen[n]) {
            seen[n] = 1;
            group.push(n);
          }
      if (group.length > largest.length) largest = group;
    }
    this.cells = new Map();
    for (const id of largest) {
      const [lat, lon] = v[id],
        key = Math.floor(lat * 100) + "," + Math.floor(lon * 100);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(id);
    }
    this.points = data.points.map((p) => this.snap(p)).filter(Boolean);
    this.byId = new Map(this.points.map((p) => [p.id, p]));
  }
  snap(p) {
    const a = [p.lat, p.lon];
    let nearest = -1,
      metres = 700;
    const x = Math.floor(a[0] * 100),
      y = Math.floor(a[1] * 100),
      span =
        Math.ceil(
          0.7 / (1.11 * Math.max(0.08, Math.cos((a[0] * Math.PI) / 180))),
        ) + 1;
    for (let i = -1; i <= 1; i++)
      for (let j = -span; j <= span; j++)
        for (const id of this.cells.get(x + i + "," + (y + j)) || []) {
          let m = distance(a, this.data.vertices[id]);
          if (m < metres) {
            metres = m;
            nearest = id;
          }
        }
    return nearest < 0
      ? null
      : { ...p, vertex: nearest, snapMetres: Math.round(metres) };
  }
  route(a, b, closed = 0) {
    let start = a.vertex,
      end = b.vertex,
      key = start + "/" + end + "/" + closed + "/" + (this.metric || "time");
    if (this.cache.has(key)) return this.cache.get(key);
    let heap = new Heap(),
      best = new Map(),
      prev = new Map(),
      id0 = String(start),
      goal = null;
    best.set(id0, 0);
    heap.push([0, 0, start, -1, -1, id0]);
    while (heap.items.length) {
      const [, g, u, prior, priorVertex, sid] = heap.pop();
      if (best.get(sid) !== g) continue;
      if (u === end) {
        goal = sid;
        break;
      }
      const rules = this.rules.get(u + ":" + prior) || [];
      for (const e of this.adj[u]) {
        if (e.way === closed) continue;
        const match = ([way, kind]) =>
          way === e.way &&
          (kind.endsWith("u_turn")
            ? priorVertex === e.to
            : !(prior === way && priorVertex === e.to));
        if (
          rules.some((r) => r[1].startsWith("no_") && match(r)) ||
          (rules.some((r) => r[1].startsWith("only_")) &&
            !rules.some((r) => r[1].startsWith("only_") && match(r)))
        )
          continue;
        let ns = String(e.to);
        if (this.rules.has(e.to + ":" + e.way)) ns += ":" + e.way + ":" + u;
        const byDistance = this.metric === "distance",
          cost = g + (byDistance ? e.m : e.sec);
        if (cost >= (best.get(ns) ?? Infinity)) continue;
        best.set(ns, cost);
        prev.set(ns, [sid, e.to, e.m, e.way, e.sec]);
        heap.push([
          cost +
            distance(this.data.vertices[e.to], this.data.vertices[end]) /
              (byDistance ? 1 : 26),
          cost,
          e.to,
          e.way,
          u,
          ns,
        ]);
      }
    }
    if (goal === null) {
      this.cache.set(key, null);
      return null;
    }
    let verts = [],
      ways = [],
      metres = 0,
      seconds = 0;
    while (goal !== id0) {
      let [p, u, m, w, sec] = prev.get(goal);
      seconds += sec;
      verts.push(u);
      ways.push(w);
      metres += m;
      goal = p;
    }
    verts.push(start);
    verts.reverse();
    ways.reverse();
    const route = { verts, ways, km: metres / 1000, min: seconds / 60 };
    this.cache.set(key, route);
    return route;
  }
}
