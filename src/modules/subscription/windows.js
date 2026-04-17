function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function getCurrentWeekMonday(now = new Date()) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() + 1 - day);
  return monday.toISOString().slice(0, 10);
}

export function getCurrentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function getCurrentDayKey(now = new Date()) {
  return getUtcDayKey(now);
}

export function getBillingCycleKey(anchorDay, now = new Date()) {
  if (!anchorDay || anchorDay < 1 || anchorDay > 31) {
    return getCurrentMonthKey(now);
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const daysInCurrentMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const effectiveAnchor = Math.min(anchorDay, daysInCurrentMonth);

  let cycleStartYear = year;
  let cycleStartMonth = month;

  if (day < effectiveAnchor) {
    if (month === 0) {
      cycleStartYear -= 1;
      cycleStartMonth = 11;
    } else {
      cycleStartMonth -= 1;
    }
  }

  const daysInStartMonth = new Date(Date.UTC(cycleStartYear, cycleStartMonth + 1, 0)).getUTCDate();
  const cycleDay = Math.min(anchorDay, daysInStartMonth);
  const mm = String(cycleStartMonth + 1).padStart(2, "0");
  const dd = String(cycleDay).padStart(2, "0");
  return `${cycleStartYear}-${mm}-${dd}`;
}

export function getUsageWindowKeys(now = new Date(), anchorDay = null) {
  return {
    weekStartDate: getCurrentWeekMonday(now),
    billingCycleKey: anchorDay ? getBillingCycleKey(anchorDay, now) : getCurrentMonthKey(now),
    monthKey: getCurrentMonthKey(now),
    dayKey: getCurrentDayKey(now),
  };
}
