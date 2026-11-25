function chain(mode, hub) {
  let ids = ["sc-1"];
  if (mode === "direct") ids.push("sc-2");
  if (geoMode === "intercity") ids.push("sc-ch");
  if (hub) ids.push(hub.id);
  ids.push(finalPvzId);
  return ids;
}
function customerTariff(mode) {
  const classic =
    { small: 119, medium: 179, oversize: 340 }[parcelSize] +
    (geoMode === "intercity" ? 140 : 0);
  const adjustment =
    mode === "hybrid"
      ? { small: -30, medium: -34, oversize: 120 }[parcelSize]
      : 0;
  return { classic, adjustment, total: classic + adjustment };
}
function tariffLabel(mode) {
  const t = customerTariff(mode);
  return (
    rub(t.total) + (t.adjustment > 0 ? " (+" + rub(t.adjustment) + ")" : "")
  );
}
function trip(mode, hub, n, start, incident) {
  const ids = chain(mode, hub),
    phases = [],
    scans = [],
    rows = {},
    res = [],
    size = parcelSize,
    bulk = size === "oversize";
  let t = start,
    km = 0,
    outKm = 0,
    issued = 0,
    returned = 0,
    hubPay = 0;
  if (
    [
      ...ids.slice(1).map((b, i) => ids[i] + ">" + b),
      ids.at(-1) + ">sc-1",
      ...(incident === "error" ? [ids.at(-1) + ">" + ids.at(-2)] : []),
    ].some((key) => !roads[key])
  )
    return null;
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
    let leg = roads[a + ">" + b];
    if (!leg)
      throw Error("Нет дорожного плеча " + nodeName(a) + " → " + nodeName(b));
    let duration = leg.track.at(-1)[2] / 60;
    phases.push({
      leg,
      start: t,
      end: t + duration,
      text: "В пути → " + nodeName(b),
    });
    t += duration;
    km += leg.km;
  }
  const price = customerTariff(mode).total;
  stop(ids[0], 25, "Приём и погрузка в СЦ 1");
  charge("СЦ 1 · обработка", 20 * n);
  scan(ids[0], "Передано водителю: " + n);
  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    drive(ids[i - 1], id);
    if (i === ids.length - 1) {
      outKm = km;
      stop(id, 2 + 0.25 * n, "Сканирование и выдача");
      let qty = n - (incident === "error" ? 1 : 0);
      scan(id, "Выдано " + qty, qty);
    } else if (id === hub?.id) {
      let arrival = t,
        duration = 3 + n * 0.4;
      stop(id, duration, "Приёмка, резерв полки и пересортировка");
      res.push({ id, a: arrival, b: t, litres: n * volume(), work: duration });
      let fee = bulk ? 80 : 16;
      hubPay += fee * n;
      charge("ПВЗ-хаб · обработка", fee * n);
      scan(id, "Принято и передано: " + n);
    } else {
      stop(id, 25, "Сортировка " + nodeName(id));
      charge(
        id === "sc-2"
          ? "СЦ 2 · устранимые операции"
          : "СЦ Чебоксары · обработка",
        (id === "sc-2" ? 52 : 25) * n,
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
    charge("Исправление пересорта", 12);
  }
  if (incident === "return") {
    stop(final, 5, "Оформление возврата");
    scan(final, "Возврат принят у покупателя", 0, 1);
    charge("Оформление возврата", 12);
  }
  drive(final, "sc-1");
  stop("sc-1", 3, "Приём машины в СЦ");
  scan(
    "sc-1",
    incident === "return" ? "Возврат принят на остаток: 1" : "Рейс закрыт",
  );
  charge("Выход машины", 160);
  charge("Пробег, включая обратный путь", km * 18);
  charge("Время машины и водителя", (t - start) * 1.5);
  charge("Выдача в конечном ПВЗ", 10 * n);
  const costs = Object.values(rows).reduce((a, b) => a + b, 0),
    income = price * (issued - returned);
  return {
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
    pvz: hubPay + 10 * n + (incident === "return" ? 12 : 0),
    hub,
  };
}
