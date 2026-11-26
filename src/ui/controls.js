function storeAction(action) {
  const id = el("stockPoint").value,
    entry = inventory(id),
    unit = volume();
  let msg = "";
  if (action === "receive") {
    if (
      entry.units ||
      !fits() ||
      room(PVZ_LIST.find((x) => x.id === id)).litres < unit * 10
    )
      msg =
        "Отказ: партия уже на полке, недостаточно места или превышены габариты.";
    else Object.assign(entry, { units: 10, litres: 10 * unit, unit });
  }
  if (action === "sell" && entry.units >= 2) {
    entry.units -= 2;
    entry.litres = entry.units * entry.unit;
  }
  if (action === "day") entry.fee += entry.units * CONFIG.storagePerBoxDay;
  stock.set(id, entry);
  updateParameters();
  el("stockStatus").textContent += msg;
}
function updateParameters() {
  const next = candidatePoints();
  if (next.length !== hubPool.length || next.some((p,i) => hubPool[i] !== p)) refreshDestination();
  else recalculateAll();
}
function recalculateAll() {
  for (const id of ["batch", "dim0", "dim1", "dim2", "kg", "storageDays"]) {
    let f = el(id);
    if (!f.reportValidity()) {
      stopClock();
      return;
    }
  }
  stopClock();
  el("bulkConsentRow").hidden = parcelSize !== "oversize";
  elapsed = 0;
  const final = PVZ_LIST.find((p) => p.id === finalPvzId);
  activeChain.finalPvz = final;
  let n = manifest();
  for (let mode of ["direct", "hybrid"]) {
    previews[mode] = n ? choose(mode, n, 0, el("incident").value, []) : null;
    runs[mode] = schedule(mode);
  }
  const r = previews[routeMode],
    h = previews.hybrid;
  activeChain.hubPvz = h?.hub;
  activeChain.directKm = previews.direct?.outKm;
  activeChain.hybridKm = h?.outKm;
  el("headerSubStatus").textContent =
    "Диспетчер WB · модель смены · координаты СЦ сценарные";
  el("mDirectKm").textContent = previews.direct
    ? previews.direct.outKm.toFixed(2) + " км"
    : "—";
  el("mHybridKm").textContent = h ? h.outKm.toFixed(2) + " км" : "—";
  el("mFinalLoad").textContent = calcLoadPct(final) + "%";
  const {counts,nearest} = neighborhood;
  const available = room(final);
  el("loadDetail").textContent = "В 1,6 км от выбранного ПВЗ: WB " + counts.wb + ", Ozon " +
    counts.ozon + ", Яндекс Маркет " + counts.ym + ". Ближайший сосед: " +
    (Number.isFinite(nearest) ? Math.round(nearest) + " м" : "нет в справочнике") +
    ". Модельная загрузка " + calcLoadPct(final) + "%, свободно " + Math.round(available.litres) + " л.";
  el("priceDirect").textContent = tariffLabel("direct");
  el("priceHybrid").textContent = tariffLabel("hybrid");
  el("metaHybrid").textContent = !h
    ? "Доставка недоступна"
    : h.mode === "direct"
      ? "Эта партия поедет через СЦ за " +
        rub(h.price) +
        " / заказ. " +
        h.reason +
        "."
      : "К оплате с учётом SLA: " + rub(h.price) + " / заказ.";
  el("chainExplanation").textContent = r
    ? pathName(r) + (r.reason ? " · " + r.reason : "")
    : "Недостаточная вместимость или дорожный маршрут недоступен";
  el("costSplitCard").replaceChildren(econTable());
  el("ordersCountLabel").textContent =
    Math.round((140 * val("flowSlider")) / 100) + " зак/ч";
  el("shelfValue").textContent = val("shelfSlider") - 100 + " п.п.";
  el("flowLabel").textContent = val("flowSlider") / 100 + "×";
  el("truckCountLabel").textContent = val("truckCountSlider");
  for (const [id, m] of [
    ["optDirect", "direct"],
    ["optHybrid", "hybrid"],
  ])
    el(id).classList.toggle("active", m === routeMode);
  const inv = inventory(el("stockPoint").value);
  el("stockStatus").textContent =
    "Остаток " +
    inv.units +
    " шт. · " +
    inv.litres +
    " л · начислено ПВЗ за счёт продавца " +
    rub(inv.fee) +
    ". ";
  renderMarkers();
  plot();
  updateClock();
  if (drawerOpen) renderAnalyticsDrawer();
}

function populateSelect() {
  const list = PVZ_LIST;
  el("finalPvzSelect").replaceChildren(
    ...list.map(
      (p) => new Option("Конечный ПВЗ (" + p.city + "): " + p.name, p.id),
    ),
  );

  if (!list.some((p) => p.id === finalPvzId)) {
    finalPvzId = list[0].id;
  }
  document.getElementById("finalPvzSelect").value = finalPvzId;
}

function onFinalPvzChange() {
  finalPvzId = document.getElementById("finalPvzSelect").value;
  refreshDestination();
}

function setGeo(g) {
  configureRegion(g === "intercity" ? "cheboksary" : "yoshkar-ola");
}

function setSize(sz) {
  parcelSize = sz;
  volumes[sz].forEach((v, i) => (el(i === 3 ? "kg" : "dim" + i).value = v));
  document
    .querySelectorAll("#sizeGroup .seg-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.size === sz));
  recalculateAll();
}

function setRouteMode(rm) {
  if (!["direct", "hybrid"].includes(rm)) return;
  routeMode = rm;
  document
    .getElementById("optDirect")
    .classList.toggle("active", rm === "direct");
  document
    .getElementById("optHybrid")
    .classList.toggle("active", rm === "hybrid");
  recalculateAll();
}

function setStyleMode(m) {
  styleMode = m;
  document.getElementById("btnVec").classList.toggle("active", m === "vector");
  document
    .getElementById("btnSat")
    .classList.toggle("active", m === "satellite");
  const nativeAtlas = ["yoshkar-ola","cheboksary"].includes(regionId);
  if (REGION_STREETS[regionId] && !regionAtlases.has(regionId))
    regionAtlases.set(regionId, new VectorAtlas(REGION_STREETS[regionId]));
  const background = nativeAtlas ? localAtlas : regionAtlases.get(regionId);
  const visible = m === "satellite" ? [satLayer] : [background, nativeAtlas ? null : streetLayer].filter(Boolean);
  for (const layer of [satLayer, streetLayer, localAtlas, ...regionAtlases.values()]) {
    if (!visible.includes(layer)) map.removeLayer(layer);
  }
  for (const layer of visible) layer.addTo(map);
  setTimeout(() => map.invalidateSize(), 100);
}
