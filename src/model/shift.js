function choose(mode, n, t, incident, book) {
  const base = trip("direct", null, n, t, incident);
  if (mode === "direct") return base;
  let best;
  if (fits())
    for (const p of PVZ_LIST.filter(
      (p) => p.city === activeChain.finalPvz.city && p.id !== finalPvzId,
    )) {
      let r = trip("hybrid", p, n, t, incident);
      if (!r) continue;
      let v = r.res[0],
        available = room(p);
      const overlaps = book.filter(
        (x) => x.id === p.id && x.b > v.a && x.a < v.b,
      );
      if (
        available.litres < v.litres ||
        overlaps.length ||
        v.work > available.minutes
      )
        continue;
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
      if (feasible && (!best || r.margin > best.margin)) best = r;
    }
  if (best && (!base || best.margin >= base.margin)) return best;
  if (!base) return null;
  base.reason = best
    ? "Через СЦ выгоднее для WB"
    : "Нет доступного ПВЗ по полке, габаритам или персоналу";
  return base;
}
function schedule(mode) {
  const rate = (140 * val("flowSlider")) / 100 / 60,
    demand = Math.floor(rate * 480),
    fleet = Array(val("truckCountSlider")).fill(0),
    book = [],
    trips = [];
  let sent = 0;
  while (sent < demand) {
    const n = Math.min(manifest(), demand - sent);
    if (!n) break;
    let v = fleet.indexOf(Math.min(...fleet)),
      t = Math.max(fleet[v], (sent + n) / rate);
    let r = choose(
      mode,
      n,
      t,
      !trips.length ? el("incident").value : "none",
      book,
    );
    if (!r || r.end > 480) break;
    r.van = v + 1;
    fleet[v] = r.end;
    sent += n;
    book.push(...r.res);
    trips.push(r);
  }
  return { trips, demand };
}
function metrics(mode, t) {
  let issued = 0,
    back = 0,
    pvz = 0,
    margin = 0,
    finished = 0;
  for (const r of runs[mode].trips) {
    if (r.start > t) continue;
    for (const s of r.scans)
      if (s.t <= t) {
        issued += s.delta;
        back += s.back;
      }
    if (r.end <= t) {
      finished++;
      pvz += r.pvz;
      margin += r.margin;
    }
  }
  return { issued, back, pvz, margin: margin - (4800 * t) / 480, finished };
}
