const PRESETS = {
  urban: {
    label: "Городской заказ",
    flow: 100,
    batch: 20,
    truck: 2,
    shelf: 100,
    incident: "none",
    days: 0,
  },
  hub: {
    label: "Хаб: рост потока",
    flow: 160,
    batch: 40,
    truck: 2,
    shelf: 80,
    incident: "none",
    days: 0,
  },
  trunk: {
    label: "Магистраль",
    flow: 200,
    batch: 60,
    truck: 3,
    shelf: 60,
    incident: "none",
    days: 0,
  },
  returns: {
    label: "Возврат",
    flow: 100,
    batch: 20,
    truck: 2,
    shelf: 100,
    incident: "return",
    days: 0,
  },
  failure: {
    label: "Сбой логистики",
    flow: 120,
    batch: 20,
    truck: 2,
    shelf: 100,
    incident: "error",
    days: 0,
  },
  longstay: {
    label: "Долгое хранение",
    flow: 70,
    batch: 10,
    truck: 1,
    shelf: 50,
    incident: "none",
    days: 5,
  },
};

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  const set = (id, v) => {
    const e = el(id);
    if (e) e.value = v;
  };

  set("flowSlider", p.flow);
  set("batch", p.batch);
  set("truckCountSlider", p.truck);
  set("incident", p.incident);
  set("shelfSlider", p.shelf);
  set("storageDays", p.days);

  el("stress").checked = false;
  setGeo(key === "trunk" ? "intercity" : "local");

  const cap = el("presetCaption");
  if (cap) cap.textContent = "Сценарий: " + p.label;

  document
    .querySelectorAll("[data-preset]")
    .forEach((b) => b.classList.toggle("active", b.dataset.preset === key));
}
