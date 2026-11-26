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
  row("Тариф классики для той же партии", r => rub(r.referencePrice));
  row("Скидка из экономии", r => rub(r.discount));
  row("Доплата за габарит", r => rub(r.premium));
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
  row("ПВЗ-хаб · хранение за счёт продавца", r => rub(r.pvzStorage / r.n));
  row("ПВЗ-хаб · вклад после оплаты труда, до аренды",
    r => rub((r.pvzHub + r.pvzStorage - hubLabour(r)) / r.n));
  row("Продавец · хранение", r => rub(r.seller.storage / r.n));
  row("Продавец · остаток от продажи после логистики", r =>
    rub((CONFIG.sellerGrossPerSale * (r.issued-r.returned) - r.seller.total) / r.n));
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
  if(planIssue){const message=document.createElement("p");message.className="plan-message";message.textContent=planIssue;return message;}
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

  const coverage=coverageFor(el("incident").value);
  if (coverage.complete < coverage.chains.length) {
    const noHybridRoad=coverageFor("none").complete === 1;
    const eligible=hubPool.some(p => calcLoadPct(p)<=CONFIG.network.maxLoadForHub && room(p).litres>=manifest()*volume());
    if(noHybridRoad && eligible && fits() && (parcelCategory()!=="oversize" || el("bulkConsent").checked)){
      title="Недостаточно дорожных данных для сравнения с ПВЗ-хабом";
      reason="В обеих колонках показаны фактически доступные рейсы через СЦ. Обновите дороги для оценки альтернативы.";
    } else {
      reason+=" Сравнение охватывает дорожные цепочки с подтверждённым треком ("+coverage.complete+" из "+coverage.chains.length+" для первого рейса).";
    }
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
      rub(m.pvzStorage),
      rub(m.margin),
    ]);
  }
  const body = view.querySelector("section");
  const service = document.createElement("p");
  const p95 = mode => {
    const value = issuedP95(runs[mode]);
    return value === null ? "—" : value + " мин";
  };
  service.textContent = "p95 от готовности партии до выдачи: СЦ " + p95("direct") +
    ", гибрид " + p95("hybrid") + ".";
  body.append(service);
  const directPaid = classic.issued - classic.back, hybridPaid = hybrid.issued - hybrid.back;
  if (directPaid > 0 && hybridPaid > 0) {
    const directUnit = (classic.margin + CONFIG.shiftFixed) / directPaid;
    const hybridUnit = (hybrid.margin + CONFIG.shiftFixed) / hybridPaid;
    const breakdown = document.createElement("p");
    breakdown.textContent = "Разница результата WB: " + rub((hybridUnit-directUnit)*hybridPaid) +
      " за счёт изменения вклада на заказ и " + rub((hybridPaid-directPaid)*directUnit) +
      " за счёт разницы в оплаченных выдачах.";
    body.append(breakdown);
  }
  return view;
}
function renderAnalyticsDrawer() {
  el("drawerSubtitle").textContent =
    "Сравнение при одинаковом спросе и парке машин";
  el("drawerBodyContent").replaceChildren(...(planIssue ? [report()] : [econTable(),report()]));
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
  el("summaryTable").hidden=Boolean(planIssue);
  if(!planIssue)for (const [key, r] of Object.entries(previews))
    addRow(body, [
      key === "direct" ? "Классика" : "Гибрид",
      r ? pathName(r) : "Доставка недоступна",
      r ? rub(r.referencePrice) : "—",
      r ? rub(r.price) : "—",
    ]);
  el("summaryModal").classList.add("open");
}
function closeSummaryModal() {
  el("summaryModal").classList.remove("open");
}
