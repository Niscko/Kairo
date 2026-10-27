import { describe, expect, it } from "vitest";

import {
  addDays,
  dateISO,
  dayStamp,
  estadoPorHorario,
  hoursBetween,
  montoReserva,
  mulberry32,
  weighted,
} from "../../src/lib/domain.js";

describe("montoReserva", () => {
  const base = {
    hours: 4,
    tarifaHora: 8_000,
    tipo: "puesto" as const,
    membresia: "ninguna" as const,
    membresiaVence: null,
    day: "2026-03-10",
    proposito: "trabajo",
  };

  it("cobra la tarifa por hora sin membresía", () => {
    expect(montoReserva(base)).toBe(32_000);
  });

  it("no cobra un puesto a un miembro mensual vigente", () => {
    expect(
      montoReserva({ ...base, membresia: "mensual", membresiaVence: new Date(2026, 2, 31) }),
    ).toBe(0);
  });

  it("sí cobra si la membresía mensual ya venció", () => {
    expect(
      montoReserva({ ...base, membresia: "mensual", membresiaVence: new Date(2026, 2, 9) }),
    ).toBe(32_000);
  });

  it("la membresía de día solo cubre el día exacto", () => {
    expect(
      montoReserva({ ...base, membresia: "dia", membresiaVence: new Date(2026, 2, 10) }),
    ).toBe(0);
    expect(
      montoReserva({ ...base, membresia: "dia", membresiaVence: new Date(2026, 2, 11) }),
    ).toBe(32_000);
  });

  it("la membresía no cubre salas, solo puestos", () => {
    expect(
      montoReserva({
        ...base,
        tipo: "sala",
        membresia: "mensual",
        membresiaVence: new Date(2026, 2, 31),
      }),
    ).toBe(32_000);
  });

  it("un evento no se cobra por hora de espacio", () => {
    expect(montoReserva({ ...base, proposito: "evento" })).toBe(0);
  });
});

describe("estadoPorHorario", () => {
  const inicio = new Date(2026, 2, 10, 9, 0);
  const fin = new Date(2026, 2, 10, 12, 0);

  it("marca completada cuando ya terminó", () => {
    expect(estadoPorHorario(inicio, fin, new Date(2026, 2, 10, 13, 0))).toBe("completada");
  });

  it("marca en curso cuando la hora actual está dentro", () => {
    expect(estadoPorHorario(inicio, fin, new Date(2026, 2, 10, 10, 0))).toBe("en_curso");
  });

  it("marca confirmada cuando aún no empieza", () => {
    expect(estadoPorHorario(inicio, fin, new Date(2026, 2, 10, 8, 0))).toBe("confirmada");
  });
});

describe("utilidades de fecha", () => {
  it("dateISO usa formato YYYY-MM-DD", () => {
    expect(dateISO(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("addDays no muta el original", () => {
    const base = new Date(2026, 2, 10);
    addDays(base, 5);
    expect(dateISO(base)).toBe("2026-03-10");
  });

  it("dayStamp combina fecha y hora en hora local", () => {
    const resultado = dayStamp(new Date(2026, 2, 10), "14:30");
    expect(resultado.getHours()).toBe(14);
    expect(resultado.getMinutes()).toBe(30);
    expect(dateISO(resultado)).toBe("2026-03-10");
  });

  it("hoursBetween devuelve decimales", () => {
    const a = new Date(2026, 2, 10, 8, 0);
    const b = new Date(2026, 2, 10, 9, 30);
    expect(hoursBetween(a, b)).toBe(1.5);
  });
});

describe("aleatoriedad determinista", () => {
  it("mulberry32 produce la misma secuencia para la misma semilla", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("weighted cae dentro del rango [0, 1)", () => {
    const random = mulberry32(7);
    for (let i = 0; i < 100; i += 1) {
      const valor = random();
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it("weighted reparte aproximadamente según los pesos", () => {
    const random = mulberry32(20260929);
    const items = [
      { nombre: "a", weight: 0.5 },
      { nombre: "b", weight: 0.3 },
      { nombre: "c", weight: 0.2 },
    ];
    const conteo = new Map<string, number>([
      ["a", 0],
      ["b", 0],
      ["c", 0],
    ]);
    for (let i = 0; i < 10_000; i += 1) {
      const elegido = weighted(random, items).nombre;
      conteo.set(elegido, (conteo.get(elegido) ?? 0) + 1);
    }
    // Tolerancia amplia: solo verifica que la distribución no está sesgada.
    expect(conteo.get("a")).toBeGreaterThan(4_500);
    expect(conteo.get("a")).toBeLessThan(5_500);
  });

  it("weighted lanza con una lista vacía en vez de devolver undefined", () => {
    expect(() => weighted(mulberry32(1), [])).toThrow(/al menos un elemento/);
  });
});