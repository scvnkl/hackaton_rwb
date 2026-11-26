/* Пояснения к расчёту: вкладки, редактор тарифов, разбор решения по партии,
 * итоги смены (партии/коробки через ПВЗ и СЦ-2, пробег, нагрузка хабов) и граница выгодности. */
const fmtInt = n => Math.round(n).toLocaleString("ru-RU");
const fmtRub = n => fmtInt(n) + " ₽";
const signRub = n => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtInt(Math.abs(n)) + " ₽";
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

/* ---------- вкладки ---------- */
for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => {
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t === tab);
  for (const p of document.querySelectorAll(".tab-pane")) p.classList.toggle("active", p.dataset.pane === tab.dataset.tab);
  document.querySelector(".side").scrollTop = 0;
});

/* ---------- редактор тарифов (финмодель) ---------- */
const TARIFFS = [
  {key: "hubPerBox", label: "Выплата ПВЗ-хабу, ₽/коробка", get: () => CONFIG.hubPerBox.small,
    set: v => { for (const k in CONFIG.hubPerBox) CONFIG.hubPerBox[k] = v; }},
  {key: "sc2PerBox", label: "Сортировка на СЦ-2, ₽/коробка", get: () => CONFIG.sc2PerBox, set: v => CONFIG.sc2PerBox = v},
  {key: "perKm", label: "Пробег, ₽/км", get: () => CONFIG.perKm, set: v => CONFIG.perKm = v},
  {key: "perMin", label: "Машина и водитель, ₽/мин", get: () => CONFIG.perMin, set: v => CONFIG.perMin = v},
  {key: "exitFee", label: "Выход машины, ₽/рейс", get: () => CONFIG.exitFee, set: v => CONFIG.exitFee = v},
  {key: "finalPvzPerBox", label: "Выдача в ПВЗ, ₽/заказ", get: () => CONFIG.finalPvzPerBox, set: v => CONFIG.finalPvzPerBox = v},
  {key: "hubWorkPerMin", label: "Труд сотрудника ПВЗ, ₽/мин", get: () => CONFIG.hubWorkPerMin, set: v => CONFIG.hubWorkPerMin = v},
  {key: "maxLoad", label: "Порог загрузки хаба, %", get: () => CONFIG.network.maxLoadForHub, set: v => CONFIG.network.maxLoadForHub = v},
];
const TARIFF_DEFAULTS = Object.fromEntries(TARIFFS.map(t => [t.key, t.get()]));
function renderTariffs() {
  el("tariffGrid").replaceChildren(...TARIFFS.map(t => {
    const input = h("input", {type: "number", min: "0", step: t.key === "perMin" ? "0.1" : "1", id: "cfg-" + t.key});
    input.value = t.get();
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < 0) return;
      t.set(v);
      input.classList.toggle("changed", v !== TARIFF_DEFAULTS[t.key]);
      updateParameters();
    });
    return h("label", {class: "field"}, h("span", {}, t.label), input);
  }));
}
renderTariffs();
el("resetTariffs").addEventListener("click", () => {
  for (const t of TARIFFS) t.set(TARIFF_DEFAULTS[t.key]);
  renderTariffs();
  updateParameters();
});

/* ---------- разбор решения по первой партии ---------- */
function hubDiagnostics() {
  const n = manifest(), incident = el("incident").value, days = val("storageDays");
  const base = trip("direct", null, n, 0, incident, days);
  if (!base) return null;
  const sizeOk = fits();
  const consentOk = parcelCategory() !== "oversize" || el("bulkConsent").checked;
  const rows = [];
  for (const p of hubPool) {
    const r = trip("hybrid", p, n, 0, incident, days);
    if (!r) continue;
    const arrival = r.res.find(v => v.work > 0)?.a ?? 0;
    const load = calcLoadPct(p, 0);
    const shelf = room(p, 0);
    const need = n * volume();
    const work = r.res.reduce((s, v) => s + v.work, 0);
    priceHybrid(r, base);
    const checks = [
      {ok: sizeOk, text: "Габариты коробки проходят в ячейку"},
      {ok: consentOk, text: "Согласие покупателя на габарит", hide: parcelCategory() !== "oversize"},
      {ok: load <= CONFIG.network.maxLoadForHub, text: "Загрузка " + load + "% ≤ порога " + CONFIG.network.maxLoadForHub + "%"},
      {ok: need <= shelf.litres, text: "Место на полке: нужно " + fmtInt(need) + " л, свободно " + fmtInt(shelf.litres) + " л"},
      {ok: work <= shelf.minutes + 1e-9 && canReserve(p, r.res, []), text: "Сотрудник успевает: " + work.toFixed(1) + " из " + fmtInt(shelf.minutes) + " свободных мин/ч"},
      {ok: !slaBreach(r.eta - base.eta), text: "Срок: " + signMin(r.eta - base.eta) + " к базовой схеме (допуск +" + CONFIG.sla.maxExtraMin + " мин)"},
      {ok: r.pvzHub + r.pvzStorage >= hubLabour(r), text: "ПВЗ в плюсе: выплата " + fmtRub(r.pvzHub) + " ≥ труд " + fmtRub(hubLabour(r))},
      {ok: r.margin >= base.margin, text: "Дешевле СЦ-2 для WB: " + signRub(r.margin - base.margin) + " на партию"},
    ].filter(c => !c.hide);
    rows.push({p, r, checks, passed: checks.every(c => c.ok), delta: r.margin - base.margin, arrival});
  }
  rows.sort((a, b) => (b.passed - a.passed) || (b.delta - a.delta));
  return {base, rows};
}
const signMin = m => (m >= 0 ? "+" : "−") + Math.abs(Math.round(m)) + " мин";

function renderDecision() {
  const box = el("decisionCard");
  if (planIssue) { box.replaceChildren(); return; }
  const d = hubDiagnostics();
  if (!d || !d.rows.length) {
    box.replaceChildren(h("div", {class: "decision-head bad"}, "Нет ПВЗ по пути с маршрутом — партия идёт через СЦ-2"));
    return;
  }
  const best = d.rows[0];
  const ok = d.rows.filter(r => r.passed).length;
  const head = best.passed
    ? h("div", {class: "decision-head good"}, h("b", {}, "✓ Партия идёт через ПВЗ-хаб"), h("span", {}, pvzName(best.p)), h("em", {}, "экономия " + fmtRub(best.delta) + " на партию · срок " + deltaMin(best.r.eta - d.base.eta) + " · рейс " + deltaMin((best.r.end - best.r.start) - (d.base.end - d.base.start))))
    : h("div", {class: "decision-head bad"}, h("b", {}, "✕ Партия идёт через СЦ-2"), h("span", {}, "лучший кандидат: " + pvzName(best.p)), h("em", {}, best.checks.find(c => !c.ok)?.text || ""));
  box.replaceChildren(
    head,
    h("ul", {class: "checklist"}, best.checks.map(c => h("li", {class: c.ok ? "ok" : "no"}, c.text))),
    h("div", {class: "hint"}, "Проверено ПВЗ по пути: " + d.rows.length + " · прошли все условия: " + ok + ". Правило: хаб выбирается, если проходит все ограничения и даёт WB больше, чем СЦ-2."),
  );
}

/* ---------- живые KPI ---------- */
function renderLiveExtras() {
  const run = runs[routeMode];
  if (!run) { el("stSplit").textContent = "—"; return; }
  let hub = 0, sc = 0;
  for (const r of run.trips) if (r.start <= elapsed) (r.mode === "hybrid" ? hub++ : sc++);
  el("stSplit").textContent = hub + " / " + sc;
}

/* ---------- итоги смены ---------- */
function shiftStats(mode) {
  const run = runs[mode];
  const s = {trips: run.trips.length, viaHub: 0, viaSc: 0, boxesHub: 0, boxesSc: 0, km: 0, minutes: 0, costs: 0, hubs: new Map()};
  for (const r of run.trips) {
    s.km += r.km; s.minutes += r.end - r.start; s.costs += r.costs;
    if (r.mode === "hybrid") {
      s.viaHub++; s.boxesHub += r.n;
      const row = s.hubs.get(r.hub.id) || {p: r.hub, batches: 0, boxes: 0, pay: 0, work: 0, litres: 0};
      row.batches++; row.boxes += r.n; row.pay += r.pvzHub + r.pvzStorage; row.work += hubLabour(r) / CONFIG.hubWorkPerMin;
      row.litres = Math.max(row.litres, r.n * volume());
      s.hubs.set(r.hub.id, row);
    } else { s.viaSc++; s.boxesSc += r.n; }
  }
  return s;
}

function kpiTile(label, value, sub, tone = "") {
  return h("div", {class: "big-kpi " + tone}, h("small", {}, label), h("b", {}, value), sub ? h("em", {}, sub) : null);
}

function renderSummaryExtras() {
  const hero = el("summaryHero"), hubs = el("hubLoadTable");
  if (planIssue || !runs.direct || !runs.hybrid) { hero.replaceChildren(); hubs.replaceChildren(); return; }
  const A = shiftStats("direct"), B = shiftStats("hybrid");
  const mA = metrics("direct", CONFIG.shiftMinutes), mB = metrics("hybrid", CONFIG.shiftMinutes);
  const saved = mB.margin - mA.margin;
  const tA = timeStats("direct"), tB = timeStats("hybrid");
  const p95A = issuedP95(runs.direct), p95B = issuedP95(runs.hybrid);
  const baseCost = A.costs + CONFIG.shiftFixed;
  const pct = baseCost ? saved / baseCost * 100 : 0;
  hero.replaceChildren(
    kpiTile("Эффект для WB за смену", signRub(saved), (pct >= 0 ? "−" : "+") + Math.abs(pct).toFixed(1) + "% к затратам базовой схемы", saved >= 0 ? "good" : "bad"),
    kpiTile("Партий через ПВЗ / СЦ-2", B.viaHub + " / " + B.viaSc, fmtInt(B.boxesHub) + " коробок обошли СЦ-2"),
    kpiTile("Пробег машин", fmtInt(B.km) + " км", signKm(B.km - A.km) + " к базовой (" + fmtInt(A.km) + " км)"),
    kpiTile("Доставка партии: выезд → выдача", tB.trip === null ? "—" : mins(tB.trip), tA.trip === null || tB.trip === null ? "" : deltaMin(tB.trip - tA.trip) + " к базовой (" + mins(tA.trip) + ")", tA.trip !== null && tB.trip !== null && tB.trip < tA.trip ? "good-soft" : ""),
    kpiTile("Срок с ожиданием машины", tB.avg === null ? "—" : mins(tB.avg), (tA.avg === null || tB.avg === null ? "" : "среднее " + deltaMin(tB.avg - tA.avg) + " к базовой · ") + "p95 " + (p95B === null ? "—" : mins(p95B)) + " (было " + (p95A === null ? "—" : mins(p95A)) + ")"),
    kpiTile("Машино-время за смену", fmtInt(B.minutes) + " мин", signMinPlain(B.minutes - A.minutes) + " к базовой · " + (tB.perOrder ? tB.perOrder.toFixed(1) : "—") + " мин/заказ (было " + (tA.perOrder ? tA.perOrder.toFixed(1) : "—") + ")"),
    kpiTile("Выдано заказов", mB.issued + "", (mB.issued - mA.issued >= 0 ? "+" : "") + (mB.issued - mA.issued) + " к базовой (" + mA.issued + ")"),
    kpiTile("Заработали ПВЗ-хабы", fmtRub(mB.pvzHub + mB.pvzStorage), "за пересортировку и хранение"),
  );
  if (!B.hubs.size) { hubs.replaceChildren(h("p", {class: "hint"}, "Ни одна партия не ушла через ПВЗ: при текущих условиях СЦ-2 выгоднее или хабы не прошли ограничения.")); return; }
  const table = h("table", {class: "summary-table compact"},
    h("thead", {}, h("tr", {}, ["ПВЗ-хаб", "Партий", "Коробок", "Работа, мин", "Пик полки", "Заработок"].map(t => h("th", {}, t)))),
    h("tbody", {}, [...B.hubs.values()].sort((a, b) => b.boxes - a.boxes).map(r => h("tr", {},
      h("td", {}, pvzName(r.p)), h("td", {}, r.batches + ""), h("td", {}, r.boxes + ""), h("td", {}, r.work.toFixed(0)),
      h("td", {}, h("span", {class: "bar"}, h("i", {style: "width:" + Math.min(100, r.litres / CONFIG.shelfLitres * 100) + "%"})), " " + fmtInt(r.litres) + " л"),
      h("td", {}, fmtRub(r.pay))))));
  hubs.replaceChildren(table);
}
const signKm = k => (k > 0 ? "+" : k < 0 ? "−" : "") + fmtInt(Math.abs(k)) + " км";
const signMinPlain = m => (m > 0 ? "+" : m < 0 ? "−" : "") + fmtInt(Math.abs(m)) + " мин";

/* ---------- граница выгодности (sweep) ---------- */
let lastSweep = null;
function sweepView() {
  const wrap = h("section", {class: "sweep"});
  const run = h("button", {class: "btn primary small", type: "button"}, lastSweep ? "Пересчитать" : "Построить карту выгодности");
  wrap.append(
    h("h4", {class: "section-title"}, "Где проходит граница выгодности"),
    h("p", {class: "hint"}, "28 смен: тариф ПВЗ-хаба × заполненность полок. Партия 20, поток 1×, 2 машины. Цвет — эффект Mesh-схемы для WB за смену."),
    run);
  run.addEventListener("click", () => {
    run.disabled = true; run.textContent = "Считаем…";
    setTimeout(() => {
      try { lastSweep = sweepMatrix(); } catch (e) { lastSweep = {error: e.message}; }
      renderAnalyticsDrawer();
    }, 30);
  });
  if (lastSweep?.error) wrap.append(h("p", {class: "plan-message"}, lastSweep.error));
  else if (lastSweep) {
    const fees = [...new Set(lastSweep.map(r => r["тариф ПВЗ"]))];
    const loads = [...new Set(lastSweep.map(r => r["полки %"]))];
    const max = Math.max(1, ...lastSweep.map(r => Math.abs(r["экономия ₽"] || 0)));
    const grid = h("div", {class: "heat", style: "grid-template-columns: 70px repeat(" + fees.length + ",1fr)"});
    grid.append(h("span", {class: "heat-corner"}, "полки \\ ₽"), ...fees.map(f => h("span", {class: "heat-col"}, f + " ₽")));
    for (const l of loads) {
      grid.append(h("span", {class: "heat-row"}, l + "%"));
      for (const f of fees) {
        const r = lastSweep.find(x => x["тариф ПВЗ"] === f && x["полки %"] === l);
        const v = r["экономия ₽"];
        const a = v === null ? 0 : Math.min(1, Math.abs(v) / max);
        const bg = v === null ? "#eee" : v > 0 ? `rgba(203,17,171,${0.12 + a * 0.78})` : v < 0 ? `rgba(120,120,140,${0.1 + a * 0.4})` : "#f1eef6";
        grid.append(h("span", {class: "heat-cell" + (v > 0 && a > 0.5 ? " light" : ""), style: "background:" + bg, title: r["рейсов через ПВЗ"] + " рейсов через ПВЗ"},
          v === null ? "—" : signRub(v)));
      }
    }
    const wins = lastSweep.filter(r => r["экономия ₽"] > 0);
    const maxFee = wins.length ? Math.max(...wins.map(r => r["тариф ПВЗ"])) : null;
    const maxLoad = wins.length ? Math.max(...wins.map(r => r["полки %"])) : null;
    wrap.append(grid, h("p", {class: "verdict"}, wins.length
      ? "Mesh выгоден в " + wins.length + " из " + lastSweep.length + " сценариев: при тарифе хаба до " + maxFee + " ₽/коробка и загрузке полок до " + maxLoad + "%. Выше порога " + CONFIG.network.maxLoadForHub + "% хаб исключается — партия уходит на СЦ-2."
      : "При текущих ставках Mesh-схема не выигрывает ни в одном сценарии — снизьте тариф хаба или поднимите стоимость СЦ-2."));
  }
  return wrap;
}

/* ---------- разбивка затрат на заказ (горизонтальные бары) ---------- */
function costBars() {
  const A = previews.direct, B = previews.hybrid;
  if (!A || !B) return h("div");
  const labels = [...new Set([...Object.keys(A.rows), ...Object.keys(B.rows)])];
  const max = Math.max(...labels.map(k => Math.max((A.rows[k] || 0) / A.n, (B.rows[k] || 0) / B.n)), 1);
  const wrap = h("section", {class: "bars"}, h("h4", {class: "section-title"}, "Из чего складываются затраты WB на заказ"));
  for (const k of labels) {
    const a = (A.rows[k] || 0) / A.n, b = (B.rows[k] || 0) / B.n;
    wrap.append(h("div", {class: "bar-row"},
      h("span", {class: "bar-label"}, k),
      h("span", {class: "bar-pair"},
        h("i", {class: "a", style: "width:" + (a / max * 100) + "%"}), h("i", {class: "b", style: "width:" + (b / max * 100) + "%"})),
      h("span", {class: "bar-val"}, Math.round(a) + " / " + Math.round(b) + " ₽")));
  }
  wrap.append(h("div", {class: "bar-legend"}, h("span", {}, h("i", {class: "a"}), "A · СЦ-2"), h("span", {}, h("i", {class: "b"}), "B · Mesh")),
    h("p", {class: "verdict"}, "Итого на заказ: A " + rub(Math.round(A.costs / A.n)) + " · B " + rub(Math.round(B.costs / B.n)) + " · разница " + signRub((A.costs / A.n - B.costs / B.n))));
  return wrap;
}

/* ---------- формулы модели с текущими ставками ---------- */
function renderFormulas() {
  const box = el("formulaBox");
  if (!box) return;
  const c = CONFIG, cat = parcelCategory();
  const f = (title, expr, note) => h("div", {class: "formula"}, h("b", {}, title), h("code", {}, expr), note ? h("small", {}, note) : null);
  box.replaceChildren(
    f("Затраты A (через СЦ-2)", "СЦ-1·n + СЦ-2·n + выход + км·₽/км + мин·₽/мин + выдача·n",
      c.sc1PerBox + "·n + " + c.sc2PerBox + "·n + " + c.exitFee + " + км·" + c.perKm + " + мин·" + c.perMin + " + " + c.finalPvzPerBox + "·n"),
    f("Затраты B (через ПВЗ-хаб)", "СЦ-1·n + хаб·n + выход + км·₽/км + мин·₽/мин + выдача·n",
      "хаб = " + c.hubPerBox[cat] + " ₽/коробка" + (cat === "oversize" ? " + габарит " + (c.bulk.hub + c.bulk.loader) + " ₽" : "") + "; км и минуты — по реальным улицам, включая обратный путь и остановку"),
    f("Допуск ПВЗ", "габарит ✓ ∧ загрузка ≤ " + c.network.maxLoadForHub + "% ∧ n·V ≤ свободно ∧ работа ≤ свободные мин/ч ∧ ΔSLA ≤ " + c.sla.maxExtraMin + " мин",
      "место и время сотрудника резервируются на время обработки и уменьшаются для следующих партий"),
    f("Время рейса", "погрузка 25 + Σ дорога(улицы) + узел + выдача (2 + 0,25·n) + обратный путь",
      "узел: СЦ-2 = 25 мин; ПВЗ-хаб = 3 + 0,4·n мин (n = " + manifest() + " → " + (3 + 0.4 * manifest()).toFixed(1) + " мин). Срок до выдачи = прибытие в конечный ПВЗ − готовность партии"),
    f("Цена покупателю", "база + " + c.distanceShare + "·₽/км·км/n − скидка", "скидка = " + c.buyerSavingsShare * 100 + "% от экономии WB на заказ; компенсация " + c.sla.rubPerHour + " ₽/ч задержки сверх " + c.sla.freeMinutes + " мин"),
    f("Выбор", "B, если допуск ✓ и вклад_B ≥ вклад_A; иначе A", "вклад = выручка − затраты; из всех хабов по пути берётся лучший"),
    f("Эффект смены", "Σ вклад_B − Σ вклад_A", "постоянные " + c.shiftFixed + " ₽/смена одинаковы в обеих схемах"),
  );
}

/* ---------- время: из чего складывается рейс и где выигрыш ---------- */
const TIME_PARTS = [
  {key: "load", label: "Погрузка на СЦ-1", color: "#9b8fb0"},
  {key: "out", label: "Дорога до покупателя", color: "#2f6bff"},
  {key: "sc", label: "Сортировка на СЦ", color: "#1f1530"},
  {key: "hub", label: "Пересортировка в ПВЗ-хабе", color: "#cb11ab"},
  {key: "issue", label: "Выдача и оформление", color: "#13a36b"},
  {key: "fix", label: "Исправление инцидента", color: "#e5484d"},
  {key: "back", label: "Обратный путь и приём", color: "#c9c2d6"},
];
function timeBreakdown(r) {
  const out = Object.fromEntries(TIME_PARTS.map(p => [p.key, 0]));
  if (!r) return out;
  const final = r.ids.at(-1);
  const drives = r.phases.filter(p => p.leg);
  const lastDrive = drives.at(-1);
  for (const p of r.phases) {
    const d = p.end - p.start;
    if (p.leg) out[p.end <= r.eta + 1e-9 ? "out" : p === lastDrive ? "back" : "fix"] += d;
    else if (p.start < r.eta && p.id === r.ids[0]) out.load += d;
    else if (p.id === "sc-2" || p.id === "sc-ch") out.sc += d;
    else if (r.hub && p.id === r.hub.id && p.start < r.eta) out.hub += d;
    else if (p.id === final && /выдач|возврат/i.test(p.text) && !/Повторная/.test(p.text)) out.issue += d;
    else if (p.id === "sc-1") out.back += d;
    else out.fix += d;
  }
  return out;
}
const mins = m => Math.round(m) + " мин";
const deltaMin = m => (m > 0.5 ? "+" : m < -0.5 ? "−" : "±") + Math.abs(Math.round(m)) + " мин";

// Средний и p95 срок «готовность партии → выдача» и машино-минуты за смену.
function timeStats(mode, t = CONFIG.shiftMinutes) {
  const run = runs[mode];
  let orders = 0, sum = 0, machine = 0, trips = 0, tripSum = 0;
  for (const r of run?.trips || []) {
    if (r.start > t) continue;
    machine += Math.min(t, r.end) - r.start;
    if (r.eta <= t) { trips++; tripSum += r.eta - r.start; }
    for (const s of r.scans) if (s.delta > 0 && s.t <= t) { orders += s.delta; sum += (s.t - r.ready) * s.delta; }
  }
  return {orders, avg: orders ? sum / orders : null, machine, perOrder: orders ? machine / orders : null,
    trip: trips ? tripSum / trips : null};
}

function timeMeta(r) {
  if (!r) return "";
  return "⏱ до выдачи " + mins(r.eta - r.start) + " · рейс " + mins(r.end - r.start);
}

function timeView() {
  const A = previews.direct, B = previews.hybrid;
  const wrap = h("section", {class: "bars"}, h("h4", {class: "section-title"}, "Из чего складывается время рейса"));
  if (!A || !B) return wrap;
  const ta = timeBreakdown(A), tb = timeBreakdown(B);
  const total = Math.max(A.end - A.start, B.end - B.start);
  const strip = (name, r, t) => h("div", {class: "time-row"},
    h("span", {class: "time-name"}, name),
    h("span", {class: "time-strip"}, TIME_PARTS.filter(p => t[p.key] > 0.05).map(p =>
      h("i", {style: "width:" + (t[p.key] / total * 100) + "%;background:" + p.color, title: p.label + ": " + t[p.key].toFixed(1) + " мин"},
        t[p.key] / total > 0.07 ? Math.round(t[p.key]) + "" : ""))),
    h("span", {class: "time-total"}, mins(r.end - r.start)));
  const eta = (B.eta - B.start) - (A.eta - A.start), trip = (B.end - B.start) - (A.end - A.start);
  const sA = timeStats("direct"), sB = timeStats("hybrid");
  const machineRub = (sB.machine - sA.machine) * CONFIG.perMin;
  wrap.append(
    strip("A · СЦ-2", A, ta), strip("B · Mesh", B, tb),
    h("div", {class: "bar-legend wrap"}, TIME_PARTS.filter(p => ta[p.key] + tb[p.key] > 0.05).map(p => h("span", {}, h("i", {style: "background:" + p.color}), p.label))),
    h("table", {class: "summary-table compact"},
      h("thead", {}, h("tr", {}, ["Время", "A · СЦ-2", "B · Mesh", "Разница"].map(x => h("th", {}, x)))),
      h("tbody", {}, [
        ["До выдачи покупателю (партия)", A.eta - A.start, B.eta - B.start],
        ["Рейс целиком с возвратом", A.end - A.start, B.end - B.start],
        ["Обработка в промежуточном узле", ta.sc, tb.hub + tb.sc],
        ["Машино-минут на заказ", (A.end - A.start) / A.n, (B.end - B.start) / B.n],
        ["Средняя доставка партии за смену", sA.trip, sB.trip],
        ["Средний срок с ожиданием машины", sA.avg, sB.avg],
        ["Машино-минут за смену", sA.machine, sB.machine],
      ].map(([l, a, b]) => h("tr", {}, h("td", {}, l),
        h("td", {}, a === null ? "—" : a.toFixed(a < 10 ? 1 : 0) + " мин"),
        h("td", {}, b === null ? "—" : b.toFixed(b < 10 ? 1 : 0) + " мин"),
        h("td", {class: a !== null && b !== null && b < a ? "good-cell" : ""}, a === null || b === null ? "—" : deltaMin(b - a)))))),
    h("p", {class: "verdict"}, "Партия через ПВЗ-хаб приезжает к покупателю " + (eta <= 0 ? "на " + mins(-eta) + " быстрее" : "на " + mins(eta) + " позже") +
      ", рейс " + (trip <= 0 ? "короче на " + mins(-trip) : "длиннее на " + mins(trip)) + ". Время машины стоит " + rub(CONFIG.perMin) + "/мин и уже входит в затраты. За смену: " +
      deltaMin(sB.machine - sA.machine) + " машинного времени (" + signRub(machineRub) + ") при " + (sB.orders - sA.orders >= 0 ? "+" : "") + (sB.orders - sA.orders) + " выданных заказах."));
  return wrap;
}

function renderLiveTime() {
  const a = timeStats("direct", elapsed), b = timeStats(routeMode, elapsed);
  el("stTime").textContent = b.trip === null ? "—" : mins(b.trip);
  el("stTimeDelta").textContent = routeMode === "hybrid" && a.trip !== null && b.trip !== null ? deltaMin(b.trip - a.trip) + " к A" : "";
}
