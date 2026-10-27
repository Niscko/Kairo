import { describe, expect, it } from "vitest";

import { ValidationError } from "../../src/lib/errors.js";
import { esHoraValida, horaEsAnterior, validarHorario } from "../../src/lib/horarios.js";
import { formatDateTimeLocal, parseDateTimeLocal } from "../../src/modules/reservas/schema.js";

describe("validarHorario", () => {
  const inicio = (hora: string): Date => parseDateTimeLocal(`2026-03-10 ${hora}`)!;
  const fin = (hora: string): Date => parseDateTimeLocal(`2026-03-10 ${hora}`)!;

  it("acepta un bloque dentro del horario de atención", () => {
    expect(validarHorario(inicio("08:00"), fin("12:00"))).toBe(4);
  });

  it("rechaza que empiece y termine en días distintos", () => {
    const otroDia = parseDateTimeLocal("2026-03-11 12:00")!;
    expect(() => validarHorario(inicio("08:00"), otroDia)).toThrow(/mismo día/);
  });

  it("exige intervalos de 30 minutos", () => {
    expect(() => validarHorario(inicio("08:15"), fin("12:00"))).toThrow(/30 minutos/);
  });

  it("rechaza franjas fuera del horario de atención", () => {
    expect(() => validarHorario(inicio("06:00"), fin("12:00"))).toThrow(/7:00 a 23:00/);
    expect(() => validarHorario(inicio("08:00"), fin("23:30"))).toThrow(/7:00 a 23:00/);
  });

  it("exige al menos una hora", () => {
    expect(() => validarHorario(inicio("08:00"), fin("08:30"))).toThrow(/mínima es de una hora/);
  });

  it("exige un máximo de 14 horas", () => {
    expect(() => validarHorario(inicio("07:00"), fin("22:00"))).toThrow(/máxima es de 14 horas/);
  });

  it("admite exactamente los límites", () => {
    expect(validarHorario(inicio("07:00"), fin("08:00"))).toBe(1);
    expect(validarHorario(inicio("07:00"), fin("21:00"))).toBe(14);
  });

  it("rechaza una franja que cabe en el horario pero excede la duración máxima", () => {
    // 07:00–23:00 está dentro del horario de atención, pero son 16 horas.
    expect(() => validarHorario(inicio("07:00"), fin("23:00"))).toThrow(/máxima es de 14 horas/);
  });

  it("lanza ValidationError, no un error genérico", () => {
    expect(() => validarHorario(inicio("06:00"), fin("12:00"))).toThrow(ValidationError);
  });
});

describe("parseDateTimeLocal", () => {
  it("interpreta la cadena como hora local", () => {
    const fecha = parseDateTimeLocal("2026-03-10 14:30")!;
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(2);
    expect(fecha.getDate()).toBe(10);
    expect(fecha.getHours()).toBe(14);
    expect(fecha.getMinutes()).toBe(30);
  });

  it("devuelve null si la fecha no existe", () => {
    expect(parseDateTimeLocal("2026-02-30 10:00")).toBeNull();
    expect(parseDateTimeLocal("2026-13-01 10:00")).toBeNull();
  });

  it("devuelve null si el formato no coincide", () => {
    expect(parseDateTimeLocal("2026-03-10")).toBeNull();
    expect(parseDateTimeLocal("10/03/2026 10:00")).toBeNull();
    expect(parseDateTimeLocal("")).toBeNull();
  });

  it("hace round-trip con formatDateTimeLocal", () => {
    const original = "2026-03-10 14:30";
    expect(formatDateTimeLocal(parseDateTimeLocal(original)!)).toBe(original);
  });
});

describe("horas de turno", () => {
  it("valida el formato HH:MM", () => {
    expect(esHoraValida("08:00")).toBe(true);
    expect(esHoraValida("23:59")).toBe(true);
    expect(esHoraValida("24:00")).toBe(false);
    expect(esHoraValida("8:00")).toBe(false);
    expect(esHoraValida("08:60")).toBe(false);
  });

  it("compara horas en orden cronológico", () => {
    expect(horaEsAnterior("08:00", "17:00")).toBe(true);
    expect(horaEsAnterior("17:00", "08:00")).toBe(false);
    expect(horaEsAnterior("08:00", "08:00")).toBe(false);
  });
});
