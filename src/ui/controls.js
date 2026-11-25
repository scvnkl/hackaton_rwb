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
    else Object.assign(entry, { units: 10, litres: 10 * unit, unit, fee: 0 });
  }
  if (action === "sell" && entry.units >= 2) {
    entry.units -= 2;
    entry.litres = entry.units * entry.unit;
  }
  if (action === "day") entry.fee += entry.units * CONFIG.storagePerBoxDay;
  stock.set(id, entry);
  recalculateAll();
  el("stockStatus").textContent += msg;
}
function recalculateAll() {
  for (const id of ["batch", "dim0", "dim1", "dim2", "kg", "storageDays"]) {
    if (!el(id).checkValidity()) {
      stopClock();
      el(id).reportValidity();
      return;
    }
  }
  for (const id of ["batch", "dim0", "dim1", "dim2", "kg", "storageDays"]) {
    let f = el(id);
    if (!f.reportValidity()) {
      stopClock();
      return;
    }
  }
  stopClock();
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
    "Дорожная сеть OpenStreetMap · учебный пилот · координаты СЦ 1 и СЦ 2 приблизительные";
  el("mDirectKm").textContent = previews.direct
    ? previews.direct.outKm.toFixed(2) + " км"
    : "—";
  el("mHybridKm").textContent = h ? h.outKm.toFixed(2) + " км" : "—";
  el("mFinalLoad").textContent = calcLoadPct(final) + "%";
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
  const list =
    geoMode === "local"
      ? PVZ_LIST.filter((p) => p.city === "Йошкар-Ола")
      : PVZ_LIST.filter((p) => p.city === "Чебоксары");

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
  recalculateAll();
}

function setGeo(g) {
  geoMode = g;
  document.getElementById("geoLocal").classList.toggle("active", g === "local");
  document
    .getElementById("geoInter")
    .classList.toggle("active", g === "intercity");
  populateSelect();
  if (g === "local") {
    map.setView([56.635, 47.845], 12);
  } else {
    map.fitBounds(
      [
        [56.06, 47.15],
        [56.67, 47.96],
      ],
      { padding: [40, 40] },
    );
  }
  recalculateAll();
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
  if (m === "vector") {
    if (map.hasLayer(satLayer)) map.removeLayer(satLayer);
  } else {
    if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
    satLayer.addTo(map);
    satLayer.redraw();
  }
  setTimeout(() => map.invalidateSize(), 100);
}
