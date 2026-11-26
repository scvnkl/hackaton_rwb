const pilotNodes = structuredClone(SC_NODES);
const pilotPoints = PVZ_LIST.slice();
let regionId = "yoshkar-ola";
let networkPoints = [];
let cityById = new Map();
let hubPool = [];
let savedDestinations = new Set();
let roadGeneration = 0;
let catalogGeneration = 0;
const regionStock = new Map();

function samePlace(a, b) {
  return a.brand === b.brand && haversineM(a.latlng, b.latlng) <= 30;
}

function prepareNetwork(key, catalog) {
  const original = pilotPoints.filter(p => ["yoshkar-ola","cheboksary"].includes(key) && p.city === catalog.city)
    .map(p => ({...p, brand: "wb", origin:"Пилот v12"}));
  const points = original.slice();
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
    const archive = ["yoshkar-ola","cheboksary"].includes(key);
    const origin = archive && row.id.startsWith("wildberries-") ? "Пункты выдачи · архив Mesh Atlas" :
      catalog.source || "OpenStreetMap · ODbL";
    const p = {...row, city: catalog.city, origin};
    if (ids.has(p.id) || nearby(p.latlng).some(other => samePlace(p, other))) continue;
    ids.add(p.id);
    points.push(p);
    index(p);
  }
  const wb=points.filter(p=>p.brand==="wb");
  if(!wb.length)throw Error("После объединения в справочнике нет ни одного ПВЗ Wildberries.");
  return {points,wb};
}

// «Wildberries · 56.1, 47.2» → «WB · Ленинский проспект»: подпись по ближайшей улице графа.
function humanizeNames(key, points){
  const graph = routerFor(key);
  const used = new Map();
  const tidy = typeof tidyAddress === "function" ? tidyAddress : s => s;
  for (const p of points) {
    if (p.brand !== "wb" || p.label) continue;
    const raw = /^(Вайлдберриз|Wildberries)\s*·/i.test(p.name) || /\d+\.\d+,\s*\d+\.\d+$/.test(p.name) || /node\/|way\//.test(p.name);
    let label = tidy(p.name.replace(/^(Йошкар-Ола|Чебоксары|Казань|Москва),\s*/,"").trim());
    if (raw) {
      // Пока адрес не пришёл из геокодера — ближайшая улица из графа, без координат.
      p.needsAddress = true;
      const street = graph?.streetNear(p.latlng, 900);
      label = street ? tidy(street) + ", рядом" : "ПВЗ WB · адрес уточняется";
    }
    p.baseLabel = label;
    if (raw && typeof cachedAddress === "function" && cachedAddress(p)) label = p.address;
    const n = (used.get(label) || 0) + 1;
    used.set(label, n);
    p.label = n > 1 ? label + " (" + n + ")" : label;
  }
}

function setNetwork(key, prepared=prepareNetwork(key,REGION_CATALOGS[key])){
  humanizeNames(key, prepared.wb);
  networkPoints=prepared.points;
  PVZ_LIST.splice(0,PVZ_LIST.length,...prepared.wb);
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

// Показываем весь рейс: СЦ-1, СЦ-2 и конечный ПВЗ, с отступами под панели карты.
function fitRoute(){
  const pts=[SC_NODES.sc1.latlng,SC_NODES.sc2.latlng,cityById.get(finalPvzId)?.latlng].filter(Boolean);
  if(geoMode==="intercity")pts.push(SC_NODES.ch.latlng);
  map.fitBounds(pts,{paddingTopLeft:[40,110],paddingBottomRight:[260,120],maxZoom:14});
}

function configureRegion(key, catalog=REGION_CATALOGS[key]) {
  // Prepare and validate before changing a single field of the displayed region.
  const prepared=prepareNetwork(key,catalog);
  ++catalogGeneration;
  citySearch?.abort();
  el("importStatus").textContent = "";
  if(REGION_CATALOGS[key]!==catalog){
    REGION_CATALOGS[key]=catalog;
    regionOptions();
  }
  const prior = regionId;
  regionStock.set(prior, new Map(stock));
  stock.clear();
  for (const [id, entry] of regionStock.get(key) || []) stock.set(id, entry);
  regionId = key;
  geoMode = key === "cheboksary" ? "intercity" : "local";
  setNetwork(key,prepared);
  Object.assign(SC_NODES, structuredClone(pilotNodes));
  if (catalog.depots?.length === 2) {
    for (const [i, k] of ["sc1", "sc2"].entries()) {
      SC_NODES[k] = {...SC_NODES[k], latlng: catalog.depots[i], label: "СЦ " + (i + 1),
        tooltip: "Сценарный СЦ " + (i + 1) + " · " + catalog.city};
    }
  }
  finalPvzId = catalog.defaultId && cityById.has(catalog.defaultId) ? catalog.defaultId : PVZ_LIST[0].id;
  populateSelect();
  el("stockPoint").replaceChildren(...PVZ_LIST.map(p => new Option(pvzName(p), p.id)));
  el("regionSelect").value = key;
  el("geoLocal").classList.toggle("active", key === "yoshkar-ola");
  el("geoInter").classList.toggle("active", key === "cheboksary");
  const counts = {wb:0, ozon:0, ym:0};
  for (const p of networkPoints) counts[p.brand]++;
  el("catalogStatus").textContent = catalog.city + " · WB " + counts.wb + " · Ozon " + counts.ozon +
    " · Яндекс Маркет " + counts.ym + " · " + [...new Set(networkPoints.map(p=>p.origin))].join(" / ") + " · срез "+catalog.date + ". Маршруты строятся по улицам " + (routerFor(key) ? "офлайн-графом OSM." : "онлайн-сервисом с оценкой при сбое.");
  el("presetCaption").textContent = "";
  document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("active"));
  setStyleMode(styleMode);
  fitRoute();
  refreshDestination();
}

function validateCatalog(input) {
  if(!input || typeof input.city!=="string" || !input.city.trim() || !Array.isArray(input.points) || !input.points.length)
    throw Error("Нужны название города и массив points.");
  const validPosition=p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite) &&
    Math.abs(p[0])<85 && Math.abs(p[1])<=180;
  const ids=new Set(["sc-1","sc-2","sc-ch"]);
  const points=input.points.map(p=>{
    if(!p || !["wb","ozon","ym"].includes(p.brand) || typeof p.id!=="string" || !p.id.trim() ||
        typeof p.name!=="string" || !p.name.trim() || !validPosition(p.latlng))
      throw Error("Проверьте ID, бренд, название и координаты каждой точки.");
    const id=p.id.trim();
    if(ids.has(id))throw Error("ID «"+id+"» повторяется или зарезервирован для СЦ. У каждой точки должен быть свой ID.");
    ids.add(id);
    return {id,brand:p.brand,name:p.name.trim(),latlng:p.latlng};
  });
  const wb=points.find(p=>p.brand==="wb");
  if(!wb)throw Error("В справочнике нет конечного пункта WB.");
  const [lat,lon]=wb.latlng;
  const depots=input.depots??[[lat,lon-0.028],[lat+0.008,lon-0.014]];
  if(!Array.isArray(depots)||depots.length!==2||!depots.every(validPosition))throw Error("Укажите координаты двух СЦ.");
  return {city:input.city.trim(),points,depots,defaultId:input.defaultId,
    boundary:typeof input.boundary==="string"?input.boundary:undefined,
    source:typeof input.source==="string"&&input.source.trim()?input.source.trim():"Импорт команды",
    date:typeof input.date==="string"?input.date:"дата неизвестна"};
}
