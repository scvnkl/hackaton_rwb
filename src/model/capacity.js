function calcLoadPct(pvz) {
  const flow = Number(document.getElementById("flowSlider").value) / 100;
  return Math.min(99, Math.round(pvz.baseLoad * flow + 10));
}
const volume = () => (val("dim0") * val("dim1") * val("dim2")) / 1000;
const inventory = (id) => stock.get(id) || { units: 0, litres: 0, fee: 0 };
function room(p) {
  const load = el("stress").checked ? 99 : calcLoadPct(p);
  return {
    litres: Math.max(0, (3000 * (100 - load)) / 100 - inventory(p.id).litres),
    minutes: Math.max(0, (60 * (100 - load)) / 100 - 2),
  };
}
function fits() {
  return (
    [val("dim0"), val("dim1"), val("dim2")]
      .sort((a, b) => a - b)
      .every((x, i) => x <= [50, 60, 120][i]) && val("kg") <= 25
  );
}
function manifest() {
  return Math.max(
    0,
    Math.min(
      val("batch"),
      Math.floor(6000 / volume()),
      Math.floor(1000 / val("kg")),
    ),
  );
}
