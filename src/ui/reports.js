function addRow(body, values) {
  const row = body.insertRow();
  for (const value of values) row.insertCell().textContent = value;
}
function econTable() {
  const view = el("economics-view").content.cloneNode(true),
    body = view.querySelector("tbody");
  view.querySelector(".rate-note").textContent =
    "Выход машины " +
    rub(CONFIG.exitFee) +
    ", километр " +
    rub(CONFIG.perKm) +
    ", минута " +
    rub(CONFIG.perMin) +
    ", постоянные расходы за смену " +
    rub(CONFIG.shiftFixed) +
    ".";
  const cols = [previews.direct, previews.hybrid];
  function row(label, format) {
    addRow(body, [label, ...cols.map((r) => (r ? format(r) : "—"))]);
  }
  addRow(body, ["Базовый тариф", rub(customerTariff()), rub(customerTariff())]);
  row("К оплате за выбранный маршрут", (r) => rub(r.price));
  const labels = new Set(cols.flatMap((r) => (r ? Object.keys(r.rows) : [])));
  for (const k of labels) row(k, (r) => rub((r.rows[k] || 0) / r.n));
  row("Расходы WB", (r) => rub(r.costs / r.n));
  row("Вклад WB до постоянных расходов", (r) => rub(r.margin / r.n));
  row("Δ вклада WB к классике", (r) =>
    previews.direct
      ? rub(r.margin / r.n - previews.direct.margin / previews.direct.n)
      : "—",
  );
  row("ПВЗ: выдача и оформление возврата", (r) => rub(r.pvzBase / r.n));
  row("ПВЗ: пересортировка", (r) => rub(r.pvzHub / r.n));
  row("Компенсация покупателю (SLA) / оплаченный заказ", (r) =>
    rub(r.compPerOrder),
  );
  row("Расходы продавца", (r) => rub(r.seller.total / r.n));
  row(
    "До прибытия в конечный ПВЗ",
    (r) => Math.round(r.eta - r.start) + " мин",
  );
  row("Путь до выдачи", (r) => r.outKm.toFixed(2) + " км");
  row("Рейс с возвратом", (r) => Math.round(r.end - r.start) + " мин");
  return view;
}
function report() {
  const view = el("shift-view").content.cloneNode(true);
  const classic = metrics("direct", CONFIG.shiftMinutes),
    hybrid = metrics("hybrid", CONFIG.shiftMinutes);
  const difference = Math.round((hybrid.margin - classic.margin) * 100);
  const label = (n) =>
    n.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " ₽";
  let title, reason;
  if (!classic.finished && !hybrid.finished) {
    title = "Ни одна схема не завершает рейс за смену";
    reason =
      "Проверьте вместимость машины, размер партии и длительность рейса.";
  } else if (!difference) {
    const viaHub = runs.hybrid.trips.some((trip) => trip.mode === "hybrid");
    title = viaHub
      ? "Финансовый результат одинаков"
      : "Выберите доставку через СЦ";
    reason = viaHub
      ? "При равном остатке WB ориентируйтесь на число выданных заказов."
      : "Все рейсы гибридного сценария прошли через СЦ. Подключение ПВЗ-хаба при этих условиях не дало выигрыша.";
  } else {
    title =
      difference > 0
        ? "Выберите гибридную схему"
        : "Выберите доставку через СЦ";
    reason =
      (difference > 0
        ? "Гибрид увеличивает остаток WB на "
        : "Через СЦ остаток WB выше на ") +
      label(Math.abs(difference) / 100) +
      ".";
    if (Math.max(hybrid.margin, classic.margin) < 0)
      reason += " Обе схемы убыточны при заданных ставках.";
  }

  view.querySelector("h3").textContent = title;
  view.querySelector(".recommendation p").textContent = reason;
  for (const [key, m] of [
    ["direct", classic],
    ["hybrid", hybrid],
  ]) {
    const name = key === "direct" ? "СЦ" : "Гибрид",
      demand = runs[key].demand;
    view.querySelector('[data-result="' + key + '"]').textContent =
      (key === "direct" ? "Через СЦ" : name) +
      ": " +
      label(m.margin) +
      " · выдано " +
      m.issued +
      " заказов";
    addRow(view.querySelector("tbody"), [
      name,
      demand,
      m.issued + " / " + m.back,
      demand - m.issued,
      rub(m.margin),
    ]);
  }
  return view;
}
function renderAnalyticsDrawer() {
  el("drawerSubtitle").textContent =
    "Сравнение при одинаковом спросе и парке машин";
  el("drawerBodyContent").replaceChildren(econTable(), report());
}
function toggleAnalyticsDrawer() {
  drawerOpen = !drawerOpen;
  el("analyticsDrawer").classList.toggle("open", drawerOpen);
  if (drawerOpen) renderAnalyticsDrawer();
}

function openSummaryModal() {
  el("summaryTopKpis").replaceChildren(report());
  const body = el("summaryTable").tBodies[0];
  body.replaceChildren();
  for (const [key, r] of Object.entries(previews))
    addRow(body, [
      key === "direct" ? "Классика" : "Гибрид",
      r ? pathName(r) : "Доставка недоступна",
      tariffLabel(key),
      r ? rub(r.price) : "—",
    ]);
  el("summaryModal").classList.add("open");
}
function closeSummaryModal() {
  el("summaryModal").classList.remove("open");
}
