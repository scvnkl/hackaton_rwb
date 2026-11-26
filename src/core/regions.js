const pilotNodes = structuredClone(SC_NODES);
const pilotPoints = PVZ_LIST.slice();
let regionId = "yoshkar-ola";
let networkPoints = [];
let cityById = new Map();
let hubPool = [];
let neighborhood;
let roadGeneration = 0;
const regionStock = new Map();

function samePlace(a, b) {
  return a.brand === b.brand && haversineM(a.latlng, b.latlng) <= 30;
}

function setNetwork(key) {
  const catalog = REGION_CATALOGS[key];
  const original = pilotPoints.filter(p => ["yoshkar-ola","cheboksary"].includes(key) && p.city === catalog.city)
    .map(p => ({...p, brand: "wb"}));
  networkPoints = original.slice();
  const ids = new Set(original.map(p => p.id));
  const grid = new Map();
  const cell = ([lat, lon]) => [Math.floor(lat * 400), Math.floor(lon * 200)];
  function nearby(pos) {
    const [y, x] = cell(pos);
    const neighbors = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        neighbors.push(...(grid.get([y + i, x + j].join()) || []));
    return neighbors;
  }
  function index(p) {
    const key = cell(p.latlng).join();
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  original.forEach(index);
  for (const row of catalog.points) {
    const p = {...row, city: catalog.city};
    if (ids.has(p.id) || nearby(p.latlng).some(other => samePlace(p, other))) continue;
    ids.add(p.id);
    networkPoints.push(p);
    index(p);
  }
  PVZ_LIST.splice(0, PVZ_LIST.length, ...networkPoints.filter(p => p.brand === "wb"));
  cityById = new Map(PVZ_LIST.map(p => [p.id, p]));
  rebuildDensity(networkPoints);
}

function candidatePoints() {
  const final = cityById.get(finalPvzId);
  const start = geoMode === "intercity" ? SC_NODES.ch : SC_NODES.sc1;
  const others = PVZ_LIST.filter(p => p.id !== finalPvzId);
  const distance = p => haversineM(start.latlng, p.latlng) + haversineM(p.latlng, final.latlng);
  const ranked = others.map(p => [p, distance(p)]).sort((a,b) => a[1] - b[1]);
  // Проверяем дорожную стоимость коридора и все узлы архивного тестового рейса.
  const base = others.filter(p => pilotPoints.some(legacy => p.id === legacy.id));
  const available = ranked.filter(([p]) => calcLoadPct(p) <= CONFIG.network.maxLoadForHub);
  for (const [p] of [...ranked.slice(0,5), ...available.slice(0,5)]) if (!base.includes(p)) base.push(p);
  return base;
}

function configureRegion(key) {
  citySearch?.abort();
  const catalog = REGION_CATALOGS[key];
  const prior = regionId;
  regionStock.set(prior, new Map(stock));
  stock.clear();
  for (const [id, entry] of regionStock.get(key) || []) stock.set(id, entry);
  regionId = key;
  geoMode = key === "cheboksary" ? "intercity" : "local";
  setNetwork(key);
  Object.assign(SC_NODES, structuredClone(pilotNodes));
  if (catalog.depots?.length === 2) {
    for (const [i, k] of ["sc1", "sc2"].entries()) {
      SC_NODES[k] = {...SC_NODES[k], latlng: catalog.depots[i], label: "СЦ " + (i + 1),
        tooltip: "Сценарный СЦ " + (i + 1) + " · " + catalog.city};
    }
  }
  finalPvzId = catalog.defaultId && cityById.has(catalog.defaultId) ? catalog.defaultId : PVZ_LIST[0].id;
  populateSelect();
  el("stockPoint").replaceChildren(...PVZ_LIST.map(p => new Option(p.name, p.id)));
  el("regionSelect").value = key;
  el("geoLocal").classList.toggle("active", key === "yoshkar-ola");
  el("geoInter").classList.toggle("active", key === "cheboksary");
  const counts = {wb:0, ozon:0, ym:0};
  for (const p of networkPoints) counts[p.brand]++;
  el("catalogStatus").textContent = catalog.city + " · WB " + counts.wb + " · Ozon " + counts.ozon +
    " · Яндекс Маркет " + counts.ym + " · " + (catalog.source || "OSM + справочник v12") + " · " + catalog.date;
  el("presetCaption").textContent = "";
  document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("active"));
  setStyleMode(styleMode);
  if (key === "cheboksary") map.fitBounds([SC_NODES.sc1.latlng, cityById.get(finalPvzId).latlng], {padding:[40,40]});
  else map.setView(cityById.get(finalPvzId).latlng, key === "yoshkar-ola" ? 13 : 14);
  refreshDestination();
}

function validateCatalog(input) {
  if (!input || typeof input.city !== "string" || !input.city.trim() ||
      !Array.isArray(input.points) || !input.points.length)
    throw Error("Нужны название города и массив points.");
  const validPosition = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
    Math.abs(p[0]) < 85 && Math.abs(p[1]) <= 180;
  if (!input.points.every(p => p && ["wb","ozon","ym"].includes(p.brand) && typeof p.id === "string" &&
      !["sc-1","sc-2","sc-ch"].includes(p.id) && typeof p.name === "string" && validPosition(p.latlng)))
    throw Error("Проверьте id, бренд, название и координаты каждой точки.");
  const wb = input.points.filter(p => p.brand === "wb");
  if (!wb.length) throw Error("В справочнике нет конечного пункта WB.");
  if (input.depots && !(input.depots.length === 2 && input.depots.every(validPosition)))
    throw Error("Нужны две координаты сценарных СЦ.");
  if (!input.depots) {
    // Только для эксперимента. Смещения не выдаются за координаты складов WB.
    const [lat, lon] = wb[0].latlng;
    input.depots = [[lat, lon - 0.028],[lat + 0.008, lon - 0.014]];
    if (!input.depots.every(validPosition)) throw Error("Укажите координаты двух СЦ.");
  }
  return {...input, source: input.source || "Импорт команды", date: input.date || "дата неизвестна"};
}
