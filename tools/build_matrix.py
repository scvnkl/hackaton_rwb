"""Build the offline distance/time overlay from a local Valhalla service."""
import argparse
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

CITIES = Path(__file__).resolve().parents[1] / "data" / "cities"


def build(points, endpoint):
    locations = [{"lat": p["lat"], "lon": p["lon"]} for p in points]
    body = {"sources": locations, "targets": locations, "units": "kilometers",
            "costing": "auto", "verbose": False}
    req = Request(endpoint, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=600) as response:
        data = json.load(response)["sources_to_targets"]
    matrix = {}
    for i, src in enumerate(points):
        for j, dst in enumerate(points):
            if i == j:
                continue
            if isinstance(data, dict):
                km, sec = data["distances"][i][j], data["durations"][i][j]
            else:
                cell = data[i][j] or {}
                km, sec = cell.get("distance"), cell.get("time")
            if km is None or sec is None or not (math.isfinite(km) and math.isfinite(sec) and km >= 0 and sec > 0):
                continue
            matrix[f"{src['id']}>{dst['id']}"] = {"km": km, "min": sec / 60}
    if not matrix:
        raise ValueError("Valhalla returned no reachable pairs. Check tile coverage.")
    return matrix


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("city", nargs="?", default="yoshkar-ola", choices=[p.name for p in CITIES.iterdir() if p.is_dir()])
    parser.add_argument("--endpoint", default="http://localhost:8002/sources_to_targets")
    args = parser.parse_args()
    directory = CITIES / args.city
    points = json.loads((directory / "points.json").read_text(encoding="utf8"))
    matrix = build(points, args.endpoint)
    payload = json.dumps(matrix, ensure_ascii=False, indent=2)
    for name, content in [("matrix.json", payload), ("matrix.json.js", "const MATRIX_DATA = " + payload + ";")]:
        path = directory / name
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(content + "\n", encoding="utf8")
        temp.replace(path)
    print(f"{args.city}: {len(matrix)} legs")
