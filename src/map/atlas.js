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
