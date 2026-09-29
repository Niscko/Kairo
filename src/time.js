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
  normalizeInput,
  hoursBetween,
  sameDay,
  withinService,
  validMinutes,
  monthBounds,
  overlaps,
};
