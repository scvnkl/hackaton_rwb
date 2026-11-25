"use strict";
// The dispatcher opens a reference map on demand; simulation routing stays local.
(() => {
  const dialog = $("yandexDialog"), form = $("yaForm");
  let apiPromise, point, view, generation = 0;
  function loadApi(key) {
    if (window.ymaps) return window.ymaps.ready().then(() => window.ymaps);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        apiPromise = null;
        reject(new Error("Яндекс Карты недоступны. Проверьте сеть, ключ JavaScript API и разрешённый домен."));
      };
      const timer = setTimeout(fail, 12000);
      script.onload = () => {
        if (!window.ymaps) return fail();
        ymaps.ready(() => { clearTimeout(timer); resolve(ymaps); });
      };
      script.onerror = fail;
      script.src = "https://api-maps.yandex.ru/2.1/?" + new URLSearchParams({ apikey: key, lang: "ru_RU" });
      document.head.appendChild(script);
    });
    return apiPromise;
  }
  async function display(key, version) {
    form.hidden = true;
    $("yaStatus").textContent = "Открываем карту…";
    try {
      const api = await loadApi(key);
      if (version !== generation || !dialog.open) return;
      const ll = [point.lat, point.lon];
      view?.destroy();
      view = new api.Map("yaMap", {center: ll, zoom: 16, controls: ["zoomControl"]});
      view.geoObjects.add(new api.Placemark(ll, {hintContent: esc(point.name)}));
      $("yaStatus").textContent = point.address || point.name;
    } catch (error) {
      if (version !== generation) return;
      $("yaStatus").textContent = error.message;
      form.hidden = false;
    }
  }
  form.onsubmit = event => {
    event.preventDefault();
    const key = $("yaKey").value.trim();
    if (key) display(key, ++generation);
  };
  dialog.addEventListener("close", () => {
    generation++;
    view?.destroy();
    view = null;
  });
  $("map").addEventListener("click", async event => {
    const target = event.target.closest("[data-yandex]");
    if (!target) return;
    point = byId.get(target.dataset.yandex);
    const version = ++generation;
    $("yaTitle").textContent = point.name;
    $("yaStatus").textContent = point.address;
    dialog.showModal();
    let key = $("yaKey").value.trim();
    if (!key && location.protocol !== "file:") {
      try {
        const response = await fetch("yandex.local.json", {cache: "no-store"});
        if (response.ok) key = (await response.json()).key;
      } catch { /* The key can also be supplied in the dialog. */ }
    }
    if (version !== generation) return;
    if (key) display(key, version);
    else form.hidden = false;
  });
})();
