let geoMode = "local";
let routeMode = "hybrid"; // 'direct' = СЦ 1 -> СЦ 2 -> Конечный ПВЗ; 'hybrid' = СЦ 1 -> Гибридный ПВЗ-склад -> Конечный ПВЗ
let finalPvzId = "yo-1";
let styleMode = "2gis";
let activeChain = {
  scStart: SC_NODES.sc1,
  scMid: SC_NODES.sc2,
  hubPvz: null,
  finalPvz: null,
  directKm: 0,
  hybridKm: 0,
};
const el = (id) => document.getElementById(id),
  val = (id) => Number(el(id).value),
  rub = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
const pvzName = p => p ? (p.label || p.name) : "";
const nodeName = id => {
  const depot = Object.values(SC_NODES).find(p => p.id === id);
  return depot ? depot.label.replace(/\n/g, " · ") : pvzName(cityById.get(id));
};
const pathName = (r) => r.ids.map(nodeName).join(" → ");
const volumes = {
  small: [25, 20, 10, 2],
  medium: [40, 30, 20, 7],
  oversize: [90, 45, 40, 18],
};
const stock = new Map();
let planIssue = "";
let runs = {},
  previews = {},
  drawerOpen = false,
  frame = 0,
  elapsed = 0,
  playing = false,
  previous = 0,
  markers = new Map();
