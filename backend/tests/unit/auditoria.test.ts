import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { describirCambio, type Cambio } from "../../src/lib/auditoria.js";
import { registrarActividad } from "../../src/middleware/auditoria.js";

describe("describirCambio", () => {
  it("marca un alta y toma el id de la respuesta", () => {
    const cambio = describirCambio(
      "POST",
      "/api/espacios",
      { nombre: "Sala Norte", tipo: "sala" },
      { id: 9, nombre: "Sala Norte" },
    );

    expect(cambio).toMatchObject({
      accion: "crear",
      entidad: "espacios",
      entidadId: "9",
      detalle: { nombre: "Sala Norte", tipo: "sala" },
    });
  });

  it("marca una baja con el id de la ruta", () => {
    const cambio = describirCambio("DELETE", "/api/espacios/9", undefined, undefined);
    expect(cambio).toMatchObject({ accion: "eliminar", entidad: "espacios", entidadId: "9" });
  });

  it("trata cancelar como baja y cerrar como cambio", () => {
    expect(describirCambio("POST", "/api/experiencias/4/cancelar", {}, { id: 4 })?.accion).toBe(
      "eliminar",
    );
    expect(describirCambio("POST", "/api/experiencias/4/cerrar", {}, { id: 4 })?.accion).toBe(
      "actualizar",
    );
    expect(
      describirCambio("POST", "/api/experiencias/4/participantes", { nombre: "Ana" }, { id: 12 }),
    ).toMatchObject({
      accion: "crear",
      entidadId: "4",
      detalle: { nombre: "Ana", subrecurso: "participantes", resultadoId: "12" },
    });
  });

  it("no guarda claves, tokens ni datos de contacto", () => {
    const cambio = describirCambio(
      "PATCH",
      "/api/usuarios/2",
      {
        activo: false,
        password: "Secreto1!",
        confirmacion: "Secreto1!",
        telefono: "3001234567",
        documento: "123",
        token: "abc",
        nombre: "Ana Ruiz",
      },
      { id: 2 },
    );

    expect(cambio?.accion).toBe("actualizar");
    expect(cambio?.detalle).toEqual({ activo: false, nombre: "Ana Ruiz" });
  });

  it("cuenta listas sin copiar su contenido", () => {
    const cambio = describirCambio(
      "POST",
      "/api/ventas?origen=caja",
      { items: [{}, {}] },
      { id: 3 },
    );
    expect(cambio?.detalle.itemsCantidad).toBe(2);
    expect(cambio?.detalle).not.toHaveProperty("items");
  });

  it("ignora sesión, salud y la propia consulta del registro", () => {
    expect(
      describirCambio("POST", "/api/auth/login", { password: "x" }, { accessToken: "t" }),
    ).toBe(null);
    expect(describirCambio("GET", "/api/espacios", {}, {})).toBeNull();
    expect(describirCambio("POST", "/api/registros", {}, {})).toBeNull();
  });
});

describe("registrarActividad", () => {
  function appCon(guardar: (cambio: Cambio) => Promise<void> | void, conActor = true) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (conActor) req.auth = { userId: 1, rol: "admin", email: "admin@kairo.local" };
      next();
    });
    app.use(
      registrarActividad(async (_actor, cambio) => {
        await guardar(cambio);
      }),
    );
    app.post("/api/espacios", (_req, res) => {
      res.status(201).json({ id: 9, nombre: "Sala Norte" });
    });
    app.post("/api/auth/login", (_req, res) => {
      res.status(200).json({ accessToken: "no-guardar" });
    });
    app.post("/api/espacios/falla", (_req, res) => {
      res.status(422).json({ error: { code: "VALIDATION_ERROR" } });
    });
    app.delete("/api/espacios/9", (_req, res) => {
      res.status(204).send();
    });
    return app;
  }

  it("anota altas y bajas exitosas, y omite login y errores", async () => {
    const cambios: Cambio[] = [];
    const app = appCon((cambio) => {
      cambios.push(cambio);
    });

    await request(app)
      .post("/api/espacios")
      .send({ nombre: "Sala Norte", password: "Secreto1!" })
      .expect(201);
    await request(app).post("/api/auth/login").send({ password: "x" }).expect(200);
    await request(app).post("/api/espacios/falla").send({ nombre: "no" }).expect(422);
    await request(app).delete("/api/espacios/9").expect(204);

    expect(cambios.map((cambio) => cambio.accion)).toEqual(["crear", "eliminar"]);
    expect(cambios[0]?.detalle).not.toHaveProperty("password");
    expect(cambios[0]?.entidadId).toBe("9");
    expect(cambios[1]?.entidadId).toBe("9");
  });

  it("responde igual si la bitácora falla", async () => {
    const app = appCon(() => {
      throw new Error("base caída");
    });

    const response = await request(app)
      .post("/api/espacios")
      .send({ nombre: "Sala Norte" })
      .expect(201);
    expect(response.body.nombre).toBe("Sala Norte");
  });

  it("no anota una escritura sin sesión", async () => {
    const cambios: Cambio[] = [];
    const app = appCon((cambio) => {
      cambios.push(cambio);
    }, false);

    await request(app).post("/api/espacios").send({ nombre: "Sala Norte" }).expect(201);
    expect(cambios).toHaveLength(0);
  });
});
