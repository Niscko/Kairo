import { describe, expect, it } from "vitest";

import { aCsv, escaparCsv, nombreArchivo } from "../../src/lib/csv.js";

describe("escaparCsv", () => {
  it("deja intacto un valor simple", () => {
    expect(escaparCsv("Café")).toBe("Café");
    expect(escaparCsv(42)).toBe("42");
  });

  it("entrecomilla si hay coma", () => {
    expect(escaparCsv("Sala, Roble")).toBe('"Sala, Roble"');
  });

  it("entrecomilla si hay comilla y la duplica", () => {
    expect(escaparCsv('Dicen "hola"')).toBe('"Dicen ""hola"""');
  });

  it("entrecomilla si hay salto de línea", () => {
    expect(escaparCsv("primera\nsegunda")).toBe('"primera\nsegunda"');
  });

  it("convierte null y undefined en cadena vacía", () => {
    expect(escaparCsv(null)).toBe("");
    expect(escaparCsv(undefined)).toBe("");
  });
});

describe("aCsv", () => {
  it("une los valores con punto y coma", () => {
    // Con coma, Excel en español leería mal las cifras: el separador es ";".
    const csv = aCsv(["Fecha", "Total"], [["2026-03-10", 1234]]);
    expect(csv).toContain("Fecha;Total");
    expect(csv).toContain("2026-03-10;1234");
  });

  it("antepone el BOM para que Excel reconozca UTF-8", () => {
    const csv = aCsv(["A"], [["B"]]);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("termina las líneas con CRLF", () => {
    const csv = aCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(csv).toContain("\r\n");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(3);
  });

  it("una tabla vacía conserva la cabecera", () => {
    const csv = aCsv(["A", "B"], []);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
  });
});

describe("nombreArchivo", () => {
  it("incluye la marca de tiempo", () => {
    const nombre = nombreArchivo("ventas", new Date(2026, 2, 10, 14, 30));
    expect(nombre).toBe("ventas-20260310-1430.csv");
  });
});
