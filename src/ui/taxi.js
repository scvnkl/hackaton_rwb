/* Срочные заказы → попутное такси WB.
 * Если заказ нужно доставить срочно, а ближайший рейс «Газели» не идёт на этот адрес,
 * система предлагает полупустое такси сети WB, которое едет мимо. Логист подтверждает операцию. */
const TAXI = {pickupRub: 99, perKm: 9, pickupMin: 8, kmh: 30}; // попутный тариф: допущение команды
const taxiDone = new Map();
const taxiLog = [];

function urgentOrders() {
  if (!PVZ_LIST.length) return [];
  const picks = [0.17, 0.53, 0.81].map(f => PVZ_LIST[Math.floor(f * PVZ_LIST.length)]).filter(Boolean);
  const times = [70, 220, 370];
  const graph = routerFor(regionId);
  return picks.map((p, i) => {
    const r = graph?.route(SC_NODES.sc1.latlng, p.latlng);
    const km = r ? r.km : haversineM(SC_NODES.sc1.latlng, p.latlng) * 1.35 / 1000;
    const vanMin = r ? r.sec / 60 : km / 25 * 60;
    const taxiMin = TAXI.pickupMin + km / TAXI.kmh * 60;
    const taxiRub = Math.round(TAXI.pickupRub + TAXI.perKm * km);
    // Отдельный выезд «Газели» туда и обратно, если везти машиной.
    const vanRub = Math.round(CONFIG.exitFee + 2 * km * CONFIG.perKm + (2 * vanMin + 10) * CONFIG.perMin);
    const nextVan = runs.hybrid?.trips.find(t => t.start >= times[i]);
    return {id: "u" + i, t: times[i], p, km, taxiMin, taxiRub, vanRub, vanMin: vanMin + 10,
      reason: ["Покупатель оформил срочную доставку", "Повторная доставка после пересорта", "Заказ с истекающим сроком хранения"][i],
      nextVan: nextVan ? clockAt(nextVan.start) : null};
  });
}

function renderTaxi() {
  const box = el("taxiView");
  if (!box || planIssue) return;
  const orders = urgentOrders();
  const savedRub = [...taxiDone.values()].reduce((s, o) => s + (o.vanRub - o.taxiRub), 0);
  const items = orders.map(o => {
    const done = taxiDone.get(o.id);
    const due = elapsed >= o.t;
    const btn = h("button", {class: "btn small primary", type: "button"}, "Подтвердить операцию");
    btn.addEventListener("click", () => {
      const car = "WB-такси " + (100 + Math.floor(o.km * 7) % 900);
      const startMin = Math.max(elapsed, o.t);
      taxiDone.set(o.id, {...o, car, startMin, at: clockAt(startMin), eta: clockAt(startMin + o.taxiMin)});
      taxiLog.unshift(clockAt(Math.max(elapsed, o.t)) + " · " + car + " → " + pvzName(o.p) + " · " + o.taxiRub + " ₽");
      renderTaxi(); updateTaxiMap();
      map.fitBounds([SC_NODES.sc1.latlng, o.p.latlng], {paddingTopLeft: [40, 120], paddingBottomRight: [260, 130], maxZoom: 14});
    });
    const alt = h("button", {class: "btn small", type: "button"}, "Отдельная «Газель»");
    alt.addEventListener("click", () => { taxiDone.set(o.id, {...o, van: true, taxiRub: o.vanRub, at: clockAt(Math.max(elapsed, o.t)), eta: clockAt(Math.max(elapsed, o.t) + o.vanMin)}); renderTaxi(); });
    return h("div", {class: "tx-item" + (done ? " done" : due ? " due" : "")},
      h("div", {class: "tx-top"}, h("b", {}, clockAt(o.t) + " · 1 заказ → " + pvzName(o.p)), h("span", {class: "lg-st " + (done ? "done" : due ? "go" : "plan")}, done ? (done.van ? "Газель" : "Такси назначено") : due ? "Срочно" : "Ожидается")),
      h("small", {}, o.reason + (o.nextVan ? " · ближайший рейс " + o.nextVan + " идёт не на этот адрес" : "")),
      h("div", {class: "tx-cmp"},
        h("div", {class: "tx-opt best"}, h("small", {}, "Попутное такси WB"), h("b", {}, o.taxiRub + " ₽ · " + Math.round(o.taxiMin) + " мин"), h("em", {}, o.km.toFixed(1).replace(".", ",") + " км, водитель едет полупустым")),
        h("div", {class: "tx-opt"}, h("small", {}, "Отдельный выезд «Газели»"), h("b", {}, o.vanRub + " ₽ · " + Math.round(o.vanMin) + " мин"), h("em", {}, "туда и обратно"))),
      done
        ? h("div", {class: "tx-done"}, "✓ " + (done.van ? "Газель отправлена" : done.car + " назначено") + " в " + done.at + " · прибытие ≈ " + done.eta + " · задание в журнале" + (done.van ? "" : " · жёлтый пунктир на карте"))
        : h("div", {class: "tx-btns"}, btn, alt));
  });
  box.replaceChildren(
    h("h4", {class: "lg-title"}, "Срочные заказы → такси WB", h("span", {class: "pill-count"}, String(orders.filter(o => !taxiDone.has(o.id) && elapsed >= o.t).length))),
    h("p", {class: "hint"}, "Срочный заказ не ждёт рейса: система находит полупустое такси сети WB, которое едет мимо, и считает цену и срок против отдельного выезда «Газели». Логист подтверждает операцию."),
    ...items,
    h("div", {class: "tx-sum"}, "Подтверждено: " + taxiDone.size + " из " + orders.length + " · экономия против отдельных выездов " + fmtRub(savedRub)),
    taxiLog.length ? h("small", {class: "hint"}, "Журнал: " + taxiLog.slice(0, 3).join(" · ")) : null,
    h("small", {class: "hint"}, "Попутный тариф такси (" + TAXI.pickupRub + " ₽ подача + " + TAXI.perKm + " ₽/км) — допущение команды, проверяется в пилоте."),
  );
}
