"""Export pickup points inside an OSM administrative area for the v12 region importer."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

AGENT = "Mesh-RWB-v12/1.0 (+https://github.com/scvnkl/hackaton_rwb)"
ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter",
             "https://overpass-api.de/api/interpreter"]


def get(url, params):
    request = Request(url + "?" + urlencode(params), headers={"User-Agent": AGENT})
    with urlopen(request, timeout=110) as response:
        return json.load(response)


def operator(tags):
    text = " ".join(tags.get(k, "") for k in ("name", "brand", "operator")).lower()
    if re.search(r"wildberries|вайлдбер", text):
        return "wb"
    if re.search(r"ozon|озон", text):
        return "ozon"
    if re.search(r"(яндекс|yandex)[ .-]*(маркет|market)", text):
        return "ym"
    return None


def build(place):
    matches = get("https://nominatim.openstreetmap.org/search", {
        "q": place, "format": "jsonv2", "limit": 5, "accept-language": "ru"})
    region = next((p for p in matches if p["osm_type"] == "relation"), None)
    if not region:
        raise ValueError("Административная граница не найдена. Уточните город и страну.")
    area = 3600000000 + int(region["osm_id"])
    query = (f'[out:json][timeout:90];area({area})->.a;'
             '(nwr(area.a)["shop"~"^(outpost|pickup|parcel_pickup)$"];'
             'nwr(area.a)["office"="delivery"];nwr(area.a)["amenity"="post_office"];);out center;')
    # Крупные регионы надёжнее загружаются селективным индексом shop=outpost.
    compact = (f'[out:json][timeout:90];area({area})->.a;'
               'nwr["shop"="outpost"](area.a);out center;')
    for endpoint, expression in [(url, expr) for expr in (query, compact) for url in ENDPOINTS]:
        try:
            data = get(endpoint, {"data": expression})
            if data.get("remark"):
                raise ValueError(data["remark"])
            if not data.get("elements"):
                raise ValueError("Пустой ответ Overpass")
            break
        except (OSError, ValueError) as exc:
            error = exc
    else:
        raise RuntimeError("Не удалось загрузить регион из Overpass") from error
    points = []
    for item in data["elements"]:
        tags = item["tags"]
        brand = operator(tags)
        if not brand or tags.get("amenity") == "parcel_locker":
            continue
        location = item.get("center", item)
        point_id = f'{item["type"]}/{item["id"]}'
        address = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
        points.append({"id": point_id, "brand": brand, "name": address or f'{tags.get("name", brand)} · {point_id}',
                       "latlng": [location["lat"], location["lon"]]})
    if not any(p["brand"] == "wb" for p in points):
        raise ValueError("В границах региона нет распознанных точек WB")
    s, n, w, e = map(float, region["boundingbox"])
    return {"city": region["name"], "area": [s, w, n, e], "date": data["osm3s"]["timestamp_osm_base"][:10],
            "source": "OpenStreetMap · ODbL", "boundary": f'https://www.openstreetmap.org/relation/{region["osm_id"]}',
            "points": points}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("city")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = build(args.city)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(result["city"], result["date"], len(result["points"]), result["boundary"])
