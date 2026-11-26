// Поиск запускает пользователь. Сначала определяем границу, затем запрашиваем ПВЗ одним запросом.
let citySearch;
function findOperator(tags) {
  const name = [tags.name, tags.brand, tags.operator].filter(Boolean).join(" ");
  if (/wildberries|вайлдбер/i.test(name)) return "wb";
  if (/ozon|озон/i.test(name)) return "ozon";
  if (/(яндекс|yandex)[ .-]*(маркет|market)/i.test(name)) return "ym";
  return null;
}
async function searchRegion(query) {
  if (!query) return;
  ++catalogGeneration;
  citySearch?.abort();
  const controller = new AbortController();
  citySearch = controller;
  const status = el("importStatus");
  async function read(url, params, timeout) {
    const r = await fetch(url + "?" + new URLSearchParams(params), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)])
    });
    if (!r.ok) throw Error("HTTP " + r.status);
    return r.json();
  }
  try {
    status.textContent = "Ищем административную границу…";
    const choices = await read("https://nominatim.openstreetmap.org/search",
      {q:query,format:"jsonv2",limit:5,"accept-language":"ru"}, 12000);
    const place = choices.find(p => p.osm_type === "relation");
    if (!place) throw Error("Граница не найдена. Уточните город, область или страну.");
    const key = "osm-" + place.osm_id;
    if (REGION_CATALOGS[key]) {
      configureRegion(key);
      status.textContent = "Открыт загруженный справочник.";
      return;
    }
    status.textContent = "Загружаем точки OSM · " + place.display_name;
    const area = 3600000000 + Number(place.osm_id);
    const overpassQuery = '[out:json][timeout:45];area(' + area + ')->.a;nwr["shop"="outpost"](area.a);out center;';
    let result;
    for (const host of ["https://maps.mail.ru/osm/tools/overpass/api/interpreter","https://overpass-api.de/api/interpreter"]) {
      try {
        const data = await read(host, {data:overpassQuery}, 55000);
        if (data.remark || !Array.isArray(data.elements)) throw Error("Неполный ответ Overpass");
        result = data;
        break;
      } catch (error) { if (controller.signal.aborted) throw error; }
    }
    if (!result) throw Error("Overpass недоступен. Повторите поиск или загрузите справочник из файла.");
    const points = [];
    for (const entry of result.elements) {
      const t = entry.tags || {}, brand = findOperator(t), xy = entry.center || entry;
      if (!brand || t.amenity === "parcel_locker") continue;
      const id = entry.type + "/" + entry.id;
      points.push({id, brand, latlng:[xy.lat,xy.lon],
        name:[t["addr:street"],t["addr:housenumber"]].filter(Boolean).join(" ") || ((t.name || brand) + " · " + id)});
    }
    const center = [Number(place.lat), Number(place.lon)];
    points.sort((a,b) => haversineM(a.latlng,center) - haversineM(b.latlng,center));
    const catalog = validateCatalog({city:place.name || query,points,source:"OpenStreetMap · ODbL",
      boundary:"https://www.openstreetmap.org/relation/" + place.osm_id,date:result.osm3s?.timestamp_osm_base?.slice(0,10)});
    if(controller.signal.aborted)return;
    configureRegion(key,catalog);
    status.textContent = place.display_name;
  } catch (e) {
    if (!controller.signal.aborted) status.textContent = "Загрузка региона: " + e.message;
  }
}
