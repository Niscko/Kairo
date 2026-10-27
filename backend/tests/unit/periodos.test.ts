import { describe, expect, it } from "vitest";

import {
  diasDelPeriodo,
  horasRecortadas,
  parseFecha,
  prorratear,
  resolverPeriodo,
} from "../../src/lib/periodos.js";

describe("parseFecha", () => {
  it("interpreta una fecha válida en hora local", () => {
    const fecha = parseFecha("2026-03-10");
    expect(fecha?.getFullYear()).toBe(2026);
    expect(fecha?.getMonth()).toBe(2);
    expect(fecha?.getDate()).toBe(10);
  });

  it("devuelve null si la fecha no existe", () => {
    expect(parseFecha("2026-02-30")).toBeNull();
    expect(parseFecha("2026-13-01")).toBeNull();
    expect(parseFecha("no-es-fecha")).toBeNull();
    expect(parseFecha("")).toBeNull();
  });
});

describe("resolverPeriodo", () => {
  const ahora = new Date(2026, 2, 15, 10, 30); // 15 de marzo de 2026

  it("el rango de hoy cubre un solo día", () => {
    const periodo = resolverPeriodo({ rango: "hoy" }, ahora);
    expect(periodo.days).toBe(1);
    expect(periodo.start).toBe("2026-03-15 00:00");
    expect(periodo.end).toBe("2026-03-16 00:00");
  });

  it("los últimos 7 días incluyen hoy y empiezan 6 días antes", () => {
    const periodo = resolverPeriodo({ rango: "7d" }, ahora);
    expect(periodo.days).toBe(7);
    expect(periodo.start).toBe("2026-03-09 00:00");
    expect(periodo.end).toBe("2026-03-16 00:00");
  });

  it("los últimos 21 días empiezan 20 días antes", () => {
    const periodo = resolverPeriodo({ rango: "21d" }, ahora);
    expect(periodo.days).toBe(21);
    expect(periodo.start).toBe("2026-02-23 00:00");
  });

  it("el mes va del día 1 al día siguiente al último", () => {
    const periodo = resolverPeriodo({ rango: "mes" }, ahora);
    expect(periodo.days).toBe(31); // marzo de 2026
    expect(periodo.start).toBe("2026-03-01 00:00");
    expect(periodo.end).toBe("2026-04-01 00:00");
    expect(periodo.label).toBe("Mes 2026-03");
  });

  it("el rango por defecto es el mes", () => {
    const periodo = resolverPeriodo({}, ahora);
    expect(periodo.key).toBe("mes");
  });

  it("un rango desconocido cae en el mes", () => {
    const periodo = resolverPeriodo({ rango: "inventado" }, ahora);
    expect(periodo.key).toBe("mes");
  });

  it("el rango personalizado respeta las fechas dadas", () => {
    const periodo = resolverPeriodo(
      { rango: "custom", desde: "2026-03-01", hasta: "2026-03-15" },
      ahora,
    );
    expect(periodo.days).toBe(15);
    expect(periodo.start).toBe("2026-03-01 00:00");
    // El fin es exclusivo: el 15 sí está incluido.
    expect(periodo.end).toBe("2026-03-16 00:00");
  });

  it("rechaza un rango con fechas inválidas", () => {
    expect(() => resolverPeriodo({ rango: "custom", desde: "x", hasta: "y" }, ahora)).toThrow(
      /fecha inicial y una final/,
    );
  });

  it("rechaza un rango invertido", () => {
    expect(() =>
      resolverPeriodo({ rango: "custom", desde: "2026-03-20", hasta: "2026-03-10" }, ahora),
    ).toThrow(/no puede ser posterior/);
  });

  it("rechaza rangos de más de 90 días", () => {
    expect(() =>
      resolverPeriodo({ rango: "custom", desde: "2026-01-01", hasta: "2026-12-31" }, ahora),
    ).toThrow(/máximo es de 90 días/);
  });
});

describe("diasDelPeriodo", () => {
  it("lista cada día del rango, sin el final", () => {
    const dias = diasDelPeriodo({
      key: "custom",
      label: "",
      start: "2026-03-01 00:00",
      end: "2026-03-05 00:00",
      days: 4,
    });
    expect(dias).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  it("devuelve una lista vacía si el rango es inválido", () => {
    expect(diasDelPeriodo({ key: "hoy", label: "", start: "x", end: "y", days: 0 })).toEqual([]);
  });
});

describe("prorratear", () => {
  it("un mes completo se cobra completo", () => {
    expect(
      prorratear(8_500_000, "2026-03", "2026-03-01 00:00", "2026-04-01 00:00"),
    ).toBe(8_500_000);
  });

  it("la mitad del mes cobra la mitad", () => {
    const monto = prorratear(8_500_000, "2026-03", "2026-03-01 00:00", "2026-03-16 00:00");
    // 15 de 31 días.
    expect(monto).toBeCloseTo(8_500_000 * (15 / 31), 0);
  });

  it("un rango fuera del mes no aporta nada", () => {
    expect(
      prorratear(8_500_000, "2026-03", "2026-04-01 00:00", "2026-04-15 00:00"),
    ).toBe(0);
  });

  it("un rango dentro de dos meses prorratea cada parte", () => {
    // Del 16 de marzo al 1 de abril son 16 días de solape con marzo.
    const marzo = prorratear(3_100_000, "2026-03", "2026-03-16 00:00", "2026-04-01 00:00");
    const abril = prorratear(3_100_000, "2026-04", "2026-03-16 00:00", "2026-04-01 00:00");
    expect(marzo).toBeCloseTo(3_100_000 * (16 / 31), 0);
    // Abril no aporta nada: el rango termina justo cuando empieza.
    expect(abril).toBe(0);
  });
});

describe("horasRecortadas", () => {
  const inicio = new Date(2026, 2, 10, 8, 0);
  const fin = new Date(2026, 2, 10, 12, 0);

  it("cuenta todas las horas si la reserva cabe en el rango", () => {
    expect(
      horasRecortadas(inicio, fin, new Date(2026, 2, 10, 0, 0), new Date(2026, 2, 11, 0, 0)),
    ).toBe(4);
  });

  it("recorta la parte que cae antes del rango", () => {
    expect(
      horasRecortadas(inicio, fin, new Date(2026, 2, 10, 10, 0), new Date(2026, 2, 11, 0, 0)),
    ).toBe(2);
  });

  it("recorta la parte que cae después del rango", () => {
    expect(
      horasRecortadas(inicio, fin, new Date(2026, 2, 10, 0, 0), new Date(2026, 2, 10, 9, 0)),
    ).toBe(1);
  });

  it("devuelve cero si la reserva está fuera del rango", () => {
    expect(
      horasRecortadas(inicio, fin, new Date(2026, 2, 11, 0, 0), new Date(2026, 2, 12, 0, 0)),
    ).toBe(0);
  });
});
