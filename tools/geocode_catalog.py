"""Записать адреса ПВЗ WB в комплект данных, чтобы на защите без интернета не было координат.

Запуск из корня репозитория (нужен интернет, ~1 запрос в секунду по правилам Nominatim):
    python tools/geocode_catalog.py                 # Йошкар-Ола и Чебоксары (~5 минут)
    python tools/geocode_catalog.py kazan moscow    # другие регионы (Москва ~25 минут)
После этого выполните python tools/build_standalone.py, чтобы обновить автономный HTML.
Прерванный запуск можно продолжить: уже найденные адреса сохраняются после каждых 20 точек.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGS = ROOT / "data" / "regions" / "catalogs.js"
PREFIX = "const REGION_CATALOGS = "
RAW = re.compile(r"^(Вайлдберриз|Wildberries)\s*·|\d+\.\d+,\s*\d+\.\d+$|node/|way/", re.I)
UA = "wb-mesh-hackathon/1.0 (geocode_catalog.py)"

SHORT = [(r"^улица\s+(.+)$", r"ул. \1"), (r"\s+улица$", " ул."), (r"^проспект\s+", "пр-т "), (r"\s+проспект$", " пр-т"),
         (r"^переулок\s+", "пер. "), (r"\s+переулок$", " пер."), (r"^бульвар\s+", "б-р "), (r"\s+бульвар$", " б-р"),
         (r"^шоссе\s+", "ш. "), (r"\s+шоссе$", " ш."), (r"^площадь\s+", "пл. "), (r"\s+площадь$", " пл.")]


def short(street):
    for pattern, repl in SHORT:
        street = re.sub(pattern, repl, street, flags=re.I)
    return street


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def reverse(lat, lon):
    query = urllib.parse.urlencode({"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 18, "addressdetails": 1, "accept-language": "ru"})
    try:
        a = get("https://nominatim.openstreetmap.org/reverse?" + query).get("address", {})
        street = a.get("road") or a.get("pedestrian") or a.get("square") or a.get("neighbourhood")
        if street:
            return short(street) + (", " + a["house_number"] if a.get("house_number") else "")
    except Exception as error:  # noqa: BLE001 — переходим на резервный геокодер
        print("  Nominatim:", error)
    p = (get("https://photon.komoot.io/reverse?" + urllib.parse.urlencode({"lat": lat, "lon": lon, "limit": 1}))
         .get("features") or [{}])[0].get("properties", {})
    street = p.get("street") or p.get("name")
    return short(street) + (", " + p["housenumber"] if p.get("housenumber") else "") if street else None


def save(data):
    CATALOGS.write_text(PREFIX + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def main(regions):
    data = json.loads(CATALOGS.read_text(encoding="utf-8")[len(PREFIX):].rstrip().rstrip(";"))
    for key in regions:
        points = [p for p in data[key]["points"] if p["brand"] == "wb" and RAW.search(p["name"])]
        print(f"{key}: {len(points)} точек без адреса")
        for i, p in enumerate(points, 1):
            try:
                address = reverse(*p["latlng"])
            except Exception as error:  # noqa: BLE001
                print("  пропуск", p["id"], error)
                address = None
            if address:
                p["name"] = address
                print(f"  {i}/{len(points)} {address}")
            if i % 20 == 0:
                save(data)
            time.sleep(1.1)
        save(data)
    print("Готово. Обновите автономный файл: python tools/build_standalone.py")


if __name__ == "__main__":
    main(sys.argv[1:] or ["yoshkar-ola", "cheboksary"])
