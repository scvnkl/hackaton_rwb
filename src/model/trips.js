function chain(mode, hub, destination=finalPvzId) {
  let ids = ["sc-1"];
  if (mode === "direct") ids.push("sc-2");
  if (geoMode === "intercity") ids.push("sc-ch");
  if (hub) ids.push(hub.id);
  ids.push(destination);
  return ids;
}
function roadItinerary(ids,incident) {
  return incident==="error" ? [...ids, ids.at(-2), ids.at(-1), "sc-1"] : [...ids,"sc-1"];
}
function hasItinerary(ids){return ids.slice(1).every((id,i)=>legOf(ids[i],id));}
function customerTariff(km, n) {
  return CONFIG.buyerBase[parcelCategory()] + (geoMode === "intercity" ? CONFIG.intercityFee : 0)
    + Math.round(CONFIG.distanceShare * CONFIG.perKm * km / n);
}
function tariffLabel(mode) {
  const r = previews[mode];
  return r ? rub(r.price) : "—";
}
function trip(mode, hub, n, start, incident, days=0) {
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
  if (!hasItinerary(roadItinerary(ids,incident))) return null;
  const storageSite=days>0?(hub?.id||"sc-2"):null;
  let pickup,openingLot;
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
  if(storageSite){
    stop(ids[0],5,"Подготовка машины к забору запаса");
    scan(ids[0],"Выезд за партией со склада");
  }else{
    stop(ids[0],25,"Приём и погрузка в СЦ 1");
    charge("СЦ 1 · обработка", CONFIG.sc1PerBox*n);
    scan(ids[0],"Передано водителю: "+n);
  }
  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    drive(ids[i - 1], id);
    if(id===storageSite)pickup=t;
    if (i === ids.length - 1) {
      eta = t;
      outKm = km;
      stop(id, 2 + 0.25 * n, "Сканирование и выдача");
      let qty = n - (incident === "error" ? 1 : 0);
      scan(id, "Выдано " + qty, qty);
    } else if (id === hub?.id) {
      let arrival = t,
        duration = 3 + n * 0.4;
      stop(id, duration, storageSite ? "Отбор запаса, сканирование и погрузка" : "Приёмка, резерв полки и пересортировка");
      res.push({ id, a: arrival, b: t, litres: n * volume(), work: duration });
      let fee = CONFIG.hubPerBox[parcelCategory()];
      if (parcelCategory() === "oversize") {
        charge("Габарит · выплата ПВЗ", CONFIG.bulk.hub * n);
        charge("Габарит · грузчики", CONFIG.bulk.loader * n);
        hubPay += CONFIG.bulk.hub * n;
      }
      hubPay += fee * n;
      charge("ПВЗ-хаб · обработка", fee * n);
      scan(id, "Принято и передано: " + n);
    } else if(!storageSite || pickup!==undefined) {
      stop(id, 25, id===storageSite ? "Отбор партии в СЦ со хранения" : "Сортировка " + nodeName(id));
      charge(
        id === "sc-2"
          ? "СЦ 2 · устранимые операции"
          : "СЦ Чебоксары · обработка",
        (id === "sc-2" ? CONFIG.sc2PerBox : CONFIG.scChPerBox) * n,
      );
      scan(id, "Отсканировано " + n);
    }
    if(id===storageSite){
      const fee=CONFIG.storagePerBoxDay*n*days;
      openingLot={id,units:n,litres:n*volume(),days,fee,receivedAt:-days*1440,releasedAt:t,pickup};
      if(hub)res.unshift({id,a:openingLot.receivedAt,b:pickup,litres:openingLot.litres,work:0});
      scan(id,"Списано с хранения и погружено: "+n+" шт.");
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
  const price = customerTariff(outKm, n);
  const costs = Object.values(rows).reduce((a, b) => a + b, 0),
    income = price * (issued - returned);
  const pvzBase =
    CONFIG.finalPvzPerBox * n +
    (incident === "return" ? CONFIG.incidentFee : 0);
  const logistics = CONFIG.sellerPerBox * n,
    storage = openingLot?.fee || 0,
    returns = incident === "return" ? CONFIG.returnHandling : 0;
  return {
    eta, openingLot, pvzStorage: hub && openingLot ? storage : 0,
    referencePrice: price,
    discount: 0,
    premium: 0,
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
    pvz: hubPay + pvzBase + (hub ? storage : 0),
    hub,
  };
}
