/* Вкладка «Эффект»: для кого это, что даёт и как выглядит у каждого участника.
 * Все числа считаются из той же смены, что и карта: одна линия доставки, одинаковый спрос и парк.
 * Месяц = CONFIG.shiftsPerMonth смен по 8 часов. */
let businessRole = "wb";
const pctDelta = (b, a) => a ? (b - a) / Math.abs(a) * 100 : 0;
const fmtPct = v => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(0) + "%";
const perMonth = v => v * CONFIG.shiftsPerMonth;

// Эффект Mesh в пик (все полки заняты на 99%) — без уровня «ПВЗ-хаб» и с ним.
function peakResilience() {
  const saved = {override: LOAD_OVERRIDE, level: CONFIG.hubLevel.enabled};
  try {
    LOAD_OVERRIDE = 99;
    const run = level => {
      CONFIG.hubLevel.enabled = level;
      const d = schedule("direct"), h = schedule("hybrid");
      const md = metrics("direct", CONFIG.shiftMinutes, d), mh = metrics("hybrid", CONFIG.shiftMinutes, h);
      return {saved: mh.margin - md.margin, viaHub: h.trips.filter(t => t.mode === "hybrid").length, trips: h.trips.length};
    };
    return {without: run(false), with: run(true)};
  } finally {
    LOAD_OVERRIDE = saved.override;
    CONFIG.hubLevel.enabled = saved.level;
  }
}

function businessNumbers() {
  if (planIssue || !runs.direct || !runs.hybrid || !previews.direct) return null;
  const A = shiftStats("direct"), B = shiftStats("hybrid");
  const mA = metrics("direct", CONFIG.shiftMinutes), mB = metrics("hybrid", CONFIG.shiftMinutes);
  const tA = timeStats("direct"), tB = timeStats("hybrid");
  const pA = previews.direct, pB = previews.hybrid || previews.direct;
  const hubs = [...B.hubs.values()];
  const hubCount = Math.max(1, hubs.length);
  const pay = hubs.reduce((s, r) => s + r.pay, 0), work = hubs.reduce((s, r) => s + r.work, 0);
  const lvl = CONFIG.hubLevel;
  const m2 = lvl.litres / lvl.litresPerM2;
  const owner = {
    hubs: hubs.length,
    boxes: perMonth(B.boxesHub) / hubCount,
    revenue: perMonth(pay) / hubCount,
    labour: perMonth(work) * CONFIG.hubWorkPerMin / hubCount,
    workPerDay: work / hubCount,
    rent: lvl.enabled ? m2 * lvl.rentPerM2 : 0,
    setup: lvl.enabled ? m2 * lvl.setupPerM2 : 0,
    m2,
    peakLitres: hubs.length ? Math.max(...hubs.map(r => r.litres)) : 0,
  };
  owner.profit = owner.revenue - owner.labour - owner.rent;
  owner.payback = owner.setup && owner.profit > 0 ? owner.setup / (owner.profit / 30) : null;
  return {
    A, B, mA, mB, tA, tB, pA, pB, owner,
    saved: mB.margin - mA.margin,
    cpoA: pA.costs / pA.n, cpoB: pB.costs / pB.n,
    sellerExtra: (mB.issued - mA.issued) * (CONFIG.sellerGrossPerSale - CONFIG.sellerPerBox),
    hubName: pB.hub ? pvzName(pB.hub) : null,
    finalName: pvzName(cityById.get(finalPvzId)),
  };
}

function bizTile(label, value, delta, tone = "") {
  return h("div", {class: "biz-tile " + tone}, h("small", {}, label), h("b", {}, value), delta ? h("em", {}, delta) : null);
}
function bizMock(title, ...rows) {
  return h("div", {class: "biz-mock"}, h("div", {class: "biz-mock-head"}, h("i"), h("i"), h("i"), h("span", {}, title)), h("div", {class: "biz-mock-body"}, rows));
}

const ROLES = {
  wb: {
    label: "Маркетплейс",
    who: "Логистика WB в городе: СЦ, линии доставки, сеть ПВЗ.",
    get pain() { return "Товар уже в городе, но каждая коробка едет через второй сортировочный центр: лишние " + CONFIG.sc2PerBox + " ₽ и 25 минут, а минута машины с водителем стоит " + CONFIG.perMin + " ₽."; },
    gain: "Часть партий пересортировывают ПВЗ по пути. Те же машины везут больше заказов дешевле и быстрее.",
    view(x) {
      return [
        h("div", {class: "biz-grid"},
          bizTile("Экономия на линии", fmtRub(perMonth(x.saved)) + "/мес", signRub(x.saved) + " за смену", x.saved > 0 ? "good" : ""),
          bizTile("Затраты на заказ", fmtRub(x.cpoB), fmtPct(pctDelta(x.cpoB, x.cpoA)) + " (было " + fmtRub(x.cpoA) + ")"),
          bizTile("Заказов за смену на тех же машинах", x.mB.issued + "", fmtPct(pctDelta(x.mB.issued, x.mA.issued)) + " (было " + x.mA.issued + ")"),
          bizTile("Доставка партии", x.tB.trip === null ? "—" : mins(x.tB.trip), x.tA.trip === null || x.tB.trip === null ? "" : deltaMin(x.tB.trip - x.tA.trip) + " (было " + mins(x.tA.trip) + ")")),
        h("p", {class: "hint"}, "Нагрузка СЦ-2 снижается на " + fmtInt(perMonth(x.B.boxesHub)) + " коробок в месяц на одной линии — это мощность под рост без новых смен."),
        bizMock("Диспетчерская WB · решение по партии",
          h("div", {class: "mock-row"}, h("span", {}, "Партия " + x.pB.n + " шт → " + x.finalName), h("b", {class: x.pB.mode === "hybrid" ? "ok" : ""}, x.pB.mode === "hybrid" ? "через ПВЗ-хаб" : "через СЦ-2")),
          x.hubName ? h("div", {class: "mock-row"}, h("span", {}, "Хаб"), h("b", {}, x.hubName)) : null,
          h("div", {class: "mock-row"}, h("span", {}, "Затраты партии"), h("b", {}, fmtRub(x.pB.costs) + " вместо " + fmtRub(x.pA.costs))),
          h("div", {class: "mock-row"}, h("span", {}, "Прибытие к покупателю"), h("b", {}, mins(x.pB.eta - x.pB.start) + " вместо " + mins(x.pA.eta - x.pA.start)))),
      ];
    },
  },
  seller: {
    label: "Продавец",
    who: "Продавец на WB, чьи товары уже лежат на складе в городе.",
    pain: "Заказ ждёт второй сортировки, часть заказов не успевает выехать за день.",
    gain: "Заказы доходят до ПВЗ быстрее, за день доставляется больше заказов, доставка для покупателя дешевле.",
    view(x) {
      return [
        h("div", {class: "biz-grid"},
          bizTile("Доп. маржа продавцов на линии", fmtRub(perMonth(x.sellerExtra)) + "/мес", "+" + (x.mB.issued - x.mA.issued) + " продаж за смену × " + (CONFIG.sellerGrossPerSale - CONFIG.sellerPerBox) + " ₽", x.sellerExtra > 0 ? "good" : ""),
          bizTile("Срок до ПВЗ покупателя", mins(x.pB.eta - x.pB.start), deltaMin((x.pB.eta - x.pB.start) - (x.pA.eta - x.pA.start)) + " к текущей схеме"),
          bizTile("Доставлено за день", x.mB.issued + " заказов", fmtPct(pctDelta(x.mB.issued, x.mA.issued)) + " — меньше переносов на завтра"),
          bizTile("Цена доставки для покупателя", rub(x.pB.price), fmtPct(pctDelta(x.pB.price, x.pA.price)) + " — выше конверсия в покупку")),
        h("p", {class: "hint"}, "Логистика продавца не дорожает: " + CONFIG.sellerPerBox + " ₽ за коробку в обеих схемах (тариф WB 46 ₽ + 14 ₽/л). Опция: хранить ходовой остаток прямо в ПВЗ-хабе рядом с покупателями — " + rub(CONFIG.storagePerBoxDay ?? 0.8) + " за коробку в сутки."),
        bizMock("Кабинет продавца · заказ",
          h("div", {class: "mock-row"}, h("span", {}, "Статус"), h("b", {}, x.pB.mode === "hybrid" ? "Принят в ПВЗ-хабе → едет к покупателю" : "Сортировка на СЦ-2")),
          h("div", {class: "mock-row"}, h("span", {}, "Ожидаемая выдача"), h("b", {class: "ok"}, "через " + mins(x.pB.eta - x.pB.start) + " (было " + mins(x.pA.eta - x.pA.start) + ")")),
          h("div", {class: "mock-row"}, h("span", {}, "Логистика"), h("b", {}, CONFIG.sellerPerBox + " ₽/шт · без изменений")),
          h("div", {class: "mock-row"}, h("span", {}, "☐ Хранить остаток в ПВЗ-хабах"), h("b", {}, rub(CONFIG.storagePerBoxDay) + "/шт в сутки"))),
      ];
    },
  },
  owner: {
    label: "Владелец ПВЗ",
    who: "Владелец пункта выдачи WB. Доход сейчас — только выдача заказов.",
    pain: "Полки и сотрудник простаивают в часы спада, доход ограничен потоком покупателей.",
    gain: "Новый источник дохода: пункт повышает уровень до «ПВЗ-хаба» и пересортировывает транзитные партии в выделенной зоне.",
    view(x) {
      const o = x.owner, lvl = CONFIG.hubLevel;
      const form = h("div", {class: "upgrade"});
      const check = h("input", {type: "checkbox", id: "hubLevelToggle"});
      check.checked = lvl.enabled;
      check.addEventListener("change", () => { lvl.enabled = check.checked; updateParameters(); });
      const range = (label, key, min, max, step, unit) => {
        const input = h("input", {type: "range", min, max, step});
        input.value = lvl[key];
        const out = h("b", {}, fmtInt(lvl[key]) + unit);
        input.addEventListener("input", () => { lvl[key] = Number(input.value); out.textContent = fmtInt(lvl[key]) + unit; });
        input.addEventListener("change", () => updateParameters());
        return h("label", {class: "field range"}, h("span", {}, label + " ", out), input);
      };
      form.append(
        h("label", {class: "check upgrade-toggle"}, check, h("span", {}, h("b", {}, "Повысить уровень до «ПВЗ-хаб»"), h("small", {}, "выделенная зона под транзит, свой график приёма"))),
        range("Выделенная зона", "litres", 400, 2400, 100, " л"),
        range("Время сотрудника на хаб", "minutesPerHour", 10, 40, 5, " мин/ч"),
      );
      const rows = [
        ["Коробок через хаб", fmtInt(o.boxes) + " / мес"],
        ["Выплата WB за пересорт и хранение", fmtRub(o.revenue)],
        ["Труд сотрудника (" + CONFIG.hubWorkPerMin + " ₽/мин)", "−" + fmtRub(o.labour)],
        lvl.enabled ? ["Аренда зоны " + o.m2.toLocaleString("ru-RU", {maximumFractionDigits: 1}) + " м² × " + lvl.rentPerM2 + " ₽", "−" + fmtRub(o.rent)] : null,
        ["Доп. доход пункта", fmtRub(o.profit)],
        lvl.enabled ? ["Стеллажи и разметка (разово)", fmtRub(o.setup) + (o.payback !== null ? " · окупаемость " + Math.max(1, Math.ceil(o.payback)) + " дн." : "")] : null,
      ].filter(Boolean);
      const peak = x.peak;
      return [
        h("div", {class: "biz-grid"},
          bizTile("Доп. доход одного хаба", fmtRub(o.profit) + "/мес", o.hubs ? "после оплаты труда" + (lvl.enabled ? " и аренды" : "") : "хаб не выбран", o.profit > 0 ? "good" : ""),
          bizTile("Работы в день", mins(o.workPerDay), "вписано в свободное время сотрудника"),
          bizTile("Пик занятой полки", fmtInt(o.peakLitres) + " л", lvl.enabled ? "из " + fmtInt(lvl.litres) + " л выделенной зоны" : "из свободного места пункта"),
          bizTile("Хабов на линии", o.hubs + "", "среди ПВЗ по пути")),
        form,
        h("table", {class: "summary-table compact"}, h("tbody", {}, rows.map(([a, b], i) => h("tr", {class: i === rows.length - (lvl.enabled ? 2 : 1) ? "total" : ""}, h("td", {}, a), h("td", {}, b))))),
        peak ? h("div", {class: "verdict"}, "Зачем уровень хаба: в пик, когда полки заняты на 99%, обычный ПВЗ выпадает — эффект Mesh " + signRub(peak.without.saved) + " (" + peak.without.viaHub + " партий через ПВЗ). С выделенной зоной хаб работает и в пик: " + signRub(peak.with.saved) + " (" + peak.with.viaHub + " из " + peak.with.trips + " партий).") : null,
      ];
    },
  },
  buyer: {
    label: "Покупатель",
    who: "Покупатель, который ждёт заказ в ПВЗ рядом с домом.",
    pain: "Заказ уже в городе, а приходит позже из-за лишней сортировки.",
    gain: "Заказ приезжает раньше и стоит дешевле: четверть экономии WB возвращается в цене доставки.",
    view(x) {
      return [
        h("div", {class: "biz-grid"},
          bizTile("Цена доставки", rub(x.pB.price), fmtPct(pctDelta(x.pB.price, x.pA.price)) + " (было " + rub(x.pA.price) + ")", "good"),
          bizTile("Заказ в ПВЗ", "на " + Math.max(0, Math.round((x.pA.eta - x.pA.start) - (x.pB.eta - x.pB.start))) + " мин раньше", mins(x.pB.eta - x.pB.start) + " вместо " + mins(x.pA.eta - x.pA.start)),
          bizTile("Гарантия срока", "до +" + CONFIG.sla.freeMinutes + " мин", "дальше компенсация " + CONFIG.sla.rubPerHour + " ₽/ч"),
          bizTile("Габарит", "только с согласия", "+" + CONFIG.bulk.premium + " ₽ за доставку через ПВЗ")),
        bizMock("Приложение WB · оформление",
          h("div", {class: "mock-row"}, h("span", {}, "Пункт выдачи"), h("b", {}, x.finalName)),
          h("div", {class: "mock-row"}, h("span", {}, "Доставка"), h("b", {class: "ok"}, rub(x.pB.price) + " · сегодня")),
          h("div", {class: "mock-row"}, h("span", {}, "Ожидание"), h("b", {}, "≈ " + mins(x.pB.eta - x.pB.start) + " после отгрузки"))),
      ];
    },
  },
};

function renderBusiness() {
  const box = el("businessView");
  if (!box) return;
  for (const b of document.querySelectorAll("[data-role]")) b.classList.toggle("active", b.dataset.role === businessRole);
  const x = businessNumbers();
  if (!x) { box.replaceChildren(h("p", {class: "plan-message"}, planIssue || "Расчёт недоступен")); return; }
  if (businessRole === "owner" || businessRole === "wb") x.peak = peakResilience();
  const role = ROLES[businessRole];
  box.replaceChildren(...[
    h("div", {class: "biz-story"},
      h("div", {}, h("small", {}, "Кто"), h("p", {}, role.who)),
      h("div", {}, h("small", {}, "Боль сейчас"), h("p", {}, role.pain)),
      h("div", {class: "gain"}, h("small", {}, "Что даёт Mesh"), h("p", {}, role.gain))),
    ...role.view(x),
    businessRole === "wb" && x.peak ? h("p", {class: "hint"}, "Надёжность: при перегрузке ПВЗ модель сама возвращает партии на СЦ-2 (эффект в пик " + signRub(x.peak.without.saved) + "). С уровнем «ПВЗ-хаб» эффект в пик " + signRub(x.peak.with.saved) + ".") : null,
    h("p", {class: "hint assume"}, "Одна линия доставки: " + val("truckCountSlider") + " маш., поток " + (val("flowSlider") / 100).toLocaleString("ru-RU") + "×, партия " + manifest() + " шт. Месяц = " + CONFIG.shiftsPerMonth + " смен по 8 ч. Ставки — рыночные на ноябрь 2026 (источники в README), редактируются во вкладке «Экономика»."),
  ].flat().filter(Boolean));
}
for (const b of document.querySelectorAll("[data-role]")) b.addEventListener("click", () => { businessRole = b.dataset.role; renderBusiness(); });
