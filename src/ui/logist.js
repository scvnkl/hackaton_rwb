/* Пульт логиста: главный экран продукта.
 * Для кого: логист городской доставки WB (СЦ города). Для чего: по каждой партии смены
 * система сама выбирает путь — ПВЗ-хаб по пути или СЦ-2, бронирует место и время ПВЗ
 * и выдаёт маршрут водителю. Логист видит итог смены и подтверждает только исключения. */
const SHIFT_START = 8 * 60; // смена 08:00–16:00
const clockAt = m => { const t = Math.round(SHIFT_START + m); return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
const logistDecisions = new Map(); // решения логиста по исключениям (в MVP — журнал решений)
let logistSig = "";

function tripStatus(r) {
  if (elapsed < r.start) return {t: "Ждёт", c: "plan"};
  if (elapsed < r.eta) return {t: "В пути", c: "go"};
  return {t: "Выдан", c: "done"};
}
// Исключение — решение, которое система не подтверждает сама.
function tripException(r) {
  if (r.mode === "hybrid" && (r.gain ?? 0) < 100) return "выгода всего " + fmtRub(r.gain ?? 0) + " на партию";
  if (r.mode === "hybrid" && (r.etaGain ?? 0) > 10) return "срок " + deltaMin(r.etaGain) + " к СЦ-2";
  if (r.mode === "direct" && r.reason && !/выгоднее/.test(r.reason)) return "хаб недоступен: " + r.reason;
  return null;
}

function renderLogist(force = false) {
  const box = el("logistView");
  if (!box) return;
  const run = runs.hybrid;
  if (planIssue || !run) { box.replaceChildren(h("p", {class: "plan-message"}, planIssue || "Расчёт недоступен")); logistSig = ""; return; }
  const trips = run.trips;
  const sig = trips.map(r => tripStatus(r).c).join("") + "|" + routeMode + "|" + trips.length + "|" + logistDecisions.size;
  if (!force && sig === logistSig) return;
  logistSig = sig;

  const viaHub = trips.filter(r => r.mode === "hybrid");
  const exceptions = trips.map((r, i) => ({r, i, why: tripException(r)})).filter(x => x.why);
  const auto = trips.length - exceptions.length;
  const A = runs.direct ? metrics("direct", CONFIG.shiftMinutes) : null, B = metrics("hybrid", CONFIG.shiftMinutes);
  const saved = A ? B.margin - A.margin : 0;
  const etaSaved = viaHub.reduce((s, r) => s - (r.etaGain ?? 0), 0);
  const hubs = new Map();
  for (const r of viaHub) {
    const row = hubs.get(r.hub.id) || {p: r.hub, n: 0, boxes: 0};
    row.n++; row.boxes += r.n; hubs.set(r.hub.id, row);
  }

  const kpi = (label, value, sub, tone = "") => h("div", {class: "lg-kpi " + tone}, h("small", {}, label), h("b", {}, value), h("em", {}, sub));
  const rows = trips.map((r, i) => {
    const st = tripStatus(r), ex = tripException(r), dec = logistDecisions.get(i);
    const tr = h("tr", {class: (st.c === "go" ? "now " : "") + (ex && !dec ? "warn" : "")},
      h("td", {}, h("b", {}, clockAt(r.start)), h("small", {}, "маш. №" + r.van + " · " + r.n + " шт")),
      h("td", {}, r.mode === "hybrid"
        ? h("span", {class: "lg-route hub"}, "ПВЗ-хаб", h("small", {}, pvzName(r.hub)))
        : h("span", {class: "lg-route sc"}, "СЦ-2", h("small", {}, r.reason ? r.reason.slice(0, 38) : ""))),
      h("td", {class: "num"}, r.mode === "hybrid" ? h("b", {class: "pos"}, signRub(r.gain ?? 0)) : "—"),
      h("td", {}, h("span", {class: "lg-st " + st.c}, dec ? "✓ " + dec : st.t)));
    tr.addEventListener("click", () => { setRouteMode("hybrid"); elapsed = Math.min(CONFIG.shiftMinutes, r.start + 1); updateClock(true); });
    return tr;
  });

  // Одинаковые исключения сводим в одну карточку, чтобы логист решал одним действием.
  const groups = new Map();
  for (const x of exceptions) { const g = groups.get(x.why) || []; g.push(x); groups.set(x.why, g); }
  const exList = groups.size ? [...groups.entries()].map(([why, list]) => {
    const r = list[0].r, open = list.filter(x => !logistDecisions.has(x.i));
    const dec = open.length ? null : logistDecisions.get(list[0].i);
    const choose = label => { for (const x of list) logistDecisions.set(x.i, label); renderLogist(true); };
    const btn = (text, label, cls = "") => { const b = h("button", {class: "btn small " + cls, type: "button"}, text); b.addEventListener("click", () => choose(label)); return b; };
    const title = list.length > 1
      ? list.length + " партий · " + list.map(x => clockAt(x.r.start)).slice(0, 4).join(", ") + (list.length > 4 ? "…" : "")
      : clockAt(r.start) + " · машина №" + r.van + " · " + r.n + " шт";
    const tip = /Загрузка выше/.test(why) ? "Совет: подключите ПВЗ с уровнем «хаб» — выделенная зона работает и в пик (вкладка «Эффект» → «Владелец ПВЗ»)." : null;
    return h("div", {class: "lg-ex" + (dec ? " done" : "")},
      h("div", {}, h("b", {}, title),
        h("small", {}, "Система предлагает: " + (r.mode === "hybrid" ? "через " + pvzName(r.hub) : "через СЦ-2") + " — " + why),
        tip ? h("small", {class: "tip"}, tip) : null),
      dec ? h("span", {class: "lg-st done"}, "✓ " + dec) : h("div", {class: "lg-ex-btns"},
        btn(list.length > 1 ? "Подтвердить операцию для всех" : "Подтвердить операцию", "подтверждено", "primary"),
        btn(r.mode === "hybrid" ? "Через СЦ-2" : "Ждать хаб", r.mode === "hybrid" ? "через СЦ-2" : "ждём хаб")));
  }) : [h("p", {class: "lg-ok"}, "✓ Исключений нет — все партии смены решены автоматически")];

  box.replaceChildren(
    h("div", {class: "lg-head"},
      h("small", {}, "Пульт логиста · городская доставка WB · " + (REGION_CATALOGS[regionId]?.city || "Йошкар-Ола")),
      h("b", {}, "Смена 08:00–16:00 · сейчас " + clockAt(elapsed)),
      h("p", {}, "Система сама решает по каждой партии: через ПВЗ-хаб по пути или через СЦ-2. Вы подтверждаете только исключения."),
      (() => { const b = h("button", {class: "lg-jump", type: "button"}, "🚕 Срочные заказы → такси WB ↓"); b.addEventListener("click", () => el("taxiView").scrollIntoView({behavior: "smooth", block: "start"})); return b; })()),
    h("div", {class: "lg-kpis"},
      kpi("Решено автоматически", auto + " из " + trips.length, "партий смены", "good"),
      kpi("Через ПВЗ-хабы", viaHub.length + " партий", viaHub.reduce((s, r) => s + r.n, 0) + " коробок мимо СЦ-2"),
      kpi("Экономия смены", signRub(saved), etaSaved > 0.5 ? "−" + Math.round(etaSaved) + " мин в пути у партий" : "без изменения сроков")),
    h("h4", {class: "lg-title"}, "Нужно ваше решение", h("span", {class: "pill-count"}, String(exceptions.filter(x => !logistDecisions.has(x.i)).length))),
    ...exList,
    h("h4", {class: "lg-title"}, "Партии смены", h("small", {}, "нажмите строку — покажу на карте")),
    h("div", {class: "lg-table-wrap"}, h("table", {class: "lg-table"},
      h("thead", {}, h("tr", {}, ["Отправка", "Путь партии", "Эффект", "Статус"].map(t => h("th", {}, t)))),
      h("tbody", {}, rows))),
    hubs.size ? h("div", {}, h("h4", {class: "lg-title"}, "ПВЗ-хабы сегодня"),
      ...[...hubs.values()].map(x => h("div", {class: "lg-hub"}, h("span", {}, pvzName(x.p)), h("b", {}, x.n + " партий · " + x.boxes + " шт"), h("small", {}, "задание и время приёма отправлены в ПВЗ")))) : null,
    h("details", {class: "lg-auto"}, h("summary", {}, "Что система делает сама, а что — логист"),
      h("ul", {},
        ["Подбирает ПВЗ-хаб по пути: габарит, место, время сотрудника, срок, выгода",
         "Бронирует полку и время сотрудника хаба, отправляет ПВЗ задание на приём",
         "Строит маршрут водителю по улицам и ставит рейс в очередь машины",
         "При перегрузке хабов сама возвращает партии на СЦ-2 или сдвигает отправку на 15–30 мин",
         "Считает эффект: деньги, время, пробег — по каждой партии и за смену"].map(t => h("li", {}, "✓ " + t)),
        h("li", {class: "manual"}, "Логист: подтверждает исключения (малая выгода, задержка срока, хаб недоступен), меняет тарифы и пороги, подключает новые ПВЗ-хабы"))),
  );
}
