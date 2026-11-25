"use strict";
const map = L.map("map", {
  preferCanvas: true,
  zoomControl: false,
  zoomAnimation: false,
}).setView([56.63, 47.9], 13);
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution(
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
);
L.control.zoom({ position: "topright" }).addTo(map);
L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
});
L.control
  .layers(
    null,
    { "Подложка OSM онлайн": tile },
    { position: "topright", collapsed: false },
  )
  .addTo(map);
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  let el = L.DomUtil.create("div", "maplegend");
  el.innerHTML = '<span style="color:#428268">●</span> до 50% &nbsp; <span style="color:#c18422">●</span> 50–80% &nbsp; <span style="color:#cb5646">●</span> от 80% <br>◆ СЦ &nbsp; ━ Груз &nbsp; ┄ Подача';
  return el;
};
legend.addTo(map);
const markers = L.layerGroup().addTo(map),
  lines = L.layerGroup().addTo(map),
  vehicles = L.layerGroup().addTo(map);
let roadLayer = null,
  markerById = new Map();
const project = (ll) => {
  let [lat, lon] = ll;
  let s = Math.sin((Math.min(85, Math.max(-85, lat)) * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
};
const VectorAtlas = L.Layer.extend({
  initialize(data) {
    const verts = data.vertices.map(project);
    const make = (kind, points, name) => {
      let minX = 1,
        minY = 1,
        maxX = 0,
        maxY = 0;
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { kind, points, name, minX, minY, maxX, maxY };
    };
    this.areas = data.areas.map(([k, p]) => make(k, p.map(project)));
    this.roads = data.roads
      .map(([, name, k, , , ids]) =>
        make(
          k,
          ids.map((i) => verts[i]),
          name,
        ),
      )
      .sort((a, b) => this.rank(a.kind) - this.rank(b.kind));
  },
  rank(k) {
    return /primary|trunk|motorway/.test(k)
      ? 4
      : k === "secondary"
        ? 3
        : k === "tertiary"
          ? 2
          : k === "service"
            ? 0
            : 1;
  },
  onAdd(m) {
    this._map = m;
    this.canvas = L.DomUtil.create("canvas", "atlasCanvas leaflet-zoom-hide");
    m.getPane("tilePane").prepend(this.canvas);
    m.on("moveend zoomend resize", this.render, this);
    this.render();
  },
  onRemove(m) {
    m.off("moveend zoomend resize", this.render, this);
    this.canvas.remove();
  },
  render() {
    let m = this._map,
      size = m.getSize(),
      c = this.canvas;
    let pos = m.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(c, pos);
    let d = Math.min(2, devicePixelRatio || 1);
    c.width = size.x * d;
    c.height = size.y * d;
    c.style.width = size.x + "px";
    c.style.height = size.y + "px";
    let g = c.getContext("2d");
    g.scale(d, d);
    const scale = 256 * 2 ** m.getZoom(),
      o = m.project(m.containerPointToLatLng([0, 0])),
      left = o.x / scale,
      top = o.y / scale,
      right = (o.x + size.x) / scale,
      bottom = (o.y + size.y) / scale;
    const visible = (f) =>
      f.minX <= right && f.maxX >= left && f.minY <= bottom && f.maxY >= top;
    const draw = (f) => {
      g.beginPath();
      for (let i = 0; i < f.points.length; i++) {
        let p = f.points[i],
          x = p[0] * scale - o.x,
          y = p[1] * scale - o.y;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
    };
    g.fillStyle = "#ecece4";
    g.fillRect(0, 0, size.x, size.y);
    for (const f of this.areas) {
      if (!visible(f) || (f.kind === "building" && m.getZoom() < 13)) continue;
      draw(f);
      if (f.kind === "river") {
        g.strokeStyle = "#a8cbd2";
        g.lineWidth = 5;
        g.stroke();
      } else {
        g.fillStyle = {
          building: "#d4d3c8",
          park: "#ccdcbf",
          water: "#b4d2d5",
        }[f.kind];
        g.fill();
      }
    }
    g.lineJoin = "round";
    g.lineCap = "round";
    let roads = this.roads.filter(visible),
      z = m.getZoom(),
      mul = Math.max(0.45, Math.min(3, 2 ** ((z - 14) * 0.52)));
    for (const casing of [true, false])
      for (const f of roads) {
        let rank = this.rank(f.kind);
        if (z < 12 && rank < 1) continue;
        draw(f);
        g.lineWidth = (rank + 0.85) * mul + (casing ? 1.4 : 0);
        g.strokeStyle = casing
          ? rank >= 3
            ? "#cfbb99"
            : "#d2d4ca"
          : rank >= 3
            ? "#f7e6bd"
            : "#fffef7";
        g.stroke();
      }
    const taken = new Set(),
      names = new Set();
    g.font = "11px Segoe UI, sans-serif";
    g.textAlign = "center";
    for (let i = roads.length - 1; i >= 0; i--) {
      const f = roads[i];
      if (!f.name || names.has(f.name)) continue;
      let p = f.points[f.points.length >> 1],
        x = p[0] * scale - o.x,
        y = p[1] * scale - o.y,
        cell = Math.floor(x / 115) + ":" + Math.floor(y / 45);
      if (
        x < 40 ||
        x > size.x - 40 ||
        y < 20 ||
        y > size.y - 10 ||
        taken.has(cell)
      )
        continue;
      taken.add(cell);
      names.add(f.name);
      g.lineWidth = 3;
      g.strokeStyle = "#faf9ed";
      g.strokeText(f.name, x, y);
      g.fillStyle = "#75796d";
      g.fillText(f.name, x, y);
    }
  },
});
function setBase(d) {
  if (roadLayer) roadLayer.remove();
  roadLayer = new VectorAtlas(d).addTo(map);
  const [s, w, n, e] = d.bbox;
  map.fitBounds(
    [
      [s, w],
      [n, e],
    ],
    { padding: [8, 8] },
  );
}
function safeUrl(u) {
  try {
    let url = new URL(u);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}
function networkPins(ps, active, selected) {
  markers.clearLayers();
  markerById.clear();
  for (const p of ps) {
    let used = active.has(p.id),
      hub = p.id === selected;
    let marker = hub
      ? L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "hubIcon",
            html: "◆",
            iconSize: [21, 21],
          }),
        })
      : L.circleMarker([p.lat, p.lon], {
          radius: used ? 5 : p.role === "hub" ? 4 : 2.8,
          weight: used ? 1.8 : 0.7,
          color: "#fff",
          fillColor:
            p.role === "hub" ? "#986436" : used ? "#7042ad" : "#8f9692",
          fillOpacity: used ? 1 : 0.7,
        });
    marker.bindPopup(
      () =>
        "<strong>" +
        esc(p.name) +
        "</strong><br>" +
        esc(p.address || p.lat.toFixed(5) + ", " + p.lon.toFixed(5)) +
        "<br>" +
        esc(p.role === "hub" ? "Складской объект" : "Пункт обслуживания") +
        " · привязка к дороге " +
        p.snapMetres +
        " м" +
        stateForPoint(p) +
        '<br><a target="_blank" rel="noopener" href="' +
        esc(safeUrl(p.url)) +
        '">Карточка источника ↗</a> · <button type="button" data-yandex="' + esc(p.id) + '">Яндекс Карты ↗</button>',
    );
    marker.addTo(markers);
    markerById.set(p.id, marker);
  }
}
function tripLines(data, trip, fit) {
  lines.clearLayers();
  vehicles.clearLayers();
  if (!trip) return;
  for (const [ids, empty] of [
    [trip.dead, true],
    [trip.loaded, false],
  ]) {
    if (ids.length < 2) continue;
    const pts = ids.map((i) => data.vertices[i]);
    if (!empty)
      L.polyline(pts, { color: "#fff", weight: 8, opacity: 0.85 }).addTo(lines);
    L.polyline(pts, {
      color: empty ? "#a36f42" : "#62419a",
      weight: empty ? 3 : 5,
      dashArray: empty ? "7 6" : null,
    }).addTo(lines);
  }
  if (fit && trip.loaded.length)
    map.fitBounds(
      L.latLngBounds(
        [...trip.dead, ...trip.loaded].map((i) => data.vertices[i]),
      ),
      { padding: [35, 35], maxZoom: 16 },
    );
}
function truckAt(data, trip, t, clear = true) {
  if (clear) vehicles.clearLayers();
  if (!trip || t < trip.start || t > trip.end) return;
  let empty = t < trip.arrive,
    ids = empty ? trip.dead : trip.loaded;
  let frac = empty
    ? (t - trip.start) / (trip.arrive - trip.start || 1)
    : Math.max(
        0,
        Math.min(1, (t - trip.leave) / (trip.arrival - trip.leave || 1)),
      );
  let line = ids.map((i) => data.vertices[i]);
  if (!line.length) return;
  let total = 0,
    lens = [];
  for (let i = 1; i < line.length; i++) {
    let d = distance(line[i - 1], line[i]);
    total += d;
    lens.push(d);
  }
  let left = frac * total,
    pos = line.at(-1);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i]) {
      let f = left / (lens[i] || 1);
      pos = line[i].map((a, j) => a + (line[i + 1][j] - a) * f);
      break;
    }
    left -= lens[i];
  }
  L.marker(pos, {
    icon: L.divIcon({
      className: "truckIcon",
      html: "▸ " + trip.van,
      iconSize: [32, 19],
    }),
  })
    .bindTooltip("Машина " + trip.van + " · рейс " + trip.id)
    .on("click", () => selectTrip(trip.id - 1, false))
    .addTo(vehicles);
}
