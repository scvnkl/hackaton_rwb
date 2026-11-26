function renderOpeningLot(){
  const lot=runs[routeMode]?.trips[0]?.openingLot;
  el("storedLot").hidden=!val("storageDays");
  if(!val("storageDays"))return;
  el("showStoragePickup").disabled=!lot;
  if(!lot){el("lotLedger").textContent="Партия со хранения не назначена на эту смену.";return;}
  const released=elapsed>=lot.releasedAt;
  el("lotLedger").textContent="День −"+lot.days+": продавец передал "+lot.units+" шт. ("+lot.litres.toLocaleString("ru-RU")+" л) в "+nodeName(lot.id)+
    ". Хранение: "+lot.units+" × "+lot.days+" × "+rub(CONFIG.storagePerBoxDay)+" = "+rub(lot.fee)+
    ". Сейчас на полке "+(released?"0 шт.":lot.units+" шт.")+". "+
    (released?"Партия отгружена. Продавец оплачивает "+rub(lot.fee)+". Получатель — "+nodeName(lot.id)+".":"Отгрузка и расчёт за хранение на "+Math.ceil(lot.releasedAt)+"-й минуте смены.");
}
function updateClock(force=false) {
  if(planIssue || !runs[routeMode])return;
  for (const m of markers.values()) m.remove();
  markers.clear();
  let text = "",
    log = [],
    current = [];
  for (const r of runs[routeMode].trips) {
    if (r.start > elapsed) continue;
    for (const s of r.scans)
      if (s.t <= elapsed)
        log.push([
          s.t,
          "Машина " + r.van + " · " + nodeName(s.id) + " · " + s.text,
        ]);
    if (r.end <= elapsed) continue;
    current.push(r);
    let p = r.phases.find((p) => elapsed >= p.start && elapsed < p.end);
    if (!p) continue;
    let pos;
    if (p.leg) {
      let line = p.leg.track,
        sec = (elapsed - p.start) * 60,
        lo = 0,
        hi = line.length - 1;
      while (hi - lo > 1) {
        let mid = (hi + lo) >> 1;
        if (line[mid][2] <= sec) lo = mid;
        else hi = mid;
      }
      let a = line[lo],
        b = line[hi],
        f = Math.min(1, (sec - a[2]) / (b[2] - a[2] || 1));
      pos = a.slice(0, 2).map((v, j) => v + (b[j] - v) * f);
    } else pos = nodeLatLng(p.id);
    const label = "Машина " + r.van + " · " + p.text;
    const tip = document.createElement("span");
    tip.textContent = label;
    let m = L.marker(pos, {
      icon: L.divIcon({
        className: "",
        html: "🚚",
        iconSize: [24, 24],
        iconAnchor: p.leg ? [12, 12] : [12, 35],
      }),
      zIndexOffset: 900,
    })
      .bindTooltip(tip)
      .addTo(trucksLayer);
    markers.set(r.van, m);
    text += label + "; ";
  }
  let m = metrics(routeMode, elapsed),
    classic = metrics("direct", elapsed);
  el("stDelivered").textContent = m.issued;
  el("stActiveTrucks").textContent = current.length;
  el("stMpSaved").textContent = rub(m.margin - classic.margin);
  el("stPvzEarned").textContent = rub(m.pvzHub + m.pvzStorage);
  el("simClock").textContent =
    "Смена " +
    Math.floor(elapsed / 60) +
    ":" +
    String(Math.floor(elapsed % 60)).padStart(2, "0");
  const reserved = runs[routeMode].book
    .filter(v => v.a <= elapsed && elapsed < v.b)
    .reduce((s,v) => s + v.litres, 0);
  el("liveLog").innerText =
    (text || "Ожидание следующего рейса") +
    " · партии на полках ПВЗ " +
    reserved +
    " л\n" +
    log
      .sort((a, b) => b[0] - a[0])
      .slice(0, 5)
      .map((x) => Math.floor(x[0]) + " мин · " + x[1])
      .join("\n");
  el("scrub").value = elapsed;
  plot(current);
  updateMapContext(current,force);
  renderOpeningLot();
  el("truckLegStatus").textContent=elapsed>=CONFIG.shiftMinutes?"Смена завершена":current.length?"Рейсов в пути: "+current.length:"Ожидание рейса";
}
function stopClock() {
  playing = false;
  cancelAnimationFrame(frame);
  el("btnToggleSim").textContent = "▶ Запустить машины";
}
function resetSimulation() {
  stopClock();
  elapsed = 0;
  updateClock();
}
function animate(now) {
  if (!playing) return;
  elapsed = Math.min(
    CONFIG.shiftMinutes,
    elapsed + Math.min(0.5, (now - previous) / 1000) * 4,
  );
  previous = now;
  updateClock();
  if (elapsed >= CONFIG.shiftMinutes) stopClock();
  else frame = requestAnimationFrame(animate);
}
function toggleSimulation() {
  if(planIssue||!validateInputs())return;
  if (playing) return stopClock();
  if (elapsed >= CONFIG.shiftMinutes) elapsed = 0;
  playing = true;
  previous = performance.now();
  el("btnToggleSim").textContent = "⏸ Пауза";
  frame = requestAnimationFrame(animate);
}
