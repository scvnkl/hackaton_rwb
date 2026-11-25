"use strict";
const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const ru = (x, d = 0) =>
    x.toLocaleString("ru-RU", { maximumFractionDigits: d }),
  rub = (x) => ru(x) + " ₽",
  tm = (v) => {
    let n = Math.round(v) + 480;
    return (
      (n >= 1440 ? "+" + Math.floor(n / 1440) + "д " : "") +
      String(Math.floor(n / 60) % 24).padStart(2, "0") +
      ":" +
      String(n % 60).padStart(2, "0")
    );
  };
const catalog = [
  ["yoshkar-ola", "Йошкар-Ола"],
  ["cheboksary", "Чебоксары"],
  ["kazan", "Казань · центр"],
];
let data,
  points = [],
  byId = new Map(),
  worker,
  summary = null,
  mode = "hybrid",
  routes = {},
  curTrip = null,
  clock = 0,
  timer = null,
  lastSettings = null,
  activeIds = [],
  loadToken = 0,
  runId = 0,
  upload = [];
function workerMain() {
  let net,
    outputs = {},
    generation = 0;
  onmessage = (e) => {
    let m = e.data;
    try {
      if (m.type === "init") {
        net = new RoadNetwork(m.data);
        postMessage({ type: "ready", points: net.points });
        return;
      }
      if (m.type === "run") {
        generation = m.id;
        let s = m.settings,
          hub = net.byId.get(s.hub),
          pool = net.points.filter(
            (p) =>
              p.role === "pickup" &&
              p.id !== s.hub &&
              (!s.brand ||
                (p.operator + " " + p.name)
                  .toLowerCase()
                  .includes(s.brand.toLowerCase())),
          );
        if (!hub || pool.length < 2)
          throw Error(
            "Нужны склад и два доступных ПВЗ выбранного оператора. Выберите все сети или импортируйте точки.",
          );
        net.metric = s.metric;
        let picks;
        if (s.selection === "near") {
          picks = pool
            .sort(
              (a, b) =>
                distance([a.lat, a.lon], [hub.lat, hub.lon]) -
                distance([b.lat, b.lon], [hub.lat, hub.lon]),
            )
            .slice(0, s.active);
        } else if (s.selection === "random") {
          let rng = random(s.seed);
          picks = pool
            .map((p) => [rng(), p])
            .sort((a, b) => a[0] - b[0])
            .slice(0, s.active)
            .map((e) => e[1]);
        } else picks = spread(pool, Math.min(pool.length, s.active));
        const requested = s.orders;
        if (s.volumeUnit === "point")
          s = { ...s, orders: requested * picks.length };
        let input = demand(s, picks),
          metrics = {},
          geoms = {},
          trips = {};
        outputs = {};
        for (const key of Object.keys(STRATEGIES)) {
          postMessage({
            type: "progress",
            text: "Расчёт: " + STRATEGIES[key] + "…",
          });
          const r = simulate(net, picks, hub, input, s, key);
          outputs[key] = r;
          let { orders, trips: all, ...rest } = r;
          metrics[key] = rest;
          trips[key] = all;
          for (const trip of all)
            for (const [a, b] of [
              [trip.emptyFrom, trip.from],
              [trip.from, trip.to],
            ]) {
              const tag = a + ">" + b;
              if (!(tag in geoms))
                geoms[tag] =
                  net.route(net.byId.get(a), net.byId.get(b), s.closed)
                    ?.verts || [];
            }
        }
        postMessage({
          type: "done",
          id: generation,
          metrics,
          trips,
          geoms,
          active: picks.map((p) => p.id),
          count: s.orders,
        });
        return;
      }
      if (m.type === "order" && m.id === generation) {
        let o = outputs[m.mode]?.orders[m.index - 1];
        if (o) postMessage({ type: "order", order: o, mode: m.mode, id: m.id });
      }
    } catch (ex) {
      postMessage({ type: "error", message: ex.message });
    }
  };
}
const workerCode = [
  "const METRES=111195;",
  distance,
  Heap,
  RoadNetwork,
  "const STRATEGIES=" + JSON.stringify(STRATEGIES) + ";",
  random,
  spread,
  demand,
  simulate,
  "(" + workerMain.toString() + ")()",
]
  .map(String)
  .join("\n");
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  $("play").textContent = "▶";
}
function startWorker(d) {
  stop();
  if (worker) worker.terminate();
  let url = URL.createObjectURL(
    new Blob([workerCode], { type: "text/javascript" }),
  );
  worker = new Worker(url);
  URL.revokeObjectURL(url);
  data = d;
  summary = null;
  curTrip = null;
  points = [];
  byId = new Map();
  lastSettings = null;
  activeIds = [];
  routes = {};
  markers.clearLayers();
  lines.clearLayers();
  vehicles.clearLayers();
  $("cards").innerHTML = "";
  $("points").innerHTML = "";
  $("tripInfo").textContent = "";
  $("orderInfo").textContent = "";
  $("time").max = 1;
  $("time").value = 0;
  $("headline").textContent = d.name;
  $("cityLabel").textContent = d.name;
  $("status").textContent = "Привязка точек к автомобильным дорогам…";
  $("run").disabled = true;
  setBase(d);
  worker.onerror = (e) => {
    $("status").textContent = "Ошибка вычисления: " + e.message;
    $("run").disabled = false;
  };
  worker.onmessage = ({ data: m }) => {
    if (m.type === "ready") {
      points = m.points;
      byId = new Map(points.map((p) => [p.id, p]));
      const hubs = points.filter((p) => p.role === "hub"),
        pvz = points.filter((p) => p.role === "pickup");
      let options = hubs
        .map(
          (p) =>
            '<option value="' +
            esc(p.id) +
            '">' +
            esc(shortName(p)) +
            "</option>",
        )
        .join("");
      $("hub").innerHTML =
        options || '<option value="">Склад не найден — выберите точку</option>';
      if (pvz.length)
        $("hub").insertAdjacentHTML(
          "beforeend",
          '<optgroup label="Назначить ПВЗ модельным хабом">' +
            pvz
              .map(
                (p) =>
                  '<option value="' +
                  esc(p.id) +
                  '">' +
                  esc(shortName(p)) +
                  "</option>",
              )
              .join("") +
            "</optgroup>",
        );
      const ways = data.roads.filter(
        (r) => r[1] && /primary|secondary|tertiary/.test(r[2]),
      );
      $("closure").innerHTML =
        '<option value="0">Все открыты</option>' +
        [...new Map(ways.map((r) => [r[0], r])).values()]
          .map(
            (r) =>
              '<option value="' +
              r[0] +
              '">' +
              esc(r[1]) +
              " · " +
              r[0] +
              "</option>",
          )
          .join("");
      $("info").textContent =
        ru(pvz.length) + " ПВЗ · " + ru(hubs.length) + " складских объектов";
      $("brand").value =
        pvz.filter((p) =>
          (p.name + " " + p.operator).toLowerCase().includes("wildberries"),
        ).length >= 2
          ? "Wildberries"
          : "";
      $("active").value = Math.max(2, Math.min(12, pvz.length));
      $("run").disabled = false;
      networkPins(points, new Set(), $("hub").value);
      listPoints();
      if (hubs.length && pvz.length >= 2) run();
      else
        $("status").textContent =
          "Выберите модельный хаб или добавьте GeoJSON с точками.";
    } else if (m.type === "progress") $("status").textContent = m.text;
    else if (m.type === "error") {
      $("status").textContent = m.message;
      $("run").disabled = false;
    } else if (m.type === "done") {
      if (m.id !== runId) return;
      summary = m;
      routes = m.geoms;
      activeIds = m.active;
      $("run").disabled = false;
      $("status").textContent =
        "Рассчитано · " + ru(m.count) + " заказов для каждой стратегии";
      networkPins(points, new Set(m.active), lastSettings.hub);
      $("order").max = m.count;
      showMode(mode, true);
    } else if (
      m.type === "order" &&
      m.mode === mode &&
      m.id === runId &&
      m.order.id === Number($("order").value)
    )
      renderOrder(m.order);
  };
  worker.postMessage({ type: "init", data: d });
}
function shortName(p) {
  return (
    p.name + " · " + (p.address || p.lat.toFixed(4) + ", " + p.lon.toFixed(4))
  );
}
function loadBuiltin(slug) {
  const token = ++loadToken;
  let s = document.createElement("script");
  s.src = "data/" + slug + ".js";
  s.onload = () => {
    s.remove();
    if (token !== loadToken) return;
    startWorker(window.cityData);
    window.cityData = null;
    $("cityDialog").close();
  };
  s.onerror = () => {
    $("searchResults").textContent = "Файл города недоступен.";
  };
  document.head.appendChild(s);
}
const controls = [
  ["seed", "Seed спроса", 42, 0, 1],
  ["staff", "Сотрудников / точку", 3, 1, 1],
  ["interval", "Сбор партии, мин", 45, 1, 1],
  ["shelf", "Полка приёмки, л", 1000, 1, 1],
  ["visits", "Посетителей / точку", 100, 0, 1],
  ["launch", "Выход на рейс, ₽", 240, 0, 1],
  ["perKm", "Стоимость км, ₽", 24, 0, 0.1],
  ["tariff", "Плата ПВЗ, ₽", 18, 0, 0.1],
  ["traffic", "Множитель времени", 1.25, 0.1, 0.05],
];
$("extras").innerHTML = controls
  .map(
    ([id, label, val, min, step]) =>
      "<label>" +
      label +
      '<input id="' +
      id +
      '" type="number" min="' +
      min +
      '" step="' +
      step +
      '" value="' +
      val +
      '" required></label>',
  )
  .join("");
function run() {
  if (!$("settings").reportValidity()) return;
  let p = {};
  for (const id of [
    "orders",
    "active",
    "vans",
    "capacity",
    ...controls.map((i) => i[0]),
  ]) {
    p[id] = Number($(id).value);
    if (!Number.isFinite(p[id]) || p[id] > Number.MAX_SAFE_INTEGER) {
      $("status").textContent = "Проверьте число " + id;
      return;
    }
  }
  Object.assign(p, {
    hub: $("hub").value,
    volumeUnit: $("volumeUnit").value,
    selection: $("selection").value,
    metric: $("metric").value,
    brand: $("brand").value,
    closed: Number($("closure").value),
    profile: $("profile").value,
  });
  stop();
  lastSettings = p;
  $("run").disabled = true;
  $("status").textContent = "Готовим общий поток…";
  worker.postMessage({ type: "run", id: ++runId, settings: p });
}
$("settings").onsubmit = (e) => {
  e.preventDefault();
  run();
};
for (const [id, label] of Object.entries(STRATEGIES)) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.key = id;
  b.onclick = () => showMode(id, true);
  $("modes").append(b);
}
function showMode(k, fit) {
  if (!summary) return;
  stop();
  mode = k;
  document
    .querySelectorAll("#modes button")
    .forEach((b) => b.classList.toggle("on", b.dataset.key === k));
  $("cards").innerHTML = Object.entries(summary.metrics)
    .map(
      ([key, r]) =>
        '<button class="card ' +
        (key === mode ? "selected" : "") +
        '" data-mode="' +
        key +
        '"><span>' +
        STRATEGIES[key] +
        "</span><b>" +
        rub(r.cost / summary.count) +
        "</b><small>на исходный заказ</small><footer>" +
        ru(r.km) +
        " км · " +
        ru(r.trips?.length ?? summary.trips[key].length) +
        " рейсов · " +
        ru(r.issued) +
        " / " +
        ru(summary.count) +
        " выдано<br>Средний срок " +
        ru(r.minutes) +
        " мин · прибыль ПВЗ " +
        rub(r.profit) +
        "</footer></button>",
    )
    .join("");
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => showMode(b.dataset.mode, true)));
  const all = summary.trips[mode];
  $("trip").max = all.length;
  $("trip").value = 1;
  $("time").max = Math.ceil(summary.metrics[mode].end);
  selectTrip(0, fit);
  requestOrder();
}
function withGeom(trip) {
  return {
    ...trip,
    dead: routes[trip.emptyFrom + ">" + trip.from] || [],
    loaded: routes[trip.from + ">" + trip.to] || [],
  };
}
function selectTrip(index, fit) {
  let trip = summary.trips[mode][index];
  if (!trip) {
    curTrip = null;
    tripLines(data, null, false);
    $("tripInfo").textContent = "Нет доступных рейсов.";
    return;
  }
  curTrip = withGeom(trip);
  $("trip").value = index + 1;
  $("tripInfo").innerHTML =
    '<div class="details"><b>' +
    esc(shortName(byId.get(trip.from))) +
    " → " +
    esc(shortName(byId.get(trip.to))) +
    '</b><div class="tags"><span>Машина ' +
    trip.van +
    "</span><span>" +
    ru(trip.km, 1) +
    " км с подачей</span><span>" +
    trip.count +
    " заказов</span><span>" +
    rub(trip.cost) +
    "</span></div>Подача " +
    tm(trip.arrive) +
    " · выезд " +
    tm(trip.leave) +
    " · прибытие " +
    tm(trip.arrival) +
    "</div>";
  tripLines(data, curTrip, fit);
  setTime(trip.leave);
}
function requestOrder() {
  if (summary)
    worker.postMessage({
      type: "order",
      index: Number($("order").value),
      mode,
      id: runId,
    });
}
function renderOrder(o) {
  let name = (id) => esc(shortName(byId.get(id)));
  $("orderInfo").innerHTML =
    '<div class="details"><b>' +
    name(o.a) +
    " → " +
    name(o.b) +
    '</b><div class="tags"><span>' +
    esc(o.policy || o.status) +
    "</span><span>Расходы МП " +
    rub(o.cost) +
    "</span><span>Прибыль ПВЗ " +
    rub(o.pvz - o.labor) +
    "</span><span>Продавец " +
    rub(o.seller) +
    "</span></div>" +
    (o.estimates
      ? "Прогноз на момент решения, на заказ: прямой " +
        (o.estimates[0] === null ? "недоступен" : rub(o.estimates[0])) +
        ", через склад " +
        (o.estimates[1] === null ? "недоступен" : rub(o.estimates[1])) +
        ".<br>"
      : "") +
    o.history.map(([t, msg]) => tm(t) + " " + esc(msg)).join(" · ") +
    "<p>" +
    o.legs
      .map(
        (id) =>
          '<button class="tripLink" data-trip="' +
          id +
          '">Рейс ' +
          id +
          " ↗</button>",
      )
      .join(" ") +
    "</p></div>";
  $("orderInfo")
    .querySelectorAll("[data-trip]")
    .forEach(
      (b) => (b.onclick = () => selectTrip(Number(b.dataset.trip) - 1, true)),
    );
}
$("order").onchange = requestOrder;
$("trip").onchange = () => {
  if (summary) selectTrip(Number($("trip").value) - 1, true);
};
function setTime(t) {
  clock = t;
  $("time").value = t;
  $("timeLabel").textContent = tm(t);
  truckAt(data, curTrip, t);
  if (map._popup) map._popup.update();
  if (summary) {
    for (const trip of summary.trips[mode]) {
      if (trip.id === curTrip?.id || trip.start > t || trip.end < t) continue;
      truckAt(data, withGeom(trip), t, false);
    }
  }
}
$("time").oninput = (e) => setTime(Number(e.target.value));
$("play").onclick = () => {
  if (!summary) return;
  if (timer) {
    stop();
    return;
  }
  if (clock >= Number($("time").max)) setTime(0);
  $("play").textContent = "Ⅱ";
  timer = setInterval(() => {
    let t = Math.min(clock + 1, Number($("time").max));
    setTime(t);
    if (t >= Number($("time").max)) stop();
  }, 220);
};
$("fit").onclick = () => {
  if (curTrip) {
    tripLines(data, curTrip, true);
    setTime(curTrip.leave);
  }
};
function stateForPoint(p) {
  let n = summary?.metrics[mode].nodes.find((x) => x.id === p.id);
  if (!n) return "";
  const last = (list) => {
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      let mid = (lo + hi) >> 1;
      if (list[mid][0] <= clock) lo = mid + 1;
      else hi = mid;
    }
    return lo ? list[lo - 1][1] : 0;
  };
  return (
    "<br><b>" +
    tm(clock) +
    "</b> · остаток " +
    ru(last(n.stockHistory || [])) +
    " л · ожидают " +
    last(n.queueHistory || []) +
    "<br>Пик за прогон " +
    ru(n.max) +
    " л · максимальное ожидание " +
    ru(n.peakWait) +
    " мин"
  );
}
function listPoints() {
  let q = $("pointSearch").value.toLowerCase();
  let matches = points.filter((p) =>
    (p.name + " " + p.address + " " + p.operator).toLowerCase().includes(q),
  );
  $("points").innerHTML = matches
    .map(
      (p) =>
        '<button class="point" data-id="' +
        esc(p.id) +
        '">' +
        esc(shortName(p)) +
        "<small>" +
        esc(p.role === "hub" ? "Складской объект" : "ПВЗ") +
        " · " +
        (p.url.includes("openstreetmap") ? "OpenStreetMap" : "Каталог точек") +
        "</small></button>",
    )
    .join("");
}
$("pointSearch").oninput = listPoints;
$("points").onclick = (e) => {
  let b = e.target.closest("[data-id]");
  if (!b) return;
  let p = byId.get(b.dataset.id);
  map.setView([p.lat, p.lon], 16);
  markerById.get(p.id)?.openPopup();
};
function saveFile(name, text, type) {
  let url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("export").onclick = () => {
  if (summary)
    saveFile(
      "mesh-atlas-experiment.json",
      JSON.stringify(
        {
          city: data.name,
          settings: lastSettings,
          activePoints: activeIds,
          geometryDate: data.date,
          strategies: summary.metrics,
          trips: summary.trips,
        },
        null,
        2,
      ),
      "application/json",
    );
};
$("cityButton").onclick = () => $("cityDialog").showModal();
document
  .querySelectorAll(".close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
for (const [slug, name] of catalog) {
  const b = document.createElement("button");
  b.textContent = name;
  b.onclick = () => loadBuiltin(slug);
  $("builtins").append(b);
}
async function api(path, params) {
  if (location.protocol === "file:")
    throw Error("Для онлайн-поиска откройте Start.cmd в папке MeshAtlas.");
  const r = await fetch("/api/" + path + "?" + new URLSearchParams(params));
  let d = await r.json();
  if (!r.ok) throw Error(d.error || "Сервис недоступен");
  return d;
}
$("citySearch").onsubmit = async (e) => {
  e.preventDefault();
  const box = $("searchResults");
  box.textContent = "Ищем город…";
  let q = $("query").value.trim();
  try {
    let coords = q.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
    let found = coords
      ? [{ name: q, lat: +coords[1], lon: +coords[2] }]
      : await api("search", { q });
    box.replaceChildren();
    if (!found.length)
      box.textContent = "Совпадений нет. Укажите страну или координаты.";
    for (let p of found) {
      let b = document.createElement("button");
      b.textContent = p.name;
      b.onclick = async () => {
        let id = ++loadToken;
        box.textContent =
          "Загрузка дорог, поворотных ограничений и точек. Это может занять несколько минут…";
        try {
          let radius = $("radius").value;
          if (radius === "city" && !p.bounds)
            throw Error(
              "Для этой точки геокодер не дал границы. Выберите радиус и повторите поиск.",
            );
          let d = await api("city", {
            lat: p.lat,
            lon: p.lon,
            name: p.name.split(",")[0],
            km: radius === "city" ? 6 : radius,
            bounds: radius === "city" ? p.bounds : "",
          });
          if (id !== loadToken) return;
          startWorker(d);
          $("cityDialog").close();
          box.textContent = "";
        } catch (err) {
          if (id === loadToken) box.textContent = err.message;
        }
      };
      box.append(b);
    }
  } catch (err) {
    box.textContent = err.message;
  }
};
$("sourceButton").onclick = () => {
  if (!data) return;
  $("sources").innerHTML =
    "<p><b>" +
    esc(data.name) +
    "</b> · снимок " +
    esc(data.date) +
    " · " +
    ru(data.roads.length) +
    ' участков дорог. Используются автомобильные рёбра, одностороннее движение и поддерживаемые запреты поворота OSM через узел.</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap / ODbL</a> · <a href="https://download.openstreetmap.fr/extracts/" target="_blank">Региональные выгрузки</a> · <a href="https://punkty-vydachi.ru/" target="_blank">Каталог ПВЗ</a>. Ссылка на исходную карточку доступна у каждого объекта.</p><p>Склад OSM означает здание или объект с соответствующим тегом. Оператор, пригодность для маркетплейса и актуальная загрузка требуют подтверждения. Выбранный склад играет роль хаба в эксперименте.</p><p>Спрос, очередь, запасы и тарифы моделируются. Время в пути рассчитано по классу улицы, ограничению скорости и множителю трафика. Привязка к ближайшему узлу сети — до 700 м. Путь от ворот до этого узла не тарифицируется.</p><p>Экономика: подача + километраж с холостым пробегом + 2 ₽ за минуту работы машины. Складская сортировка 32 ₽/заказ; выдача 8 ₽. Заказ на 850 ₽, комиссия 12%, закупка 495 ₽. Стоимость экспериментальной партии не включает постоянные расходы бизнеса.</p>';
  $("sourceDialog").showModal();
};
$("geoImport").onclick = () => $("geoFile").click();
$("geoFile").onchange = async (e) => {
  try {
    const obj = JSON.parse(await e.target.files[0].text());
    if (
      obj.type !== "FeatureCollection" ||
      !Array.isArray(obj.features) ||
      !obj.features.length
    )
      throw Error("Нужна непустая коллекция GeoJSON FeatureCollection");
    const [s, w, n, east] = data.bbox,
      extra = obj.features.map((f, i) => {
        let p = f.properties || {},
          c = f.geometry?.coordinates;
        if (
          f.geometry?.type !== "Point" ||
          !Array.isArray(c) ||
          !c.every(Number.isFinite) ||
          c[0] < w ||
          c[0] > east ||
          c[1] < s ||
          c[1] > n ||
          !["pickup", "hub"].includes(p.role) ||
          !p.name ||
          safeUrl(p.url) === "#"
        )
          throw Error(
            "Объект " +
              (i + 1) +
              ": проверьте границы города, тип точки, название и URL источника",
          );
        return {
          id: "external:" + c.slice(0, 2).join(",") + ":" + p.role,
          role: p.role,
          name: String(p.name),
          address: String(p.address || ""),
          operator: String(p.operator || ""),
          lat: c[1],
          lon: c[0],
          url: p.url,
        };
      });
    let merged = new Map(data.points.map((p) => [p.id, p]));
    extra.forEach((p) => merged.set(p.id, p));
    startWorker({ ...data, points: [...merged.values()] });
    $("cityDialog").close();
  } catch (err) {
    $("geoStatus").textContent = err.message;
  }
  e.target.value = "";
};
$("importProfile").onclick = () => $("scenarioFile").click();
$("scenarioFile").onchange = async (e) => {
  try {
    let raw = JSON.parse(await e.target.files[0].text());
    if (raw.city && raw.city !== data.name)
      throw Error("Профиль предназначен для " + raw.city);
    let settings = raw.settings || raw,
      updates = [];
    for (let id of [
      "orders",
      "active",
      "vans",
      "capacity",
      "seed",
      "staff",
      "interval",
      "shelf",
      "visits",
      "launch",
      "perKm",
      "tariff",
      "traffic",
      "profile",
      "hub",
      "brand",
      "closed",
      "selection",
      "metric",
      "volumeUnit",
    ]) {
      if (!(id in settings)) continue;
      let el = $(id === "closed" ? "closure" : id),
        value = settings[id];
      if (el.tagName === "SELECT") {
        if (![...el.options].some((o) => o.value === String(value)))
          throw Error("Недоступное значение " + id);
      } else if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < Number(el.min) ||
        ((el.step === "1" || !el.step) && !Number.isSafeInteger(value))
      )
        throw Error("Проверьте поле " + id);
      updates.push([el, value]);
    }
    if (!updates.length) throw Error("Профиль не содержит параметров дня");
    updates.forEach(([el, v]) => (el.value = v));
    run();
  } catch (err) {
    $("status").textContent = err.message;
  }
  e.target.value = "";
};
loadBuiltin("yoshkar-ola");
