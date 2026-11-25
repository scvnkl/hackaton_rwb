function choose(mode, n, t, incident, book, baselineStart = t) {
  const base = trip("direct", null, n, baselineStart, incident);
  if (mode === "direct") return base;
  let best,
    overloaded = 0,
    slaBlocked = 0,
    capacityBlocked = 0;
  if (fits())
    for (const p of PVZ_LIST.filter(
      (p) => p.city === activeChain.finalPvz.city && p.id !== finalPvzId,
    )) {
      if (calcLoadPct(p) > CONFIG.network.maxLoadForHub) {
        overloaded++;
        continue;
      }
      let r = trip("hybrid", p, n, t, incident);
      if (!r) continue;
      const extra = base ? r.eta - base.eta : 0;
      if (slaBreach(extra)) {
        slaBlocked++;
        continue;
      }
      r.compPerOrder = Math.min(r.price, slaCompensation(extra));
      r.price -= r.compPerOrder;
      r.comp = r.compPerOrder * (r.issued - r.returned);
      r.income -= r.comp;
      r.margin = r.income - r.costs;
      let v = r.res[0],
        available = room(p);
      const overlaps = book.filter(
        (x) => x.id === p.id && x.b > v.a && x.a < v.b,
      );
      if (
        available.litres < v.litres ||
        overlaps.length ||
        v.work > available.minutes
      ) {
        capacityBlocked++;
        continue;
      }
      let feasible = true;
      for (
        let hour = Math.floor(v.a / 60);
        hour <= Math.floor(v.b / 60);
        hour++
      ) {
        let work = [...book.filter((x) => x.id === p.id), v].reduce(
          (sum, x) =>
            sum +
            Math.max(
              0,
              Math.min(x.b, 60 * (hour + 1)) - Math.max(x.a, 60 * hour),
            ),
          0,
        );
        if (work > available.minutes) feasible = false;
      }
      if (!feasible) capacityBlocked++;
      if (feasible && (!best || r.margin > best.margin)) best = r;
    }
  if (best && (!base || best.margin >= base.margin)) return best;
  if (!base) return null;
  base.reason = best
    ? "Через СЦ выгоднее для WB"
    : [
        overloaded && "Загрузка выше " + CONFIG.network.maxLoadForHub + "%",
        slaBlocked && "Превышен допуск SLA",
        capacityBlocked && "Не хватает полки или времени персонала",
      ]
        .filter(Boolean)
        .join(" · ") || "Нет подходящего ПВЗ по габаритам";
  base.canWait = capacityBlocked > 0;
  return base;
}
function schedule(mode) {
  const rate = (140 * val("flowSlider")) / 100 / 60,
    demand = Math.floor(rate * CONFIG.shiftMinutes),
    fleet = Array(val("truckCountSlider")).fill(0),
    book = [],
    trips = [];
  let sent = 0;
  while (sent < demand) {
    const n = Math.min(manifest(), demand - sent);
    if (!n) break;
    let v = fleet.indexOf(Math.min(...fleet)),
      t = Math.max(fleet[v], (sent + n) / rate);
    const incident = !trips.length ? el("incident").value : "none";
    let r = choose(mode, n, t, incident, book);
    if (mode === "hybrid" && r?.mode === "direct" && r.canWait) {
      for (const delay of [15, 30]) {
        const alt = choose(mode, n, t + delay, incident, book, t);
        if (alt?.mode === "hybrid" && alt.end <= CONFIG.shiftMinutes) {
          r = alt;
          break;
        }
      }
    }
    if (!r || r.end > CONFIG.shiftMinutes) break;
    r.van = v + 1;
    fleet[v] = r.end;
    sent += n;
    book.push(...r.res);
    trips.push(r);
  }
  return { trips, demand };
}
function metrics(mode, t, run = runs[mode]) {
  let issued = 0,
    back = 0,
    pvz = 0,
    pvzBase = 0,
    pvzHub = 0,
    comp = 0,
    margin = 0,
    finished = 0;
  for (const r of run.trips) {
    if (r.start > t) continue;
    for (const s of r.scans)
      if (s.t <= t) {
        issued += s.delta;
        back += s.back;
      }
    if (r.end <= t) {
      finished++;
      pvz += r.pvz;
      pvzBase += r.pvzBase;
      pvzHub += r.pvzHub;
      comp += r.comp;
      margin += r.margin;
    }
  }
  return {
    issued,
    back,
    pvz,
    pvzBase,
    pvzHub,
    comp,
    margin: margin - (CONFIG.shiftFixed * t) / CONFIG.shiftMinutes,
    finished,
  };
}
