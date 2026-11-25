"use strict";
const STRATEGIES = {
  hub: "Через СЦ",
  direct: "Через ПВЗ",
  hybrid: "Гибридная",
};
function random(seed) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function spread(points, count) {
  if (count >= points.length) return points.slice();
  const result = [points[0]],
    taken = new Set([points[0].id]),
    dist = new Map();
  while (result.length < count) {
    const last = result.at(-1);
    let pick,
      maximum = -1;
    for (const p of points) {
      if (taken.has(p.id)) continue;
      const d = Math.min(
        dist.get(p.id) ?? Infinity,
        distance([p.lat, p.lon], [last.lat, last.lon]),
      );
      dist.set(p.id, d);
      if (d > maximum) {
        maximum = d;
        pick = p;
      }
    }
    if (!pick) break;
    result.push(pick);
    taken.add(pick.id);
  }
  return result;
}
function demand(s, points) {
  let rng = random(s.seed),
    orders = [],
    visits = [];
  const nearby = points.map((p) =>
    points
      .map((q, i) => [i, distance([p.lat, p.lon], [q.lat, q.lon])])
      .filter(([i]) => points[i] !== p)
      .sort((a, b) => a[1] - b[1]),
  );
  // A sparse active network represents a larger synthetic catchment per point.
  const gaps = nearby.map(neighbours => neighbours[0][1]);
  const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length || 1;
  const weights = gaps.map(gap => Math.max(0.5, Math.min(3, gap / meanGap)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  function drawPoint() {
    let cursor = rng() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) return i;
    }
    return weights.length - 1;
  }
  const coverage = Object.fromEntries(points.map((p, i) => [p.id, {
    neighbour: points[nearby[i][0][0]].id, metres: gaps[i],
    visits: Math.round(s.visits * weights[i] * points.length / totalWeight),
  }]));
  for (let i = 0; i < s.orders; i++) {
    let a =
        s.volumeUnit === "point"
          ? i % points.length
          : drawPoint(),
      b = (a + 1 + Math.floor(rng() * (points.length - 1))) % points.length;
    if (rng() < 0.55)
      b = nearby[a][Math.floor(rng() * Math.min(3, nearby[a].length))][0];
    let minute =
      s.profile === "peak"
        ? Math.floor(410 + (180 * (rng() + rng())) / 2)
        : Math.floor(rng() * 580);
    const kind = rng() * 100;
    const bulky = kind < (s.bulkyShare ?? 12);
    const parcel = bulky ? "Габаритная" : rng() < 0.40 ? "Средняя" : "Малая";
    const dimensions = bulky ? [90, 30, 25] : parcel === "Средняя" ? [40, 25, 15] : [20, 15, 10];
    orders.push({
      parcel, bulky, dimensions, kg: bulky ? 18 : parcel === "Средняя" ? 6 : 1,
      consent: bulky && rng() * 100 < (s.consentShare ?? 50),
      id: i + 1,
      a: points[a].id,
      b: points[b].id,
      t: minute,
      receipt: Math.max(0, minute - Math.floor(rng() * 90)),
      volume: dimensions.reduce((v, n) => v * n, 1) / 1000,
      delay: 10 + Math.floor(rng() * 60),
      returned: s.profile === "return" && rng() < 0.12,
      age: s.profile === "stock" ? 4 + Math.floor(rng() * 6) : 0,
    });
  }
  for (const p of points)
    for (let i = 0; i < coverage[p.id].visits; i++) {
      let t =
        s.profile === "peak" ? 350 + (220 * (rng() + rng())) / 2 : rng() * 660;
      visits.push({ node: p.id, t, parcel: rng() < 0.18 });
    }
  return { orders, visits, coverage };
}
function simulate(net, points, hub, input, s, mode) {
  const rng = net.byId,
    closed = s.closed || 0,
    orders = input.orders.map((o) => ({
      ...o,
      history: [],
      cost: 0,
      pvz: 0,
      labor: 0,
      buyer: 0, loaders: 0, premiumPVZ: 0, premiumMP: 0, premiumPaid: 0,
      storagePayment: 0, spaceCost: 0, sorting: 0,
      seller: 0,
      legs: [],
      status: "Ожидает",
    }));
  const nodes = new Map(
    [...points, hub].map((p) => [
      p.id,
      {
        id: p.id,
        ...input.coverage?.[p.id],
        shelf: 0, reserved: 0,
        max: 0,
        free: Array(s.staff).fill(0),
        peakWait: 0, partnerIncome: 0, partnerCost: 0,
        wait: 0,
        ops: 0,
        parcels: 0,
      },
    ]),
  );
  const waves = new Map();
  const fleet = Array.from({ length: s.vans }, (_, i) => ({
      id: i + 1,
      at: hub.id,
      busy: false,
    })),
    trips = [],
    pending = [],
    bags = new Map(),
    ev = new Heap();
  let seq = 0,
    kilometres = 0,
    driverWait = 0,
    end = 0,
    unserved = 0;
  // Stable event order for simultaneous arrivals.
  function schedule(t, fn) {
    ev.push([t + seq++ * 1e-12, t, fn]);
  }
  function note(o, t, msg) {
    o.history.push([Math.round(t * 10) / 10, msg]);
    o.status = msg;
  }
  let now = 0;
  function stock(id, delta) {
    let n = nodes.get(id);
    n.shelf += delta;
    n.max = Math.max(n.max, n.shelf);
    (n.stockHistory ??= []).push([now, n.shelf]);
  }
  function service(id, t, mins) {
    const n = nodes.get(id);
    let slot = n.free.indexOf(Math.min(...n.free)),
      start = Math.max(n.free[slot], t);
    n.free[slot] = start + mins;
    n.ops++;
    n.wait += start - t;
    n.peakWait = Math.max(n.peakWait, start - t);
    if (start > t) {
      (n.queueEvents ??= []).push([t, 1], [start, -1]);
    }
    return start + mins;
  }
  function charge(o, c, p, l, point = o.a) {
    nodes.get(point).partnerIncome += p;
    nodes.get(point).partnerCost += l;
    o.cost += c;
    o.pvz += p;
    o.labor += l;
  }
  function finish(o, t) {
    const pickup = service(o.b, t, 2);
    schedule(pickup, () => {
      stock(o.b, -o.volume);
      o.issued = pickup;
      o.seller = 850 * 0.88 - 495;
      o.buyer = o.quote;
      if (o.premium) {
        o.premiumPaid = o.premium;
        o.premiumPVZ = Math.round(o.premium * 0.35);
        o.loaders = Math.round(o.premium * 0.40);
        o.premiumMP = o.premium - o.premiumPVZ - o.loaders;
        charge(o, o.premiumPVZ + o.loaders, o.premiumPVZ, 0);
      }
      charge(o, 8, 8, 4, o.b);
      note(o, pickup, "Выдан покупателю");
      if (o.returned)
        schedule(pickup + 30, () => {
          let ready = service(o.b, pickup + 30, 3);
          schedule(ready, () => {
            o.seller = 0;
            o.buyer = 0; // Pilot refunds delivery on a modeled return.
            stock(o.b, o.volume);
            charge(o, 12, 12, 6, o.b);
            note(o, ready, "Возврат принят");
            queue(o, o.b, o.a, ready, "return");
          });
        });
    });
  }
  function enqueueTrip(items, from, to, stage, ready) {
    pending.push({ items, from, to, stage, ready });
    dispatch(ready);
  }
  function queue(o, from, to, ready, stage) {
    const interval = mode === "direct" ? 10 : s.interval,
      at =
        stage === "inbound" || (stage === "delivery" && from !== hub.id)
          ? ready + 0.0001
          : (Math.floor(ready / interval) + 1) * interval;
    if (stage === "choose") {
      for (const tag of ["a:" + from, "b:" + to]) {
        let k = at + tag;
        waves.set(k, (waves.get(k) || 0) + 1);
      }
    }
    const key = [from, to, stage, at].join("|");
    if (!bags.has(key)) {
      bags.set(key, []);
      schedule(at, () => {
        let list = bags.get(key);
        bags.delete(key);
        if (stage === "choose") {
          let d = net.route(rng.get(from), rng.get(to), closed),
            a = net.route(rng.get(from), hub, closed),
            b = net.route(hub, rng.get(to), closed);
          const vehicleLitres = s.vanLitres ?? 1200;
          let batch = Math.min(s.capacity, list.length,
            Math.max(1, Math.floor(vehicleLitres / (list.reduce((v, o) => v + o.volume, 0) / list.length))));
          const cost = (r) =>
            r ? s.launch + r.km * s.perKm + r.min * s.traffic * 2 : Infinity;
          const inboundLoad = Math.min(
              s.capacity,
              waves.get(at + "a:" + from) || 1,
            ),
            outboundLoad = Math.min(s.capacity, waves.get(at + "b:" + to) || 1);
          const origin = nodes.get(from), destination = nodes.get(to);
          for (const item of list) {
            const pressure = Math.min(2, origin.shelf / s.shelf);
            const days = item.age + (at - (item.receipt ?? item.t)) / 1440;
            const hosting = item.atSeller ? 0 : item.volume * (s.storageRate ?? 0.12) * days * (1 + pressure);
            const payment = s.tariff * (1 + 0.2 * pressure);
            item.storagePayment = hosting;
            item.spaceCost = item.atSeller ? 0 : item.volume * days * (s.spaceRate ?? 0.06);
            charge(item, hosting, hosting, item.spaceCost);
            const sorting = (s.sortRate ?? 32) + 0.16 * item.volume;
            const hubUnit = cost(a) / inboundLoad + cost(b) / outboundLoad + sorting + hosting + 8 +
              (12 + s.interval / 2) * item.volume * 0.001;
            const directUnit = cost(d) / batch + payment + hosting + 8;
            // Pilot buyer tariffs. The marketplace covers the unbilled share.
            const quote = unit => Math.round(0.35 * unit);
            const directPrice = quote(directUnit), hubPrice = quote(hubUnit);
            const premium = item.bulky ? (s.premium ?? 120) : 0;
            const networkShare = premium - Math.round(premium * 0.35) - Math.round(premium * 0.4);
            const room = destination.shelf + destination.reserved + item.volume <= s.shelf;
            const consent = !item.bulky || (item.consent && premium > 0);
            const economical = directUnit - directPrice - networkShare < hubUnit - hubPrice;
            const mesh = mode !== "hub" && !item.atSeller && d && room && consent &&
              (mode === "direct" || !a || !b || economical);
            item.estimates = [directUnit, hubUnit].map(v => Number.isFinite(v) ? v : null);
            item.prices = [directPrice + premium, hubPrice].map(v => Number.isFinite(v) ? v : null);
            item.sortRate = sorting;
            item.policy = mesh ? "ПВЗ → ПВЗ" : "Через СЦ";
            item.reason = mode === "hub" ? "Базовая схема через СЦ" :
              !consent ? "Габаритная: платная доставка не выбрана" :
              item.atSeller ? "Полка отправления заполнена: отгрузка продавца через СЦ" :
              !room ? "В точке выдачи недостаточно свободного места" :
              !d ? "Нет прямого проезда" : mesh ? "Прямое поручение на перевозку" :
              "Через СЦ ниже прогноз расходов после оплаты доставки";
            item.premium = mesh ? premium : 0;
            item.quote = mesh ? directPrice + premium : Number.isFinite(hubPrice) ? hubPrice : 0;
            note(item, at, item.policy);
            if (mesh) {
              item.processingPayment = payment;
              destination.reserved += item.volume;
              charge(item, payment, payment, 9 + item.age);
            }
            queue(item, from, mesh ? to : hub.id, at, mesh ? "delivery" : "inbound");
          }
        } else {
          let group = [], litres = 0;
          for (const item of list) {
            if (group.length && (group.length >= s.capacity || litres + item.volume > (s.vanLitres ?? 1200))) {
              enqueueTrip(group, from, to, stage, at);
              group = []; litres = 0;
            }
            group.push(item);
            litres += item.volume;
          }
          if (group.length) enqueueTrip(group, from, to, stage, at);
        }
      });
    }
    bags.get(key).push(o);
  }
  let head = 0;
  function dispatch(t) {
    while (head < pending.length) {
      let free = fleet.filter((v) => !v.busy);
      if (!free.length) return;
      const task = pending[head++],
        from = rng.get(task.from),
        to = rng.get(task.to),
        line = net.route(from, to, closed);
      let van = null,
        empty = null;
      for (const candidate of free) {
        const leg = net.route(rng.get(candidate.at), from, closed);
        if (leg && (!empty || leg.min < empty.min)) {
          van = candidate;
          empty = leg;
        }
      }
      if (!line || !van) {
        if (line && free.length < fleet.length) {
          head--;
          return;
        }
        for (let o of task.items) {
          if (task.stage === "delivery" && task.from !== hub.id)
            nodes.get(task.to).reserved -= o.volume;
          note(o, t, "Нет проезда");
          unserved++;
        }
        continue;
      }
      van.busy = true;
      const deadStart = t,
        arrive = t + empty.min * s.traffic;
      schedule(arrive, () => {
        const load = 2 + 0.35 * task.items.length,
          leave = service(from.id, arrive, load);
        driverWait += leave - arrive - load;
        schedule(leave, () => {
          for (const o of task.items) {
            if (!(o.atSeller && !o.legs.length)) stock(from.id, -o.volume);
            if (from.id === hub.id && o.hubArrival != null) {
              o.hubMinutes = leave - o.hubArrival;
              o.hubHolding = o.hubMinutes * o.volume * 0.001;
              charge(o, o.hubHolding, 0, 0);
            }
          }
          let arrival = leave + line.min * s.traffic;
          schedule(arrival, () => {
            let unload = service(to.id, arrival, 2 + 0.22 * task.items.length),
              km = empty.km + line.km;
            const cost = s.launch + km * s.perKm + (unload - deadStart) * 2;
            const trip = {
              id: trips.length + 1,
              van: van.id,
              from: from.id,
              to: to.id,
              emptyFrom: van.at,
              start: deadStart,
              arrive,
              leave,
              arrival,
              end: unload,
              km,
              count: task.items.length,
              litres: task.items.reduce((total, o) => total + o.volume, 0),
              cost,
              stage: task.stage,
            };
            trips.push(trip);
            kilometres += km;
            schedule(unload, () => {
              for (const o of task.items) {
                if (task.stage === "delivery" && task.from !== hub.id)
                  nodes.get(to.id).reserved -= o.volume;
                stock(to.id, o.volume);
                o.legs.push(trip.id);
                charge(o, cost / task.items.length, 0, 0);
                if (task.stage === "inbound") {
                  o.hubArrival = unload;
                  o.sorting = o.sortRate;
                  charge(o, o.sorting, 0, 0);
                  note(o, unload, "Сортировка на складе");
                  queue(o, to.id, o.b, service(to.id, unload, 1 + 0.04 * o.volume) + 12, "delivery");
                } else if (task.stage === "return") {
                  note(o, unload, "Возврат на остатке");
                } else {
                  note(o, unload, "Готов к выдаче");
                  schedule(unload + o.delay, () => finish(o, unload + o.delay));
                }
              }
              van.at = to.id;
              van.busy = false;
              dispatch(unload);
            });
          });
        });
      });
    }
  }
  for (const v of input.visits)
    schedule(v.t, () => {
      let ready = service(v.node, v.t, v.parcel ? 5 : 2);
      if (v.parcel)
        schedule(ready, () => {
          stock(v.node, 2);
          nodes.get(v.node).parcels++;
          schedule((Math.floor(ready / 60) + 1) * 60, () => stock(v.node, -2));
        });
    });
  for (const o of orders)
    schedule(mode === "hub" || (o.bulky && (!o.consent || s.premium === 0)) ? o.t : (o.receipt ?? o.t), () => {
      const n = nodes.get(o.a);
      const full = n.shelf + n.reserved + o.volume > s.shelf;
      o.atSeller = mode === "hub" || (o.bulky && (!o.consent || s.premium === 0 || full));
      if (full && !o.atSeller) {
        note(o, now, "Отказ приёмки · нет места");
        unserved++;
        return;
      }
      if (!o.atSeller) stock(o.a, o.volume);
      note(o, now, o.atSeller ? "Запас у продавца · отгрузка через СЦ" : "Приёмка на полку пилота");
      const accepted = o.atSeller ? o.t : service(o.a, now, 2);
      schedule(Math.max(o.t, accepted), () => {
        note(o, now, "Заказ получен · резерв");
        const ready = service(o.a, now, 1);
        schedule(ready, () => {
          note(o, ready, "Собран");
          queue(o, o.a, o.b, ready, "choose");
        });
      });
    });
  while (ev.items.length) {
    let [, t, fn] = ev.pop();
    now = t;
    end = Math.max(end, t);
    fn();
  }
  for (let n of nodes.values()) {
    let q = 0;
    n.queueHistory = (n.queueEvents || [])
      .sort((a, b) => a[0] - b[0])
      .map(([t, d]) => [t, (q += d)]);
    delete n.queueEvents;
  }
  let cost = 0,
    profit = 0,
    seller = 0,
    minutes = 0,
    issued = 0;
  const bySize = {};
  for (let o of orders) {
    const row = bySize[o.parcel] ??= { orders: 0, issued: 0, buyer: 0, cost: 0, minutes: 0 };
    row.orders++;
    row.cost += o.cost;
    row.buyer += o.buyer;
    if (o.issued != null) {
      row.issued++;
      row.minutes += o.issued - o.t;
    }
    cost += o.cost;
    profit += o.pvz - o.labor;
    seller += o.seller;
    if (o.issued != null) {
      issued++;
      minutes += o.issued - o.t;
    }
  }
  return {
    mode,
    bySize,
    cost,
    profit,
    seller,
    hubMinutes: orders.reduce((sum, o) => sum + (o.hubMinutes || 0), 0),
    commission: orders.reduce((sum, o) => sum + (o.issued != null && !o.returned ? 850 * 0.12 : 0), 0),
    buyer: orders.reduce((sum, o) => sum + o.buyer, 0),
    loaders: orders.reduce((sum, o) => sum + o.loaders, 0),
    sorting: orders.reduce((sum, o) => sum + o.sorting, 0),
    local: orders.filter(o => o.policy === "ПВЗ → ПВЗ").length,
    minutes: minutes / (issued || 1),
    issued,
    trips,
    orders,
    km: kilometres,
    wait: driverWait,
    end,
    unserved,
    nodes: [...nodes.values()],
  };
}
