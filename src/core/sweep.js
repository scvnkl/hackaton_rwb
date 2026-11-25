function sweepMatrix() {
  const tariffs = [8, 12, 16, 20, 24, 28];
  const loads = [50, 65, 80, 90];

  const saved = {
    batch: el("batch").value,
    flow: el("flowSlider").value,
    trucks: el("truckCountSlider").value,
    fee: CONFIG.hubPerBox[parcelSize],
    override: LOAD_OVERRIDE,
  };

  const out = [];
  try {
    el("batch").value = 20;
    el("flowSlider").value = 100;
    el("truckCountSlider").value = 2;

    for (const load of loads) {
      LOAD_OVERRIDE = load;
      for (const fee of tariffs) {
        CONFIG.hubPerBox[parcelSize] = fee;

        const direct = schedule("direct");
        const hybrid = schedule("hybrid");
        const md = metrics("direct", CONFIG.shiftMinutes, direct);
        const mh = metrics("hybrid", CONFIG.shiftMinutes, hybrid);
        const viaHub = hybrid.trips.filter((t) => t.mode === "hybrid").length;

        out.push({
          "полки %": load,
          "тариф ПВЗ": fee,
          "экономия ₽": Math.round(mh.margin - md.margin),
          "рейсов через ПВЗ": viaHub + " / " + hybrid.trips.length,
          вердикт: mh.margin > md.margin ? "гибрид" : "СЦ",
        });
      }
    }
  } finally {
    el("batch").value = saved.batch;
    el("flowSlider").value = saved.flow;
    el("truckCountSlider").value = saved.trucks;
    CONFIG.hubPerBox[parcelSize] = saved.fee;
    LOAD_OVERRIDE = saved.override;
  }

  console.table(out);
  window.SWEEP_RESULT = out;
  return out;
}
