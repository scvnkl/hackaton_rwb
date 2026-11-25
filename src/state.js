let geoMode = "local";
let parcelSize = "small";
let routeMode = "hybrid"; // 'direct' = СЦ 1 -> СЦ 2 -> Конечный ПВЗ; 'hybrid' = СЦ 1 -> Гибридный ПВЗ-склад -> Конечный ПВЗ
let finalPvzId = "yo-1";
let styleMode = "vector";
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
  rub = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " ₽";
const nodeName = (id) =>
  ({
    "sc-1": "СЦ 1 · Медведево",
    "sc-2": "СЦ 2 · Руэм",
    "sc-ch": "СЦ Чебоксары",
  })[id] || PVZ_LIST.find((p) => p.id === id)?.name;
const pathName = (r) => r.ids.map(nodeName).join(" → ");
const volumes = {
  small: [25, 20, 10, 2],
  medium: [40, 30, 20, 7],
  oversize: [90, 45, 40, 18],
};
const stock = new Map();
let runs = {},
  previews = {},
  drawerOpen = false,
  frame = 0,
  elapsed = 0,
  playing = false,
  previous = 0,
  markers = new Map();
