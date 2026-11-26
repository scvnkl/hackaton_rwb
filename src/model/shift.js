function priceHybrid(r, base) {
  const paid = r.issued - r.returned;
  r.referencePrice = base.price;
  r.premium = parcelCategory() === "oversize" ? CONFIG.bulk.premium : 0;
  r.discount = r.premium ? 0 : Math.floor(CONFIG.buyerSavingsShare * Math.max(0, base.costs-r.costs) / r.n);
  const quoted = Math.max(0,base.price+r.premium-r.discount);
  r.compPerOrder = Math.min(quoted,slaCompensation(r.eta-base.eta));
  r.price = quoted-r.compPerOrder;
  r.comp = r.compPerOrder*paid;
  r.income = r.price*paid;
  r.margin = r.income-r.costs;
}

function choose(mode,n,t,incident,book,baselineStart=t,deadline=Infinity,days=0) {
  const base = trip("direct",null,n,baselineStart,incident,days);
  if(!base)return null;
  const control = base.end <= deadline ? base : null;
  if(mode==="direct")return control;
  if(!fits() || (parcelCategory()==="oversize" && !el("bulkConsent").checked)){
    base.reason = !fits() ? "Упаковка превышает допуски ячейки" : "Габаритный гибрид требует согласия на доплату";
    return control;
  }

  const reasons=new Set();
  let best,maxFree=0;
  for(const p of hubPool){
    const r=trip("hybrid",p,n,t,incident,days);
    if(!r)continue;
    if(r.end>deadline){reasons.add("Возврат машины после смены");continue;}
    const arrival=r.res.find(v=>v.work>0).a;
    const occupied=reservedAt(book,p.id,arrival);
    const free=room(p,occupied).litres;
    maxFree=Math.max(maxFree,free);
    if(calcLoadPct(p,occupied)>CONFIG.network.maxLoadForHub){reasons.add("Загрузка выше "+CONFIG.network.maxLoadForHub+"%");continue;}
    if(n*volume()>free){reasons.add("Мало места");continue;}
    if(!canReserve(p,r.res,book)){reasons.add("Резерв полки или смена сотрудника заняты");continue;}
    if(slaBreach(r.eta-base.eta)){reasons.add("Превышен допуск SLA");continue;}
    if(r.pvzHub+r.pvzStorage < hubLabour(r)){reasons.add("Выплата хабу ниже затрат на труд");continue;}
    priceHybrid(r,base);
    if(!best || r.margin>best.margin || (r.margin===best.margin && r.end<best.end))best=r;
  }
  // A late classical round trip is still a valid price/SLA reference, but is not dispatchable.
  if(best && (control ? best.margin>=base.margin : best.margin>=0))return best;
  base.canWait = reasons.has("Резерв полки или смена сотрудника заняты") || (reasons.has("Мало места") && book.length>0);
  if(reasons.delete("Мало места"))reasons.add("Партия "+n+" шт. занимает "+(n*volume()).toLocaleString("ru-RU")+" л, максимум свободно "+Math.floor(maxFree).toLocaleString("ru-RU")+" л");
  base.reason = best ? "Через СЦ выгоднее для WB" : [...reasons].join(" · ") || "Нет подтверждённой дороги через доступный хаб";
  return control;
}

function schedule(mode) {
  const rate=140*val("flowSlider")/100/60;
  const demand=Math.floor(rate*CONFIG.shiftMinutes);
  const book=[],trips=[],fleet=Array(val("truckCountSlider")).fill(0);
  const firstIncident=el("incident").value;
  const missingRoads=!hasItinerary(roadItinerary(chain("direct",null),firstIncident));
  let sent=0;
  while(!missingRoads && sent<demand){
    const n=Math.min(manifest(),demand-sent);
    if(!n)break;
    const van=fleet.indexOf(Math.min(...fleet));
    const ready=(sent+n)/rate, start=Math.max(fleet[van],ready);
    const incident=sent===0 ? firstIncident : "none";
    const days=sent===0 ? val("storageDays") : 0;
    let r=choose(mode,n,start,incident,book,start,CONFIG.shiftMinutes,days);
    if(mode==="hybrid" && (!r || (r.mode==="direct" && r.canWait))){
      for(const delay of [15,30]){
        const alt=choose(mode,n,start+delay,incident,book,start,CONFIG.shiftMinutes,days);
        if(alt?.mode==="hybrid"){r=alt;break;}
      }
    }
    if(!r)break;
    r.ready=ready; r.van=van+1;
    fleet[van]=r.end; sent+=n;
    book.push(...r.res); trips.push(r);
  }
  return {trips,demand,book,missingRoads};
}

function hubLabour(r){return r.res.reduce((sum,v)=>sum+v.work*CONFIG.hubWorkPerMin,0);}

function metrics(mode, t, run = runs[mode]) {
  let issued = 0,
    back = 0,
    pvz = 0,
    pvzBase = 0,
    pvzHub = 0,
    pvzStorage = 0,
    comp = 0,
    margin = 0,
    finished = 0;
  for (const r of run.trips) {
    if (r.start > t) continue;
    for (const s of r.scans)
      if (s.t <= t) {
        issued += s.delta;
        back += s.back;
      }
    if(r.pvzStorage && r.openingLot.releasedAt<=t){
      pvzStorage+=r.pvzStorage; pvz+=r.pvzStorage;
    }
    if (r.end <= t) {
      finished++;
      pvz += r.pvz-r.pvzStorage;
      pvzBase += r.pvzBase;
      pvzHub += r.pvzHub;
      comp += r.comp;
      margin += r.margin;
    }
  }
  return {
    issued,
    back,
    pvz,
    pvzBase,
    pvzHub,
    pvzStorage,
    comp,
    margin: run.missingRoads ? null : margin - (CONFIG.shiftFixed * t) / CONFIG.shiftMinutes,
    finished,
  };
}

function issuedP95(run) {
  const samples = [];
  let orders = 0;
  for (const r of run.trips) for (const scan of r.scans) {
    if (scan.delta > 0) {
      samples.push({minutes:scan.t - r.ready, orders:scan.delta});
      orders += scan.delta;
    }
  }
  if (!orders) return null;
  let total = 0;
  for (const sample of samples.sort((a,b) => a.minutes - b.minutes)) {
    total += sample.orders;
    if (total >= Math.ceil(orders * 0.95)) return Math.round(sample.minutes);
  }
}
