function montoReserva({ hours, tarifaHora, tipo, membresia, membresiaVence, day, proposito }) {
  if (proposito === "evento") return 0;
  let tarifa = tarifaHora;
  const cubrePuesto =
    tipo === "puesto" &&
    ((membresia === "mensual" && membresiaVence && membresiaVence >= day) ||
      (membresia === "dia" && membresiaVence === day));
  if (cubrePuesto) tarifa = 0;
  return Math.round(hours * tarifa);
}

function estadoPorHorario(inicio, fin, ahora) {
  if (fin <= ahora) return "completada";
  if (inicio <= ahora) return "en_curso";
  return "confirmada";
}

module.exports = { montoReserva, estadoPorHorario };
