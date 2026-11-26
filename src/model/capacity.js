function backgroundLoad(pvz) {
  if (LOAD_OVERRIDE !== null) return LOAD_OVERRIDE;
  if (el("stress").checked) return 99;
  const demandLoad = Math.round(effectiveLoad(pvz) * val("flowSlider") / 100 + 10);
  return Math.max(5, Math.min(99, demandLoad + val("shelfSlider") - 100));
}
const volume = () => (val("dim0") * val("dim1") * val("dim2")) / 1000;
const inventory = (id) => stock.get(id) || { units: 0, litres: 0, fee: 0 };
function calcLoadPct(pvz, reservedLitres=0) {
  return Math.min(100, backgroundLoad(pvz) + Math.ceil((inventory(pvz.id).litres+reservedLitres) / CONFIG.shelfLitres * 100));
}
function room(p, reservedLitres=0) {
  const load = backgroundLoad(p);
  return {
    litres: Math.max(0, CONFIG.shelfLitres * (100-load)/100 - inventory(p.id).litres-reservedLitres),
    minutes: Math.max(0, 60 * (100-load)/100 - 2),
  };
}
// Ёмкость пункта как хаба. С уровнем «ПВЗ-хаб» транзит идёт в выделенную зону:
// её литры и минуты сотрудника гарантированы и не зависят от загрузки пункта покупателями.
const hubUpgraded = () => CONFIG.hubLevel.enabled;
function hubRoom(p, reservedLitres=0) {
  if (!hubUpgraded()) return room(p, reservedLitres);
  return {litres: Math.max(0, CONFIG.hubLevel.litres - reservedLitres), minutes: CONFIG.hubLevel.minutesPerHour, dedicated: true};
}
function hubEligible(p, reservedLitres=0) {
  return hubUpgraded() || calcLoadPct(p, reservedLitres) <= CONFIG.network.maxLoadForHub;
}
function boxFits(limits) {
  const dims=[val("dim0"),val("dim1"),val("dim2")].sort((a,b)=>b-a);
  return dims.every((x,i)=>Number.isFinite(x)&&x>0&&x<=limits[i])
      && val("kg")>0 && val("kg")<=limits[3];
}
// The preset sizes are the upper inclusive bounds of each pilot tariff band.
function parcelCategory() {
  if(boxFits(volumes.small))return "small";
  if(boxFits(volumes.medium))return "medium";
  return "oversize";
}
function fits(){return boxFits([120,60,50,25])}
function manifest() {
  if (!Number.isSafeInteger(val("batch")) || val("batch") < 1 || !(volume()>0) || !(val("kg")>0)) return 0;
  return Math.max(0,Math.min(val("batch"),Math.floor(6000/volume()),Math.floor(1000/val("kg"))));
}

// Half-open intervals: a shelf released at t is available for the next lot at t.
function reservedAt(book,id,t){
  return book.reduce((sum,v)=>sum+(v.id===id && v.a<=t && t<v.b ? v.litres : 0),0);
}
function canReserve(p, claims, book) {
  const shelf=hubRoom(p);
  const existing=book.filter(v=>v.id===p.id);
  for(const claim of claims){
    const overlaps=existing.filter(v=>v.a<claim.b && claim.a<v.b);
    const starts=[claim.a,...overlaps.filter(v=>v.a>claim.a).map(v=>v.a)];
    if(starts.some(t=>claim.litres + reservedAt(overlaps,p.id,t)>shelf.litres))return false;
    if(!claim.work)continue;
    if(overlaps.some(v=>v.work>0))return false;
    const workers=[claim,...existing.filter(v=>v.work>0)];
    for(let h=Math.floor(claim.a/60);h<Math.ceil(claim.b/60);h++){
      const used=workers.reduce((sum,v)=>sum+Math.max(0,Math.min(v.b,60*(h+1))-Math.max(v.a,60*h)),0);
      if(used>shelf.minutes+1e-8)return false;
    }
  }
  return true;
}
