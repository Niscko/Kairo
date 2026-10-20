function pad(n) {
  return String(n).padStart(2, "0");
}

function stamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(base, offset) {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  date.setDate(date.getDate() + offset);
  return date;
}

function dayStamp(date, time) {
  return `${dateISO(date)} ${time}`;
}

function parseStamp(value) {
  const [date, time] = value.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function normalizeInput(value) {
  if (!value || typeof value !== "string") return null;
  let text = value.trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) text = text.slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const parsed = parseStamp(text);
  if (Number.isNaN(parsed.getTime()) || stamp(parsed) !== text) return null;
  return text;
}

function hoursBetween(inicio, fin) {
  return (parseStamp(fin) - parseStamp(inicio)) / 36e5;
}

function sameDay(inicio, fin) {
  return inicio.slice(0, 10) === fin.slice(0, 10);
}

function withinService(inicio, fin) {
  const start = inicio.slice(11, 16);
  const end = fin.slice(11, 16);
  return start >= "07:00" && end <= "23:00" && start < end;
}

function validMinutes(value) {
  const minutes = value.slice(14, 16);
  return minutes === "00" || minutes === "30";
}

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    periodo: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
    start: dayStamp(start, "00:00"),
    end: dayStamp(end, "00:00"),
    days: Math.round((end - start) / 86400000),
  };
}

function parseISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (dateISO(date) !== iso) return null;
  return date;
}

function daysBetween(startStamp, endStamp) {
  return Math.round((parseStamp(endStamp) - parseStamp(startStamp)) / 86400000);
}

function resolvePeriod({ rango, desde, hasta }, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = addDays(today, 1);
  const key = ["hoy", "7d", "21d", "mes", "custom"].includes(rango) ? rango : "mes";

  if (key === "hoy") {
    return { key, label: "Hoy", start: dayStamp(today, "00:00"), end: dayStamp(tomorrow, "00:00"), days: 1 };
  }
  if (key === "7d") {
    const start = addDays(today, -6);
    return { key, label: "Últimos 7 días", start: dayStamp(start, "00:00"), end: dayStamp(tomorrow, "00:00"), days: 7 };
  }
  if (key === "21d") {
    const start = addDays(today, -20);
    return { key, label: "Últimos 21 días", start: dayStamp(start, "00:00"), end: dayStamp(tomorrow, "00:00"), days: 21 };
  }
  if (key === "custom") {
    const startDate = parseISODate(desde);
    const endDate = parseISODate(hasta);
    if (!startDate || !endDate) {
      const error = new Error("Indica una fecha inicial y una final");
      error.status = 400;
      throw error;
    }
    if (startDate > endDate) {
      const error = new Error("La fecha inicial no puede ser posterior a la final");
      error.status = 400;
      throw error;
    }
    const end = addDays(endDate, 1);
    const days = Math.round((end - startDate) / 86400000);
    if (days > 90) {
      const error = new Error("El rango máximo es de 90 días");
      error.status = 400;
      throw error;
    }
    const startISO = dateISO(startDate);
    const endISO = dateISO(endDate);
    return {
      key,
      label: startISO === endISO ? startISO : `${startISO} a ${endISO}`,
      start: dayStamp(startDate, "00:00"),
      end: dayStamp(end, "00:00"),
      days,
    };
  }
  const month = monthBounds(today);
  return { key: "mes", label: `Mes ${month.periodo}`, ...month };
}

function eachDay(startStamp, endStamp) {
  const days = [];
  let cursor = parseISODate(startStamp.slice(0, 10));
  const last = parseStamp(endStamp);
  while (cursor < last) {
    days.push(dateISO(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

function prorateAmount(amount, monthPeriod, rangeStart, rangeEnd) {
  const [year, month] = monthPeriod.split("-").map(Number);
  const monthStart = dayStamp(new Date(year, month - 1, 1), "00:00");
  const monthEnd = dayStamp(new Date(year, month, 1), "00:00");
  const overlapStart = rangeStart > monthStart ? rangeStart : monthStart;
  const overlapEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd;
  if (overlapStart >= overlapEnd) return 0;
  const monthDays = daysBetween(monthStart, monthEnd);
  const overlapDays = daysBetween(overlapStart, overlapEnd);
  return amount * (overlapDays / monthDays);
}

function overlaps(inicioA, finA, inicioB, finB) {
  return inicioA < finB && finA > inicioB;
}

module.exports = {
  pad,
  stamp,
  dateISO,
  addDays,
  dayStamp,
  parseStamp,
  parseISODate,
  normalizeInput,
  hoursBetween,
  sameDay,
  withinService,
  validMinutes,
  monthBounds,
  resolvePeriod,
  eachDay,
  prorateAmount,
  overlaps,
};
