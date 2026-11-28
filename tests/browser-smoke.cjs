// Optional UI regressions. Pass a served index.html URL or omit it to open the portable file.
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {chromium} = require("playwright");

async function check(page, url) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://**/*", route => route.abort("internetdisconnected"));
  await page.goto(url);
  // Вкладки боковой панели: в тесте показываем все панели сразу.
  await page.addStyleTag({content:".tab-pane{display:block!important}"});
  // Регрессии закреплены на учебных ставках v12 (реальные ставки проверяет dispatch.test.cjs).
  await page.evaluate(()=>{Object.assign(CONFIG,{hubWorkPerMin:4,sc2PerBox:52,perKm:18,perMin:1.5,sellerPerBox:55,storagePerBoxDay:0.8});CONFIG.hubLevel.rentPerM2=900;updateParameters();});
  const get = id => page.locator("#" + id);
  await get("uiLanguage").selectOption("en");
  assert.equal(await page.locator('[data-tab="logist"]').textContent(), "Dispatch");
  await get("openSummary").click();
  assert.match(await page.locator("#summaryModal").innerText(), /Shift recommendation/i);
  await page.locator(".close-modal-btn").click();
  await get("uiLanguage").selectOption("ru");
  assert.equal(await page.locator('[data-tab="logist"]').textContent(), "Пульт");
  const read = async id => (await get(id).textContent()).replace(/\s+/g," ").trim();
  const preset = name => page.locator('[data-preset="'+name+'"]').click();
  const range = (id,n) => get(id).evaluate((input,value) => {
    input.value = value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
  },n);
  const summary = async () => {
    await get("openSummary").click();
    const text = await read("summaryTopKpis");
    await page.locator(".close-modal-btn").click();
    return text;
  };

  assert.match(await summary(),/3 152,71/);
  assert.equal(await read("mFinalLoad"),"31%");
  assert.match(await read("loadDetail"),/WB 32, Ozon 42, Яндекс Маркет 1/);
  await get("useCompetition").uncheck();
  assert.ok(parseInt(await read("mFinalLoad"))>31);
  await get("useCompetition").check();
  assert.equal(await read("mFinalLoad"),"31%");

  await get("batch").fill("2");
  for(const [id,value] of [["dim0","90"],["dim1","45"],["dim2","40"],["kg","18"]]){
    await get(id).fill(value);
  }
  assert.equal(await read("packageClass"),"габаритная");
  assert.equal(await read("priceDirect"),"403 ₽");
  assert.equal(await read("priceHybrid"),"403 ₽");
  await get("bulkConsent").check();
  assert.equal(await read("priceHybrid"),"523 ₽");
  await get("batch").fill("12");
  assert.equal(await read("priceHybrid"),"471 ₽");
  await get("batch").fill("20");
  assert.equal(await read("priceHybrid"),"346 ₽");
  assert.match(await read("metaHybrid"),/3 240 л/);

  await preset("urban");
  await range("scrub",57);
  assert.equal(await get("map").locator(".hub-pvz").count(),2);
  assert.match(await read("chainExplanation"),/Машина 1.*Машина 2/);
  await range("scrub",180);
  await get("optDirect").click();
  assert.equal(await read("simClock"),"11:00 · смена 3:00");
  await get("optHybrid").click();
  assert.equal(await get("scrub").inputValue(),"180");
  await get("btnToggleSim").click();
  await get("optDirect").click();
  assert.match(await read("btnToggleSim"),/Пауза/);
  await get("optHybrid").click();
  await get("btnToggleSim").click();

  await get("dim0").fill("-25");
  await page.locator('[data-stock="receive"]').click();
  await get("dim0").fill("25");
  assert.match(await read("stockStatus"),/Остаток 0 шт. · 0 л/);
  await get("btnToggleSim").click();
  await get("batch").fill("0");
  assert.ok(await get("btnToggleSim").isDisabled());
  assert.ok(await get("scrub").isDisabled());
  assert.equal(await read("priceHybrid"),"—");
  const invalid = await summary();
  assert.match(invalid,/Заказов в партии/);
  assert.doesNotMatch(invalid,/3 152,71|Выберите|4 800/);
  await get("batch").fill("50");
  await range("flowSlider",200);
  assert.ok(await get("btnToggleSim").isEnabled());
  assert.match(await summary(),/выдано 400 заказов/);

  await preset("returns");
  await range("scrub",480);
  assert.equal(await page.evaluate(()=>metrics("hybrid",480).back),1);
  await preset("failure");
  assert.ok(await page.evaluate(()=>runs.hybrid.trips[0].scans.some(s=>s.text==="Недостача закрыта")));
  await preset("trunk");
  assert.equal(await get("regionSelect").inputValue(),"cheboksary");
  assert.match(await read("chainExplanation"),/Чебоксары/);
  await preset("longstay");
  assert.match(await read("lotLedger"),/50 л.*Сейчас на полке 10 шт/);
  assert.match(await read("liveLog"),/на полках ПВЗ 50 л/);
  await get("showStoragePickup").click();
  assert.match(await read("lotLedger"),/Сейчас на полке 0 шт.*40 ₽/);
  assert.equal(await read("stPvzEarned"),"40 ₽");
  await range("scrub",0);
  assert.equal(await read("stPvzEarned"),"0 ₽");
  await get("optDirect").click();
  assert.match(await read("lotLedger"),/СЦ 2/);
  await get("optHybrid").click();

  await preset("urban");
  await get("stress").check();
  assert.match(await summary(),/Выберите доставку через СЦ/);
  await get("stress").uncheck();
  for (const action of ["receive","sell","day"]) await page.locator('[data-stock="'+action+'"]').click();
  assert.match(await read("stockStatus"),/8 шт. · 40 л.*6,4 ₽/);
  const upload = async points => {
    const previous=await read("importStatus");
    await get("regionFile").setInputFiles({name:"test.json",mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify({city:"Учебный район",points}))});
    await page.waitForFunction(old=>document.getElementById("importStatus").textContent!==old,previous);
  };
  const wb={id:"shared",name:"А",brand:"wb",latlng:[55.85,49.1]};
  const ozon={...wb,name:"Б",brand:"ozon",latlng:[55.86,49.1]};
  const before=[await get("regionSelect").inputValue(),await read("priceHybrid"),await read("catalogStatus")];
  await upload([ozon,wb]);
  assert.match(await read("importStatus"),/ID.*повторяется/);
  assert.deepEqual([await get("regionSelect").inputValue(),await read("priceHybrid"),await read("catalogStatus")],before);
  assert.equal(await get("finalPvzSelect").locator("option").count(),145);
  await upload([wb,{...ozon,id:"other"}]);
  assert.match(await read("catalogStatus"),/Учебный район · WB 1 · Ozon 1/);
  assert.equal(await get("finalPvzSelect").locator("option").count(),1);
  await get("regionSelect").selectOption("yoshkar-ola");
  assert.match(await read("stockStatus"),/8 шт. · 40 л/);

  // Маршрут по улицам строится к любому ПВЗ — расчёт не блокируется ни в одном регионе.
  for (const key of ["cheboksary","kazan","moscow","yoshkar-ola"]){
    await get("regionSelect").selectOption(key);
    assert.ok(await get("finalPvzSelect").locator("option").count() > 100);
    assert.ok(await get("btnToggleSim").isEnabled());
  }
  await get("regionSelect").selectOption("moscow");
  const last=get("finalPvzSelect").locator("option").last();
  await get("finalPvzSelect").selectOption(await last.getAttribute("value"));
  await page.waitForFunction(()=>!document.getElementById("roadStatus").textContent.includes("уточняем"));
  assert.ok(await get("btnToggleSim").isEnabled());
  assert.doesNotMatch(await summary(),/Недостаточно дорожных данных для этого адреса/);
  assert.deepEqual(errors,[]);
}

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined});
  try {
    const page = await browser.newPage({locale:"ru-RU", viewport:{width:1366,height:768}});
    const url = process.argv[2] || pathToFileURL(path.resolve(__dirname,"../pvz-wb-real-streets-v12.html")).href;
    await check(page,url);
    await page.goto(url);
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.route("https://**/*", route => route.abort("internetdisconnected"));
    // Без ключа и без сети — одна офлайн-подложка, без наложения слоёв.
    await page.waitForFunction(()=>baseKind==="offline");
    assert.equal(await page.evaluate(()=>[localAtlas,streetLayer,...regionAtlases.values()].filter(l=>map.hasLayer(l)).length),1);
    await page.addStyleTag({content:".tab-pane{display:block!important}"});
    await page.locator("#gisKey").fill("test-key");
    const tilePattern = /^https:\/\/tile[0-4]\.maps\.2gis\.com\/v2\/tiles\/online_sd\//;
    let requests = 0;
    await page.route(tilePattern, route => {
      assert.equal(new URL(route.request().url()).searchParams.get("key"), "test-key");
      requests++;
      return route.fulfill({contentType:"image/png",path:path.resolve(__dirname,"../vendor/leaflet/images/marker-icon.png")});
    });
    await page.locator("#scrub").evaluate(input=>{input.value=57;input.dispatchEvent(new Event("input"));});
    await page.locator("#gisConfig button").click();
    await page.waitForFunction(()=>baseLayer?.getContainer?.()?.querySelector("img.leaflet-tile-loaded"));
    assert.ok(requests > 0);
    assert.equal(await page.evaluate(()=>baseKind),"2gis-keyed");
    assert.equal(await page.evaluate(()=>map.hasLayer(localAtlas)),false);
    assert.match(await page.locator("#gisStatus").textContent(),/2ГИС/);
    await page.unroute(tilePattern);
    await page.locator("#gisKey").fill("unavailable-test-key");
    await page.locator("#gisConfig button").click();
    await page.waitForFunction(()=>baseKind==="offline", null, {timeout:30000});
    assert.equal(await page.locator("#scrub").inputValue(),"57");
    assert.deepEqual(errors,[]);
    console.log("Регрессии интерфейса прошли · " + url);
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
