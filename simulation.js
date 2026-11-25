"use strict";
const STRATEGIES = {
  hub: "Через склад",
  direct: "Прямые рейсы",
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
  for (let i = 0; i < s.orders; i++) {
    let a =
        s.volumeUnit === "point"
          ? i % points.length
          : Math.floor(rng() * points.length),
      b = (a + 1 + Math.floor(rng() * (points.length - 1))) % points.length;
    if (rng() < 0.55)
      b = nearby[a][Math.floor(rng() * Math.min(3, nearby[a].length))][0];
    let minute =
      s.profile === "peak"
        ? Math.floor(410 + (180 * (rng() + rng())) / 2)
        : Math.floor(rng() * 580);
    orders.push({
      id: i + 1,
      a: points[a].id,
      b: points[b].id,
      t: minute,
      volume: 2 + Math.floor(rng() * 5),
      delay: 10 + Math.floor(rng() * 60),
      returned: s.profile === "return" && rng() < 0.12,
      age: s.profile === "stock" ? 4 + Math.floor(rng() * 6) : 0,
    });
  }
  for (const p of points)
    for (let i = 0; i < s.visits; i++) {
      let t =
        s.profile === "peak" ? 350 + (220 * (rng() + rng())) / 2 : rng() * 660;
      visits.push({ node: p.id, t, parcel: rng() < 0.18 });
    }
  return { orders, visits };
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
      seller: 0,
      legs: [],
      status: "Ожидает",
    }));
  const nodes = new Map(
    [...points, hub].map((p) => [
      p.id,
      {
        id: p.id,
        shelf: 0,
        max: 0,
        free: Array(s.staff).fill(0),
        peakWait: 0,
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
    unserved = 0,
    serviceProfit = 0;
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
  function charge(o, c, p, l) {
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
      charge(o, 8, 8, 4);
      note(o, pickup, "Выдан покупателю");
      if (o.returned)
        schedule(pickup + 30, () => {
          let ready = service(o.b, pickup + 30, 3);
          schedule(ready, () => {
            o.seller = 0;
            stock(o.b, o.volume);
            charge(o, 12, 12, 6);
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
          let batch = Math.min(s.capacity, list.length);
          const cost = (r) =>
            r ? s.launch + r.km * s.perKm + r.min * s.traffic * 2 : Infinity;
          const inboundLoad = Math.min(
              s.capacity,
              waves.get(at + "a:" + from) || 1,
            ),
            outboundLoad = Math.min(s.capacity, waves.get(at + "b:" + to) || 1);
          const directUnit = cost(d) / batch + s.tariff + list[0].age * 3,
            hubUnit = cost(a) / inboundLoad + cost(b) / outboundLoad + 32;
          let mesh =
            mode === "direct" ||
            (mode === "hybrid" && d && directUnit < hubUnit);
          const target = mesh ? to : hub.id;
          for (const item of list) {
            item.estimates = [
              Number.isFinite(directUnit) ? directUnit : null,
              Number.isFinite(hubUnit) ? hubUnit : null,
            ];
            item.policy = mesh ? "Прямой рейс" : "Через склад";
            note(item, at, item.policy);
            if (mesh)
              charge(
                item,
                s.tariff + item.age * 3,
                s.tariff + item.age * 3,
                9 + item.age,
              );
            queue(item, from, target, at, mesh ? "delivery" : "inbound");
          }
        } else {
          for (let i = 0; i < list.length; i += s.capacity)
            enqueueTrip(list.slice(i, i + s.capacity), from, to, stage, at);
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
          for (const o of task.items) stock(from.id, -o.volume);
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
              cost,
              stage: task.stage,
            };
            trips.push(trip);
            kilometres += km;
            schedule(unload, () => {
              for (const o of task.items) {
                stock(to.id, o.volume);
                o.legs.push(trip.id);
                charge(o, cost / task.items.length, 0, 0);
                if (task.stage === "inbound") {
                  charge(o, 32, 0, 0);
                  note(o, unload, "Сортировка на складе");
                  queue(o, to.id, o.b, unload + 12, "delivery");
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
    schedule(o.t, () => {
      let n = nodes.get(o.a);
      if (n.shelf + o.volume > s.shelf) {
        note(o, o.t, "Отказ приёмки · нет места");
        unserved++;
        return;
      }
      stock(o.a, o.volume);
      note(o, o.t, "Приёмка и резерв");
      let ready = service(o.a, o.t, 2);
      schedule(ready, () => {
        note(o, ready, "Собран");
        queue(o, o.a, o.b, ready, "choose");
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
  for (let o of orders) {
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
    cost,
    profit,
    seller,
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
