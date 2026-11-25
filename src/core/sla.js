function slaCompensation(extraMin) {
  const s = CONFIG.sla;
  if (!(extraMin > s.freeMinutes)) return 0;
  return Math.round(((extraMin - s.freeMinutes) / 60) * s.rubPerHour);
}

function slaBreach(extraMin) {
  return extraMin > CONFIG.sla.maxExtraMin;
}
