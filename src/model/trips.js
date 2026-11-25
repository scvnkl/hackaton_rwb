function chain(mode, hub) {
  let ids = ["sc-1"];
  if (mode === "direct") ids.push("sc-2");
  if (geoMode === "intercity") ids.push("sc-ch");
  if (hub) ids.push(hub.id);
  ids.push(finalPvzId);
  return ids;
}
function customerTariff() {
  return (
    CONFIG.buyerBase[parcelSize] +
    (geoMode === "intercity" ? CONFIG.intercityFee : 0)
  );
}
function tariffLabel(mode) {
  const trip = previews[mode];
  return trip?.compPerOrder
    ? rub(customerTariff()) +
        " − " +
        rub(trip.compPerOrder) +
        " = " +
        rub(trip.price)
    : rub(customerTariff());
}
function trip(mode, hub, n, start, incident) {
  const ids = chain(mode, hub),
    phases = [],
    scans = [],
    rows = {},
    res = [];
  let eta = start,
    t = start,
    km = 0,
    outKm = 0,
    issued = 0,
    returned = 0,
    hubPay = 0;
  if (!ids.every((id) => nodeLatLng(id))) return null;
  const charge = (label, price) => (rows[label] = (rows[label] || 0) + price);
  const scan = (id, text, delta = 0, back = 0) => {
    scans.push({ t, id, text, delta, back });
    issued += delta;
    returned += back;
  };
  function stop(id, min, text) {
    phases.push({ id, start: t, end: t + min, text });
    t += min;
  }
  function drive(a, b) {
    const leg = legOf(a, b);
    if (!leg)
      throw Error("Нет данных о плече " + nodeName(a) + " → " + nodeName(b));
    const duration = leg.min;
    phases.push({
      leg,
      start: t,
      end: t + duration,
      text: "В пути → " + nodeName(b),
      pos: nodeLatLng(b),
    });
    t += duration;
    km += leg.km;
  }
  const price = customerTariff();
  stop(ids[0], 25, "Приём и погрузка в СЦ 1");
  charge("СЦ 1 · обработка", CONFIG.sc1PerBox * n);
  scan(ids[0], "Передано водителю: " + n);
  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    drive(ids[i - 1], id);
    if (i === ids.length - 1) {
      eta = t;
      outKm = km;
      stop(id, 2 + 0.25 * n, "Сканирование и выдача");
      let qty = n - (incident === "error" ? 1 : 0);
      scan(id, "Выдано " + qty, qty);
    } else if (id === hub?.id) {
      let arrival = t,
        duration = 3 + n * 0.4;
      stop(id, duration, "Приёмка, резерв полки и пересортировка");
      res.push({ id, a: arrival, b: t, litres: n * volume(), work: duration });
      let fee = CONFIG.hubPerBox[parcelSize];
      hubPay += fee * n;
      charge("ПВЗ-хаб · обработка", fee * n);
      scan(id, "Принято и передано: " + n);
    } else {
      stop(id, 25, "Сортировка " + nodeName(id));
      charge(
        id === "sc-2"
          ? "СЦ 2 · устранимые операции"
          : "СЦ Чебоксары · обработка",
        (id === "sc-2" ? CONFIG.sc2PerBox : CONFIG.scChPerBox) * n,
      );
      scan(id, "Отсканировано " + n);
    }
  }
  let final = ids.at(-1),
    origin = ids.at(-2);
  if (incident === "error") {
    scan(
      final,
      "Расхождение −1 · проверка последней передачи у " + nodeName(origin),
    );
    drive(final, origin);
    stop(origin, 5, "Поиск коробки и сканирование");
    scan(origin, "Недостающая коробка найдена");
    drive(origin, final);
    stop(final, 2, "Повторная выдача");
    scan(final, "Недостача закрыта", 1);
    charge("Исправление пересорта", CONFIG.incidentFee);
  }
  if (incident === "return") {
    stop(final, 5, "Оформление возврата");
    scan(final, "Возврат принят у покупателя", 0, 1);
    charge("Оформление возврата", CONFIG.incidentFee);
  }
  drive(final, "sc-1");
  stop("sc-1", 3, "Приём машины в СЦ");
  scan(
    "sc-1",
    incident === "return" ? "Возврат принят на остаток: 1" : "Рейс закрыт",
  );
  charge("Выход машины", CONFIG.exitFee);
  charge("Пробег, включая обратный путь", km * CONFIG.perKm);
  charge("Время машины и водителя", (t - start) * CONFIG.perMin);
  charge("Выдача в конечном ПВЗ", CONFIG.finalPvzPerBox * n);
  const costs = Object.values(rows).reduce((a, b) => a + b, 0),
    income = price * (issued - returned);
  const pvzBase =
    CONFIG.finalPvzPerBox * n +
    (incident === "return" ? CONFIG.incidentFee : 0);
  const logistics = CONFIG.sellerPerBox * n,
    storage = CONFIG.storagePerBoxDay * n * val("storageDays"),
    returns = incident === "return" ? CONFIG.returnHandling : 0;
  return {
    eta,
    comp: 0,
    compPerOrder: 0,
    pvzBase,
    pvzHub: hubPay,
    seller: {
      logistics,
      storage,
      returns,
      total: logistics + storage + returns,
    },
    mode,
    ids,
    phases,
    scans,
    res,
    start,
    end: t,
    km,
    outKm,
    n,
    issued,
    returned,
    price,
    rows,
    costs,
    income,
    margin: income - costs,
    pvz: hubPay + pvzBase,
    hub,
  };
}
