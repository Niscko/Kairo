const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { openDatabase } = require("./db");
const {
  stamp,
  dateISO,
  addDays,
  normalizeInput,
  hoursBetween,
  sameDay,
  withinService,
  validMinutes,
  monthBounds,
  resolvePeriod,
  eachDay,
  prorateAmount,
  parseISODate,
} = require("./time");
const { montoReserva } = require("./domain");

const db = openDatabase();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "kairo.sid",
    secret: "kairo-sistemas-empresariales",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 12 },
  })
);

function business(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function say(req, es, en) {
  const header = String(req.headers["accept-language"] || "");
  return header.toLowerCase().startsWith("en") ? en : es;
}

const DUMMY_HASH = bcrypt.hashSync("kairo-placeholder", 8);

function rejectSignedOut(req, res) {
  const inactive = Boolean(req.session.user);
  const message = inactive
    ? say(req, "Tu cuenta está inactiva", "Your account is inactive")
    : say(req, "Inicia sesión para continuar", "Sign in to continue");
  if (inactive) req.session.destroy(() => {});
  res.status(401).json({ error: message });
}

function currentUser(req) {
  if (!req.session.user) return null;
  const fresh = loadSession(req.session.user.id);
  if (!fresh) return null;
  req.session.user = fresh;
  return fresh;
}

function requireAuth(req, res, next) {
  if (!currentUser(req)) return rejectSignedOut(req, res);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!currentUser(req)) return rejectSignedOut(req, res);
    if (!roles.includes(req.session.user.rol)) {
      return res.status(403).json({ error: say(req, "No tienes permiso para esta acción", "You do not have permission for this action") });
    }
    next();
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validName(nombre) {
  return nombre.length >= 3 && nombre.length <= 80 && /^[\p{L}][\p{L}\s'.-]*[\p{L}.]$/u.test(nombre);
}

function validPhone(value) {
  if (!/^[+\d\s()-]{7,20}$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function validDoc(value) {
  return /^[A-Za-z0-9.-]{5,20}$/.test(value);
}

function passwordIssues(password, email) {
  const issues = [];
  if (typeof password !== "string" || password.length < 8 || password.length > 72) issues.push("length");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) issues.push("case");
  if (!/\d/.test(password)) issues.push("digit");
  if (/\s/.test(password) || !/[^A-Za-z0-9]/.test(password)) issues.push("symbol");
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local.length >= 3 && password.toLowerCase().includes(local)) issues.push("email");
  return issues;
}

function assertPassword(req, password, confirmacion, email) {
  if (password !== confirmacion) {
    throw business(say(req, "La confirmación no coincide con la clave", "The confirmation does not match the password"));
  }
  if (passwordIssues(password, email).length) {
    throw business(say(
      req,
      "La clave debe tener entre 8 y 72 caracteres, con mayúscula, minúscula, número y un símbolo, sin espacios y sin incluir el correo.",
      "The password must be 8 to 72 characters and include an uppercase letter, a lowercase letter, a number, and a symbol, with no spaces and without the email."
    ));
  }
}

function readNewAccount(req, { publicClient = false } = {}) {
  const nombre = text(req.body.nombre, 80);
  const email = text(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmacion = typeof req.body.confirmacion === "string" ? req.body.confirmacion : "";
  const telefono = text(req.body.telefono, 20);
  const documento = text(req.body.documento, 20);
  const rol = publicClient ? "cliente" : req.body.rol;
  if (!validName(nombre)) {
    throw business(say(req, "Escribe un nombre completo, solo con letras.", "Enter a full name using letters only."));
  }
  if (!validEmail(email)) throw business(say(req, "El correo no es válido", "The email is not valid"));
  assertPassword(req, password, confirmacion, email);
  if (telefono && !validPhone(telefono)) throw business(say(req, "El teléfono no es válido", "The phone number is not valid"));
  if (!["admin", "empleado", "cliente"].includes(rol)) throw business(say(req, "El rol no es válido", "The role is not valid"));
  const account = { nombre, email, password, rol, telefono };
  if (rol === "cliente") {
    if (documento && !validDoc(documento)) throw business(say(req, "El documento no es válido", "The ID number is not valid"));
    account.documento = documento;
  }
  if (rol === "empleado") {
    const cargo = text(req.body.cargo, 40);
    const salario = money(req.body.salario);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha_ingreso || "") && parseISODate(req.body.fecha_ingreso) ? req.body.fecha_ingreso : null;
    if (cargo.length < 2) throw business(say(req, "Indica el cargo", "Enter the job title"));
    if (salario === null || salario <= 0) throw business(say(req, "El salario no es válido", "The salary is not valid"));
    if (!fecha) throw business(say(req, "La fecha de ingreso no es válida", "The start date is not valid"));
    account.cargo = cargo;
    account.salario = salario;
    account.fecha_ingreso = fecha;
  }
  return account;
}

function insertAccount(account) {
  const hash = bcrypt.hashSync(account.password, 8);
  const tx = db.transaction(() => {
    const userId = db.prepare(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, activo) VALUES (?, ?, ?, ?, ?, 1)`
    ).run(account.nombre, account.email, hash, account.rol, account.telefono || null).lastInsertRowid;
    if (account.rol === "cliente") {
      db.prepare(`INSERT INTO clientes (usuario_id, documento, membresia) VALUES (?, ?, 'ninguna')`).run(userId, account.documento || null);
    }
    if (account.rol === "empleado") {
      db.prepare(
        `INSERT INTO empleados (usuario_id, cargo, salario, fecha_ingreso, activo) VALUES (?, ?, ?, ?, 1)`
      ).run(userId, account.cargo, account.salario, account.fecha_ingreso);
    }
    return Number(userId);
  });
  return tx();
}

function text(value, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function whole(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function money(value) {
  const number = whole(value);
  if (number === null || number < 0 || number > 100000000) return null;
  return number;
}

function sessionUser(row, empleadoId, clienteId) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    empleado_id: empleadoId,
    cliente_id: clienteId,
  };
}

function loadSession(userId) {
  const user = db.prepare(`SELECT * FROM usuarios WHERE id = ? AND activo = 1`).get(userId);
  if (!user) return null;
  const empleado = db.prepare(`SELECT id FROM empleados WHERE usuario_id = ?`).get(user.id);
  const cliente = db.prepare(`SELECT id FROM clientes WHERE usuario_id = ?`).get(user.id);
  return sessionUser(user, empleado ? empleado.id : null, cliente ? cliente.id : null);
}

function publicCliente(row, staff) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: staff ? row.email : undefined,
    telefono: staff ? row.telefono : undefined,
    documento: staff ? row.documento : undefined,
    membresia: row.membresia,
    membresia_vence: row.membresia_vence,
  };
}

function costoProductos(items) {
  let total = 0;
  const receta = db.prepare(`
    SELECT r.cantidad, i.costo_unitario
    FROM recetas r JOIN insumos i ON i.id = r.insumo_id
    WHERE r.producto_id = ?
  `);
  for (const item of items) {
    for (const line of receta.all(item.producto_id)) {
      total += line.cantidad * item.cantidad * line.costo_unitario;
    }
  }
  return Math.round(total);
}

function consumeProducts(items, meta) {
  const need = new Map();
  const receta = db.prepare(`SELECT insumo_id, cantidad FROM recetas WHERE producto_id = ?`);
  for (const item of items) {
    for (const line of receta.all(item.producto_id)) {
      need.set(line.insumo_id, (need.get(line.insumo_id) || 0) + line.cantidad * item.cantidad);
    }
  }
  const read = db.prepare(`SELECT nombre, unidad, stock, costo_unitario FROM insumos WHERE id = ?`);
  let costo = 0;
  for (const [id, cantidad] of need) {
    const insumo = read.get(id);
    if (insumo.stock + 1e-6 < cantidad) {
      throw business(
        `Stock insuficiente de ${insumo.nombre}. Hay ${trimNumber(insumo.stock)} ${insumo.unidad} y se necesitan ${trimNumber(cantidad)}.`
      );
    }
    costo += cantidad * insumo.costo_unitario;
  }
  const update = db.prepare(`UPDATE insumos SET stock = stock - ? WHERE id = ?`);
  const move = db.prepare(
    `INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, fecha, referencia) VALUES (?, 'salida', ?, ?, ?, ?)`
  );
  for (const [id, cantidad] of need) {
    update.run(cantidad, id);
    move.run(id, cantidad, meta.motivo, meta.fecha, meta.referencia);
  }
  return Math.round(costo);
}

function trimNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function validarHorario(inicio, fin) {
  if (!inicio || !fin) throw business("Indica fecha y hora de inicio y de fin");
  if (!sameDay(inicio, fin)) throw business("La actividad debe empezar y terminar el mismo día");
  if (!validMinutes(inicio) || !validMinutes(fin)) throw business("Usa intervalos de 30 minutos");
  if (!withinService(inicio, fin)) throw business("El horario de atención es de 7:00 a 23:00");
  const hours = hoursBetween(inicio, fin);
  if (hours < 1) throw business("La duración mínima es de una hora");
  if (hours > 14) throw business("La duración máxima es de 14 horas");
  return hours;
}

function reservaCruzada(espacioId, inicio, fin, ignoreId = null) {
  const row = db.prepare(`
    SELECT id FROM reservas
    WHERE espacio_id = ? AND estado != 'cancelada'
      AND inicio < ? AND fin > ?
      AND (? IS NULL OR id != ?)
  `).get(espacioId, fin, inicio, ignoreId, ignoreId);
  return Boolean(row);
}

function quote(espacio, cliente, inicio, fin, proposito) {
  return montoReserva({
    hours: hoursBetween(inicio, fin),
    tarifaHora: espacio.tarifa_hora,
    tipo: espacio.tipo,
    membresia: cliente ? cliente.membresia : "ninguna",
    membresiaVence: cliente ? cliente.membresia_vence : null,
    day: inicio.slice(0, 10),
    proposito,
  });
}

function presenciaEspacios() {
  const ahora = stamp();
  const pronto = stamp(new Date(Date.now() + 3 * 60 * 60 * 1000));
  const espacios = db.prepare(`SELECT * FROM espacios ORDER BY tipo, nombre`).all();
  const reservas = db.prepare(`
    SELECT r.*, u.nombre AS cliente
    FROM reservas r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE r.estado != 'cancelada' AND r.fin > ?
    ORDER BY r.inicio
  `).all(ahora.slice(0, 10) + " 00:00");
  return espacios.map((espacio) => {
    const propias = reservas.filter((reserva) => reserva.espacio_id === espacio.id);
    const actual = propias.find((reserva) => reserva.inicio <= ahora && reserva.fin > ahora);
    const siguiente = propias.find((reserva) => reserva.inicio > ahora);
    let presencia = "libre";
    if (espacio.estado === "mantenimiento") presencia = "mantenimiento";
    else if (actual) presencia = "ocupado";
    else if (siguiente && siguiente.inicio <= pronto) presencia = "pronto";
    return {
      ...espacio,
      presencia,
      ocupante: actual ? actual.cliente || actual.notas || "Reservado" : null,
      hasta: actual ? actual.fin.slice(11, 16) : null,
      proxima: siguiente ? `${siguiente.inicio.slice(11, 16)} ${siguiente.cliente || ""}`.trim() : null,
    };
  });
}

function loadExperiencias() {
  const experiencias = db.prepare(`
    SELECT e.*, s.nombre AS espacio, s.tipo AS tipo_espacio, s.tarifa_hora
    FROM experiencias e JOIN espacios s ON s.id = e.espacio_id
    ORDER BY e.inicio
  `).all();
  const empleados = db.prepare(`
    SELECT ee.experiencia_id, e.id, u.nombre, e.cargo
    FROM experiencia_empleados ee
    JOIN empleados e ON e.id = ee.empleado_id
    JOIN usuarios u ON u.id = e.usuario_id
    ORDER BY u.nombre
  `).all();
  const equipos = db.prepare(`
    SELECT ee.experiencia_id, q.id, q.nombre, q.tipo, q.estado
    FROM experiencia_equipos ee JOIN equipos q ON q.id = ee.equipo_id
    ORDER BY q.nombre
  `).all();
  const productos = db.prepare(`
    SELECT ep.experiencia_id, p.id, p.nombre, ep.cantidad, p.precio
    FROM experiencia_productos ep JOIN productos p ON p.id = ep.producto_id
  `).all();
  const participantes = db.prepare(`
    SELECT ep.experiencia_id, c.id, u.nombre
    FROM experiencia_participantes ep
    JOIN clientes c ON c.id = ep.cliente_id
    JOIN usuarios u ON u.id = c.usuario_id
    ORDER BY u.nombre
  `).all();
  const costoUnitario = new Map();
  const recetas = db.prepare(`
    SELECT r.producto_id, r.cantidad, i.costo_unitario
    FROM recetas r JOIN insumos i ON i.id = r.insumo_id
  `).all();
  for (const line of recetas) {
    costoUnitario.set(line.producto_id, (costoUnitario.get(line.producto_id) || 0) + line.cantidad * line.costo_unitario);
  }
  return experiencias.map((experiencia) => {
    const goods = productos.filter((item) => item.experiencia_id === experiencia.id);
    const costoProductosExp = goods.reduce(
      (sum, item) => sum + Math.round((costoUnitario.get(item.id) || 0) * item.cantidad),
      0
    );
    const hours = hoursBetween(experiencia.inicio, experiencia.fin);
    const people = participantes.filter((item) => item.experiencia_id === experiencia.id);
    return {
      ...experiencia,
      horas: hours,
      costo_espacio: Math.round(hours * experiencia.tarifa_hora),
      costo_productos: costoProductosExp,
      ingresos: experiencia.precio * people.length,
      empleados: empleados.filter((item) => item.experiencia_id === experiencia.id),
      equipos: equipos.filter((item) => item.experiencia_id === experiencia.id),
      productos: goods,
      participantes: people,
    };
  });
}

app.post("/api/registro", wrap((req, res) => {
  const account = readNewAccount(req, { publicClient: true });
  if (db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(account.email)) {
    throw business(say(req, "Ese correo ya está registrado", "That email is already registered"));
  }
  req.session.user = loadSession(insertAccount(account));
  res.status(201).json({ user: req.session.user });
}));

app.post("/api/login", wrap((req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email);
  const matches = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !matches) {
    throw business(say(req, "Correo o clave incorrectos", "Incorrect email or password"), 401);
  }
  if (!user.activo) {
    throw business(say(
      req,
      "Esta cuenta está inactiva. Pide a dirección que la reactive.",
      "This account is inactive. Ask management to reactivate it."
    ), 403);
  }
  req.session.user = loadSession(user.id);
  res.json({ user: req.session.user });
}));

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!currentUser(req)) return rejectSignedOut(req, res);
  res.json(req.session.user);
});

app.post("/api/recuperar", wrap((req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const generic = say(
    req,
    "Si el correo pertenece a una cuenta activa, el código aparece en la bandeja simulada.",
    "If the email belongs to an active account, the code appears in the simulated inbox."
  );
  if (!validEmail(email)) throw business(say(req, "El correo no es válido", "The email is not valid"));
  const user = db.prepare(`SELECT id, activo FROM usuarios WHERE email = ?`).get(email);
  let codigo = null;
  if (user && user.activo) {
    const now = Date.now();
    const latest = db.prepare(`SELECT creado FROM recuperaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 1`).get(user.id);
    if (latest && now - latest.creado < 60 * 1000) {
      throw business(say(req, "Espera un minuto antes de pedir otro código", "Wait a minute before requesting another code"), 429);
    }
    codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    db.prepare(`UPDATE recuperaciones SET usado = 1 WHERE usuario_id = ? AND usado = 0`).run(user.id);
    db.prepare(
      `INSERT INTO recuperaciones (usuario_id, codigo_hash, creado, expira, intentos, usado) VALUES (?, ?, ?, ?, 0, 0)`
    ).run(user.id, bcrypt.hashSync(codigo, 8), now, now + 15 * 60 * 1000);
  }
  res.json({ ok: true, mensaje: generic, correo_simulado: codigo });
}));

app.post("/api/recuperar/confirmar", wrap((req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const codigo = text(req.body.codigo, 8);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmacion = typeof req.body.confirmacion === "string" ? req.body.confirmacion : "";
  const invalid = say(req, "El código no es válido o expiró", "The code is invalid or has expired");
  if (!validEmail(email) || !/^\d{6}$/.test(codigo)) throw business(invalid);
  const user = db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email);
  const rows = user
    ? db.prepare(`SELECT * FROM recuperaciones WHERE usuario_id = ? AND usado = 0 AND expira > ? ORDER BY id DESC`).all(user.id, Date.now())
    : [];
  const match = rows.find((row) => bcrypt.compareSync(codigo, row.codigo_hash));
  if (!user || !match) {
    if (rows[0]) {
      const attempts = rows[0].intentos + 1;
      db.prepare(`UPDATE recuperaciones SET intentos = ?, usado = ? WHERE id = ?`).run(attempts, attempts >= 5 ? 1 : 0, rows[0].id);
    }
    throw business(invalid);
  }
  assertPassword(req, password, confirmacion, email);
  if (bcrypt.compareSync(password, user.password_hash)) {
    throw business(say(req, "La clave nueva debe ser distinta a la actual", "The new password must be different from the current one"));
  }
  db.prepare(`UPDATE usuarios SET password_hash = ? WHERE id = ?`).run(bcrypt.hashSync(password, 8), user.id);
  db.prepare(`UPDATE recuperaciones SET usado = 1 WHERE usuario_id = ?`).run(user.id);
  res.json({ ok: true });
}));

app.post("/api/cuenta/clave", requireAuth, wrap((req, res) => {
  const actual = typeof req.body.actual === "string" ? req.body.actual : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmacion = typeof req.body.confirmacion === "string" ? req.body.confirmacion : "";
  const user = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(req.session.user.id);
  if (!user || !bcrypt.compareSync(actual, user.password_hash)) {
    throw business(say(req, "La clave actual no es correcta", "The current password is incorrect"), 401);
  }
  assertPassword(req, password, confirmacion, user.email);
  if (bcrypt.compareSync(password, user.password_hash)) {
    throw business(say(req, "La clave nueva debe ser distinta a la actual", "The new password must be different from the current one"));
  }
  db.prepare(`UPDATE usuarios SET password_hash = ? WHERE id = ?`).run(bcrypt.hashSync(password, 8), user.id);
  res.json({ ok: true });
}));

app.get("/api/usuarios", requireRole("admin"), wrap((req, res) => {
  const usuarios = db.prepare(`
    SELECT u.id, u.nombre, u.email, u.rol, u.telefono, u.activo, e.cargo
    FROM usuarios u
    LEFT JOIN empleados e ON e.usuario_id = u.id
    ORDER BY u.activo DESC, u.nombre
  `).all();
  res.json({
    usuarios: usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      telefono: usuario.telefono,
      cargo: usuario.cargo,
      activo: Boolean(usuario.activo),
    })),
  });
}));

app.post("/api/usuarios", requireRole("admin"), wrap((req, res) => {
  const account = readNewAccount(req);
  if (db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(account.email)) {
    throw business(say(req, "Ese correo ya está registrado", "That email is already registered"));
  }
  const id = insertAccount(account);
  res.status(201).json({ id });
}));

app.patch("/api/usuarios/:id", requireRole("admin"), wrap((req, res) => {
  const id = whole(req.params.id);
  if (!id || typeof req.body.activo !== "boolean") {
    throw business(say(req, "Indica si la cuenta queda activa o inactiva", "Say whether the account should be active or inactive"));
  }
  const user = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(id);
  if (!user) throw business(say(req, "Usuario no encontrado", "User not found"), 404);
  if (user.id === req.session.user.id && !req.body.activo) {
    throw business(say(req, "No puedes desactivar tu propia cuenta", "You cannot deactivate your own account"));
  }
  const activo = req.body.activo ? 1 : 0;
  if (user.rol === "admin" && user.activo && !activo) {
    const others = db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?`).get(id).n;
    if (!others) throw business(say(req, "Debe quedar al menos una dirección activa", "At least one active manager must remain"));
  }
  const tx = db.transaction(() => {
    db.prepare(`UPDATE usuarios SET activo = ? WHERE id = ?`).run(activo, id);
    db.prepare(`UPDATE empleados SET activo = ? WHERE usuario_id = ?`).run(activo, id);
  });
  tx();
  res.json({ ok: true, activo: Boolean(activo) });
}));

app.get("/api/dashboard", requireAuth, wrap((req, res) => {
  const hoy = dateISO(new Date());
  const ahora = stamp();
  const manana = dateISO(addDays(new Date(), 1));
  const bounds = monthBounds();
  const user = req.session.user;
  const espacios = presenciaEspacios();
  const ocupados = espacios.filter((espacio) => espacio.presencia === "ocupado").length;
  const ventasHoy = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS operaciones
    FROM ventas WHERE fecha >= ? AND fecha < ?
  `).get(`${hoy} 00:00`, `${manana} 00:00`);
  const stock = db.prepare(`
    SELECT id, nombre, unidad, stock, stock_minimo
    FROM insumos WHERE stock <= stock_minimo ORDER BY nombre
  `).all();
  const permisos = db.prepare(`
    SELECT * FROM permisos
    WHERE estado = 'vencido' OR vencimiento <= ?
    ORDER BY vencimiento
  `).all(dateISO(addDays(new Date(), 45)));
  const turnos = db.prepare(`
    SELECT t.*, u.nombre, e.cargo
    FROM turnos t
    JOIN empleados e ON e.id = t.empleado_id
    JOIN usuarios u ON u.id = e.usuario_id
    WHERE t.fecha = ?
    ORDER BY t.hora_inicio, u.nombre
  `).all(hoy);
  const experiencias = loadExperiencias().filter((item) => item.estado !== "cancelada" && item.fin >= ahora);

  if (user.rol === "cliente") {
    const reservas = db.prepare(`
      SELECT r.*, e.nombre AS espacio, e.tipo
      FROM reservas r JOIN espacios e ON e.id = r.espacio_id
      WHERE r.cliente_id = ? AND r.estado != 'cancelada' AND r.fin >= ?
      ORDER BY r.inicio LIMIT 8
    `).all(user.cliente_id, `${hoy} 00:00`);
    const consumo = db.prepare(`
      SELECT COALESCE(SUM(total), 0) AS total FROM ventas
      WHERE cliente_id = ? AND fecha >= ? AND fecha < ?
    `).get(user.cliente_id, bounds.start, bounds.end);
    return res.json({
      rol: user.rol,
      espacios,
      ocupados,
      ventasHoy,
      reservas,
      consumoMes: consumo.total,
      experiencias: experiencias.filter((item) => item.participantes.some((person) => person.id === user.cliente_id) || item.estado !== "finalizada"),
      turnos: [],
    });
  }

  const reservas = db.prepare(`
    SELECT r.*, e.nombre AS espacio, u.nombre AS cliente
    FROM reservas r
    JOIN espacios e ON e.id = r.espacio_id
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE r.estado != 'cancelada' AND r.fin >= ?
    ORDER BY r.inicio LIMIT 8
  `).all(ahora);
  const serie = db.prepare(`
    SELECT substr(fecha, 1, 10) AS dia, SUM(total) AS total
    FROM ventas WHERE fecha >= ? GROUP BY dia
  `).all(`${dateISO(addDays(new Date(), -6))} 00:00`);
  const dias = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dia = dateISO(addDays(new Date(), -offset));
    const found = serie.find((row) => row.dia === dia);
    dias.push({ dia, total: found ? found.total : 0 });
  }
  const payload = {
    rol: user.rol,
    espacios,
    ocupados,
    ventasHoy,
    reservas,
    stock,
    permisos,
    turnos,
    experiencias: experiencias.slice(0, 4),
    serie: dias,
  };
  if (user.rol === "admin") {
    const costos = db.prepare(`
      SELECT * FROM costos WHERE periodo = ? AND estado = 'pendiente' ORDER BY monto DESC
    `).all(bounds.periodo);
    payload.costosPendientes = costos;
    payload.costosPendientesTotal = costos.reduce((sum, item) => sum + item.monto, 0);
  }
  res.json(payload);
}));

app.get("/api/espacios", requireAuth, wrap((req, res) => {
  res.json({ espacios: presenciaEspacios(), ahora: stamp() });
}));

app.patch("/api/espacios/:id", requireRole("admin"), wrap((req, res) => {
  const id = whole(req.params.id);
  const estado = req.body.estado === "mantenimiento" ? "mantenimiento" : req.body.estado === "disponible" ? "disponible" : null;
  if (!id || !estado) throw business("Estado de espacio no válido");
  const result = db.prepare(`UPDATE espacios SET estado = ? WHERE id = ?`).run(estado, id);
  if (!result.changes) throw business("Espacio no encontrado", 404);
  res.json({ ok: true });
}));

app.get("/api/reservas", requireAuth, wrap((req, res) => {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || "") ? req.query.dia : dateISO(new Date());
  const start = `${dia} 00:00`;
  const end = `${dateISO(addDays(parseDate(dia), 1))} 00:00`;
  const args = [end, start];
  let filter = "";
  if (req.session.user.rol === "cliente") {
    filter = " AND r.cliente_id = ?";
    args.push(req.session.user.cliente_id);
  }
  const reservas = db.prepare(`
    SELECT r.*, e.nombre AS espacio, e.tipo, u.nombre AS cliente
    FROM reservas r
    JOIN espacios e ON e.id = r.espacio_id
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE r.inicio < ? AND r.fin > ? ${filter}
    ORDER BY r.inicio
  `).all(...args);
  res.json({ dia, reservas });
}));

function parseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

app.post("/api/reservas", requireAuth, wrap((req, res) => {
  const inicio = normalizeInput(req.body.inicio);
  const fin = normalizeInput(req.body.fin);
  const proposito = ["trabajo", "estudio", "reunion", "consumo"].includes(req.body.proposito) ? req.body.proposito : null;
  const notas = text(req.body.notas, 240);
  const espacioId = whole(req.body.espacio_id);
  if (!espacioId || !proposito) throw business("Completa el espacio y el propósito");
  validarHorario(inicio, fin);
  let clienteId = whole(req.body.cliente_id);
  if (req.session.user.rol === "cliente") clienteId = req.session.user.cliente_id;
  if (!clienteId) throw business("Selecciona el cliente de la reserva");
  const espacio = db.prepare(`SELECT * FROM espacios WHERE id = ?`).get(espacioId);
  const cliente = db.prepare(`
    SELECT c.*, u.activo, u.nombre FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?
  `).get(clienteId);
  if (!espacio) throw business("Espacio no encontrado", 404);
  if (!cliente || !cliente.activo) throw business("Cliente no encontrado", 404);
  if (espacio.estado === "mantenimiento") throw business("Ese espacio está en mantenimiento");
  if (reservaCruzada(espacio.id, inicio, fin)) throw business("Ese espacio ya está reservado en ese horario");
  const monto = quote(espacio, cliente, inicio, fin, proposito);
  const estado = inicio <= stamp() && fin > stamp() ? "en_curso" : "confirmada";
  const id = db.prepare(`
    INSERT INTO reservas (espacio_id, cliente_id, inicio, fin, proposito, estado, monto, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(espacio.id, cliente.id, inicio, fin, proposito, estado, monto, notas || null).lastInsertRowid;
  res.status(201).json({ id, monto, incluido: monto === 0 && espacio.tipo === "puesto" });
}));

app.patch("/api/reservas/:id", requireAuth, wrap((req, res) => {
  const id = whole(req.params.id);
  if (req.body.estado !== "cancelada") throw business("Solo se puede cancelar la reserva");
  const reserva = db.prepare(`SELECT * FROM reservas WHERE id = ?`).get(id);
  if (!reserva) throw business("Reserva no encontrada", 404);
  if (req.session.user.rol === "cliente" && reserva.cliente_id !== req.session.user.cliente_id) {
    throw business("No tienes permiso para esta acción", 403);
  }
  if (reserva.estado === "completada" || reserva.estado === "cancelada") throw business("Esa reserva ya no se puede cancelar");
  const experiencia = db.prepare(`SELECT id FROM experiencias WHERE reserva_id = ? AND estado != 'cancelada'`).get(id);
  if (experiencia) throw business("Esta reserva pertenece a una experiencia. Cancela la experiencia.");
  db.prepare(`UPDATE reservas SET estado = 'cancelada' WHERE id = ?`).run(id);
  res.json({ ok: true });
}));

app.get("/api/clientes", requireRole("admin", "empleado"), wrap((req, res) => {
  const clientes = db.prepare(`
    SELECT c.*, u.nombre, u.email, u.telefono
    FROM clientes c JOIN usuarios u ON u.id = c.usuario_id
    WHERE u.activo = 1 ORDER BY u.nombre
  `).all();
  res.json({ clientes: clientes.map((cliente) => publicCliente(cliente, true)) });
}));

app.get("/api/empleados", requireRole("admin", "empleado"), wrap((req, res) => {
  const empleados = db.prepare(`
    SELECT e.*, u.nombre, u.email, u.telefono
    FROM empleados e JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.activo = 1 AND u.activo = 1 ORDER BY u.nombre
  `).all();
  const admin = req.session.user.rol === "admin";
  res.json({
    empleados: empleados.map((empleado) => ({
      id: empleado.id,
      nombre: empleado.nombre,
      email: empleado.email,
      telefono: empleado.telefono,
      cargo: empleado.cargo,
      fecha_ingreso: empleado.fecha_ingreso,
      salario: admin ? empleado.salario : undefined,
    })),
  });
}));

app.get("/api/turnos", requireRole("admin", "empleado"), wrap((req, res) => {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || "") ? req.query.fecha : dateISO(new Date());
  const turnos = db.prepare(`
    SELECT t.*, u.nombre, e.cargo
    FROM turnos t
    JOIN empleados e ON e.id = t.empleado_id
    JOIN usuarios u ON u.id = e.usuario_id
    WHERE t.fecha = ? ORDER BY t.hora_inicio
  `).all(fecha);
  res.json({ fecha, turnos });
}));

app.post("/api/turnos", requireRole("admin"), wrap((req, res) => {
  const empleadoId = whole(req.body.empleado_id);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha || "") ? req.body.fecha : null;
  const horaInicio = /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.hora_inicio || "") ? req.body.hora_inicio : null;
  const horaFin = /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.hora_fin || "") ? req.body.hora_fin : null;
  const area = text(req.body.area, 40);
  if (!empleadoId || !fecha || !horaInicio || !horaFin || !area) throw business("Completa el turno");
  if (horaInicio >= horaFin) throw business("La hora de fin debe ser posterior a la de inicio");
  const empleado = db.prepare(`
    SELECT e.id FROM empleados e JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.id = ? AND e.activo = 1 AND u.activo = 1
  `).get(empleadoId);
  if (!empleado) throw business("Empleado no encontrado", 404);
  const cruce = db.prepare(`
    SELECT id FROM turnos WHERE empleado_id = ? AND fecha = ? AND hora_inicio < ? AND hora_fin > ?
  `).get(empleadoId, fecha, horaFin, horaInicio);
  if (cruce) throw business("Esa persona ya tiene un turno cruzado ese día");
  const id = db.prepare(
    `INSERT INTO turnos (empleado_id, fecha, hora_inicio, hora_fin, area) VALUES (?, ?, ?, ?, ?)`
  ).run(empleadoId, fecha, horaInicio, horaFin, area).lastInsertRowid;
  res.status(201).json({ id });
}));

app.get("/api/productos", requireAuth, wrap((req, res) => {
  const staff = req.session.user.rol !== "cliente";
  const productos = db.prepare(`SELECT * FROM productos WHERE activo = 1 ORDER BY categoria, nombre`).all();
  const recetas = db.prepare(`
    SELECT r.producto_id, r.cantidad, i.nombre, i.costo_unitario, i.unidad
    FROM recetas r JOIN insumos i ON i.id = r.insumo_id
  `).all();
  res.json({
    productos: productos.map((producto) => {
      const lines = recetas.filter((line) => line.producto_id === producto.id);
      const costo = Math.round(lines.reduce((sum, line) => sum + line.cantidad * line.costo_unitario, 0));
      return {
        id: producto.id,
        nombre: producto.nombre,
        categoria: producto.categoria,
        precio: producto.precio,
        descripcion: producto.descripcion,
        es_alcohol: Boolean(producto.es_alcohol),
        costo: staff ? costo : undefined,
      };
    }),
  });
}));

app.get("/api/insumos", requireRole("admin", "empleado"), wrap((req, res) => {
  const insumos = db.prepare(`
    SELECT i.*, p.nombre AS proveedor
    FROM insumos i LEFT JOIN proveedores p ON p.id = i.proveedor_id
    ORDER BY i.nombre
  `).all();
  res.json({ insumos });
}));

app.get("/api/movimientos", requireRole("admin", "empleado"), wrap((req, res) => {
  const movimientos = db.prepare(`
    SELECT m.*, i.nombre AS insumo, i.unidad
    FROM movimientos_inventario m JOIN insumos i ON i.id = m.insumo_id
    ORDER BY m.fecha DESC, m.id DESC LIMIT 40
  `).all();
  res.json({ movimientos });
}));

app.post("/api/movimientos", requireRole("admin", "empleado"), wrap((req, res) => {
  const insumoId = whole(req.body.insumo_id);
  const tipo = ["entrada", "salida", "merma"].includes(req.body.tipo) ? req.body.tipo : null;
  const cantidad = Number(req.body.cantidad);
  const motivo = text(req.body.motivo, 160);
  if (!insumoId || !tipo || !motivo) throw business("Completa el movimiento");
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1000000) throw business("La cantidad no es válida");
  const tx = db.transaction(() => {
    const insumo = db.prepare(`SELECT * FROM insumos WHERE id = ?`).get(insumoId);
    if (!insumo) throw business("Insumo no encontrado", 404);
    if (tipo !== "entrada" && insumo.stock + 1e-6 < cantidad) {
      throw business(`Stock insuficiente de ${insumo.nombre}`);
    }
    const delta = tipo === "entrada" ? cantidad : -cantidad;
    db.prepare(`UPDATE insumos SET stock = stock + ? WHERE id = ?`).run(delta, insumoId);
    db.prepare(
      `INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, fecha, referencia) VALUES (?, ?, ?, ?, ?, 'Manual')`
    ).run(insumoId, tipo, cantidad, motivo, stamp());
  });
  tx();
  res.status(201).json({ ok: true });
}));

app.get("/api/ventas", requireRole("admin", "empleado"), wrap((req, res) => {
  const ventas = db.prepare(`
    SELECT v.*, u.nombre AS cliente, eu.nombre AS empleado
    FROM ventas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    LEFT JOIN empleados e ON e.id = v.empleado_id
    LEFT JOIN usuarios eu ON eu.id = e.usuario_id
    ORDER BY v.fecha DESC, v.id DESC LIMIT 12
  `).all();
  const items = db.prepare(`
    SELECT vi.venta_id, vi.cantidad, p.nombre
    FROM venta_items vi JOIN productos p ON p.id = vi.producto_id
    WHERE vi.venta_id IN (SELECT id FROM ventas ORDER BY fecha DESC, id DESC LIMIT 12)
  `).all();
  res.json({
    ventas: ventas.map((venta) => ({
      ...venta,
      items: items.filter((item) => item.venta_id === venta.id),
    })),
  });
}));

app.post("/api/ventas", requireAuth, wrap((req, res) => {
  const user = req.session.user;
  if (user.rol === "cliente" && user.cliente_id == null) throw business("La cuenta no tiene un perfil de cliente");
  const metodo = ["efectivo", "tarjeta", "transferencia"].includes(req.body.metodo_pago) ? req.body.metodo_pago : null;
  if (!metodo) throw business("Selecciona el medio de pago");
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!rawItems.length || rawItems.length > 30) throw business("El pedido está vacío");
  let clienteId = user.rol === "cliente" ? user.cliente_id : whole(req.body.cliente_id);
  if (clienteId) {
    const cliente = db.prepare(`SELECT c.id FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ? AND u.activo = 1`).get(clienteId);
    if (!cliente) throw business("Cliente no encontrado", 404);
  } else clienteId = null;
  const empleadoId = user.rol === "cliente" ? null : user.empleado_id;
  const tx = db.transaction(() => {
    const lines = [];
    let total = 0;
    let alcohol = false;
    for (const raw of rawItems) {
      const productoId = whole(raw.producto_id);
      const cantidad = whole(raw.cantidad);
      if (!productoId || !cantidad || cantidad < 1 || cantidad > 40) throw business("Hay un producto con cantidad no válida");
      const producto = db.prepare(`SELECT * FROM productos WHERE id = ? AND activo = 1`).get(productoId);
      if (!producto) throw business("Hay un producto que ya no está disponible");
      lines.push({ producto_id: producto.id, cantidad, precio: producto.precio });
      total += producto.precio * cantidad;
      if (producto.es_alcohol) alcohol = true;
    }
    if (alcohol && req.body.mayor_edad !== true) {
      throw business("La venta incluye alcohol. Confirma que el cliente es mayor de 18 años.");
    }
    const ventaId = db.prepare(
      `INSERT INTO ventas (cliente_id, empleado_id, fecha, metodo_pago, total) VALUES (?, ?, ?, ?, ?)`
    ).run(clienteId, empleadoId, stamp(), metodo, total).lastInsertRowid;
    const addItem = db.prepare(`INSERT INTO venta_items (venta_id, producto_id, cantidad, precio) VALUES (?, ?, ?, ?)`);
    for (const line of lines) addItem.run(ventaId, line.producto_id, line.cantidad, line.precio);
    consumeProducts(lines, { motivo: "Venta de mostrador", fecha: stamp(), referencia: `Venta ${ventaId}` });
    return { id: ventaId, total };
  });
  res.status(201).json(tx());
}));

app.get("/api/experiencias", requireAuth, wrap((req, res) => {
  res.json({ experiencias: loadExperiencias() });
}));

app.post("/api/experiencias", requireRole("admin", "empleado"), wrap((req, res) => {
  const nombre = text(req.body.nombre, 80);
  const descripcion = text(req.body.descripcion, 400);
  const espacioId = whole(req.body.espacio_id);
  const capacidad = whole(req.body.capacidad);
  const precio = money(req.body.precio);
  const inicio = normalizeInput(req.body.inicio);
  const fin = normalizeInput(req.body.fin);
  const empleados = [...new Set((Array.isArray(req.body.empleados) ? req.body.empleados : []).map(whole).filter(Boolean))];
  const equipos = [...new Set((Array.isArray(req.body.equipos) ? req.body.equipos : []).map(whole).filter(Boolean))];
  const productos = (Array.isArray(req.body.productos) ? req.body.productos : [])
    .map((item) => ({ producto_id: whole(item.producto_id), cantidad: whole(item.cantidad) }))
    .filter((item) => item.producto_id && item.cantidad > 0);
  if (nombre.length < 3 || !espacioId || !capacidad || precio === null) throw business("Completa los datos de la experiencia");
  validarHorario(inicio, fin);
  const tx = db.transaction(() => {
    const espacio = db.prepare(`SELECT * FROM espacios WHERE id = ?`).get(espacioId);
    if (!espacio) throw business("Espacio no encontrado", 404);
    if (espacio.estado === "mantenimiento") throw business("Ese espacio está en mantenimiento");
    if (capacidad < 1 || capacidad > espacio.capacidad) {
      throw business(`La capacidad supera la del espacio (${espacio.capacidad})`);
    }
    if (reservaCruzada(espacio.id, inicio, fin)) throw business("Ese espacio ya está reservado en ese horario");
    for (const empleadoId of empleados) {
      const empleado = db.prepare(`
        SELECT e.id FROM empleados e JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.id = ? AND e.activo = 1 AND u.activo = 1
      `).get(empleadoId);
      if (!empleado) throw business("Hay un empleado que no está activo");
      const cruce = db.prepare(`
        SELECT e.nombre FROM experiencia_empleados ee
        JOIN experiencias e ON e.id = ee.experiencia_id
        WHERE ee.empleado_id = ? AND e.estado != 'cancelada' AND e.inicio < ? AND e.fin > ?
      `).get(empleadoId, fin, inicio);
      if (cruce) throw business(`Esa persona ya está asignada a «${cruce.nombre}» en ese horario`);
    }
    for (const equipoId of equipos) {
      const equipo = db.prepare(`SELECT * FROM equipos WHERE id = ?`).get(equipoId);
      if (!equipo) throw business("Hay un equipo que no existe");
      if (equipo.estado !== "operativo") throw business(`${equipo.nombre} no está operativo`);
      const cruce = db.prepare(`
        SELECT e.nombre FROM experiencia_equipos ee
        JOIN experiencias e ON e.id = ee.experiencia_id
        WHERE ee.equipo_id = ? AND e.estado != 'cancelada' AND e.inicio < ? AND e.fin > ?
      `).get(equipoId, fin, inicio);
      if (cruce) throw business(`${equipo.nombre} ya está comprometido en «${cruce.nombre}»`);
    }
    for (const item of productos) {
      const producto = db.prepare(`SELECT id FROM productos WHERE id = ? AND activo = 1`).get(item.producto_id);
      if (!producto) throw business("Hay un producto que no está disponible");
    }
    const estado = inicio <= stamp() && fin > stamp() ? "en_curso" : "programada";
    const reservaId = db.prepare(`
      INSERT INTO reservas (espacio_id, cliente_id, inicio, fin, proposito, estado, monto, notas)
      VALUES (?, NULL, ?, ?, 'evento', ?, 0, ?)
    `).run(espacio.id, inicio, fin, estado === "en_curso" ? "en_curso" : "confirmada", `Experiencia: ${nombre}`).lastInsertRowid;
    const experienciaId = db.prepare(`
      INSERT INTO experiencias (nombre, descripcion, espacio_id, reserva_id, inicio, fin, capacidad, precio, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, descripcion || null, espacio.id, reservaId, inicio, fin, capacidad, precio, estado).lastInsertRowid;
    const addEmpleado = db.prepare(`INSERT INTO experiencia_empleados (experiencia_id, empleado_id) VALUES (?, ?)`);
    const addEquipo = db.prepare(`INSERT INTO experiencia_equipos (experiencia_id, equipo_id) VALUES (?, ?)`);
    const addProducto = db.prepare(`INSERT INTO experiencia_productos (experiencia_id, producto_id, cantidad) VALUES (?, ?, ?)`);
    for (const empleadoId of empleados) addEmpleado.run(experienciaId, empleadoId);
    for (const equipoId of equipos) addEquipo.run(experienciaId, equipoId);
    for (const item of productos) addProducto.run(experienciaId, item.producto_id, item.cantidad);
    return experienciaId;
  });
  res.status(201).json({ id: tx() });
}));

app.post("/api/experiencias/:id/participantes", requireAuth, wrap((req, res) => {
  const id = whole(req.params.id);
  let clienteId = whole(req.body.cliente_id);
  if (req.session.user.rol === "cliente") clienteId = req.session.user.cliente_id;
  if (!id || !clienteId) throw business("Selecciona el participante");
  const tx = db.transaction(() => {
    const experiencia = db.prepare(`SELECT * FROM experiencias WHERE id = ?`).get(id);
    if (!experiencia || experiencia.estado === "cancelada" || experiencia.estado === "finalizada") {
      throw business("Esa experiencia no admite más cupos");
    }
    const cliente = db.prepare(`SELECT id FROM clientes WHERE id = ?`).get(clienteId);
    if (!cliente) throw business("Cliente no encontrado", 404);
    const ya = db.prepare(`SELECT 1 AS ok FROM experiencia_participantes WHERE experiencia_id = ? AND cliente_id = ?`).get(id, clienteId);
    if (ya) throw business("Esa persona ya tiene cupo");
    const count = db.prepare(`SELECT COUNT(*) AS n FROM experiencia_participantes WHERE experiencia_id = ?`).get(id).n;
    if (count >= experiencia.capacidad) throw business("La experiencia ya está llena");
    db.prepare(`INSERT INTO experiencia_participantes (experiencia_id, cliente_id) VALUES (?, ?)`).run(id, clienteId);
  });
  tx();
  res.status(201).json({ ok: true });
}));

app.delete("/api/experiencias/:id/participantes/:clienteId", requireAuth, wrap((req, res) => {
  const id = whole(req.params.id);
  const clienteId = whole(req.params.clienteId);
  if (req.session.user.rol === "cliente" && req.session.user.cliente_id !== clienteId) {
    throw business("No tienes permiso para esta acción", 403);
  }
  const result = db.prepare(`DELETE FROM experiencia_participantes WHERE experiencia_id = ? AND cliente_id = ?`).run(id, clienteId);
  if (!result.changes) throw business("El cupo no existe", 404);
  res.json({ ok: true });
}));

app.post("/api/experiencias/:id/cerrar", requireRole("admin", "empleado"), wrap((req, res) => {
  const id = whole(req.params.id);
  const tx = db.transaction(() => {
    const experiencia = db.prepare(`SELECT * FROM experiencias WHERE id = ?`).get(id);
    if (!experiencia) throw business("Experiencia no encontrada", 404);
    if (experiencia.estado === "cancelada" || experiencia.estado === "finalizada") {
      throw business("Esa experiencia ya está cerrada");
    }
    const productos = db.prepare(`SELECT producto_id, cantidad FROM experiencia_productos WHERE experiencia_id = ?`).all(id);
    consumeProducts(productos, {
      motivo: `Consumo de ${experiencia.nombre}`,
      fecha: stamp(),
      referencia: `Experiencia ${id}`,
    });
    db.prepare(`UPDATE experiencias SET estado = 'finalizada' WHERE id = ?`).run(id);
    if (experiencia.reserva_id) db.prepare(`UPDATE reservas SET estado = 'completada' WHERE id = ?`).run(experiencia.reserva_id);
  });
  tx();
  res.json({ ok: true });
}));

app.post("/api/experiencias/:id/cancelar", requireRole("admin", "empleado"), wrap((req, res) => {
  const id = whole(req.params.id);
  const tx = db.transaction(() => {
    const experiencia = db.prepare(`SELECT * FROM experiencias WHERE id = ?`).get(id);
    if (!experiencia) throw business("Experiencia no encontrada", 404);
    if (experiencia.estado === "finalizada") throw business("Una experiencia cerrada no se cancela");
    db.prepare(`UPDATE experiencias SET estado = 'cancelada' WHERE id = ?`).run(id);
    if (experiencia.reserva_id) db.prepare(`UPDATE reservas SET estado = 'cancelada' WHERE id = ?`).run(experiencia.reserva_id);
  });
  tx();
  res.json({ ok: true });
}));

app.get("/api/equipos", requireRole("admin", "empleado"), wrap((req, res) => {
  const equipos = db.prepare(`
    SELECT q.*, e.nombre AS espacio
    FROM equipos q LEFT JOIN espacios e ON e.id = q.espacio_id
    ORDER BY q.tipo, q.nombre
  `).all();
  res.json({ equipos });
}));

app.post("/api/equipos", requireRole("admin"), wrap((req, res) => {
  const nombre = text(req.body.nombre, 80);
  const tipo = ["tecnologico", "mobiliario", "produccion", "administracion"].includes(req.body.tipo) ? req.body.tipo : null;
  const estado = ["operativo", "mantenimiento", "prestado"].includes(req.body.estado) ? req.body.estado : "operativo";
  const costo = money(req.body.costo);
  const espacioId = req.body.espacio_id ? whole(req.body.espacio_id) : null;
  if (nombre.length < 2 || !tipo || costo === null) throw business("Completa el equipo");
  if (espacioId && !db.prepare(`SELECT id FROM espacios WHERE id = ?`).get(espacioId)) throw business("Espacio no encontrado", 404);
  const id = db.prepare(
    `INSERT INTO equipos (nombre, tipo, estado, espacio_id, costo) VALUES (?, ?, ?, ?, ?)`
  ).run(nombre, tipo, estado, espacioId, costo).lastInsertRowid;
  res.status(201).json({ id });
}));

app.patch("/api/equipos/:id", requireRole("admin", "empleado"), wrap((req, res) => {
  const id = whole(req.params.id);
  const estado = ["operativo", "mantenimiento", "prestado"].includes(req.body.estado) ? req.body.estado : null;
  if (!id || !estado) throw business("Estado de equipo no válido");
  const result = db.prepare(`UPDATE equipos SET estado = ? WHERE id = ?`).run(estado, id);
  if (!result.changes) throw business("Equipo no encontrado", 404);
  res.json({ ok: true });
}));

app.get("/api/costos", requireRole("admin"), wrap((req, res) => {
  const periodo = monthBounds().periodo;
  res.json({ periodo, costos: db.prepare(`SELECT * FROM costos WHERE periodo = ? ORDER BY categoria, concepto`).all(periodo) });
}));

app.post("/api/costos", requireRole("admin"), wrap((req, res) => {
  const concepto = text(req.body.concepto, 80);
  const categoria = text(req.body.categoria, 40) || "servicios";
  const monto = money(req.body.monto);
  const vencimiento = /^\d{4}-\d{2}-\d{2}$/.test(req.body.vencimiento || "") ? req.body.vencimiento : null;
  const estado = req.body.estado === "pagado" ? "pagado" : "pendiente";
  if (concepto.length < 3 || !monto) throw business("Completa el costo");
  const id = db.prepare(
    `INSERT INTO costos (concepto, categoria, monto, periodo, vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(concepto, categoria, monto, monthBounds().periodo, vencimiento, estado).lastInsertRowid;
  res.status(201).json({ id });
}));

app.patch("/api/costos/:id", requireRole("admin"), wrap((req, res) => {
  const id = whole(req.params.id);
  const estado = req.body.estado === "pagado" || req.body.estado === "pendiente" ? req.body.estado : null;
  if (!id || !estado) throw business("Estado de costo no válido");
  const result = db.prepare(`UPDATE costos SET estado = ? WHERE id = ?`).run(estado, id);
  if (!result.changes) throw business("Costo no encontrado", 404);
  res.json({ ok: true });
}));

app.get("/api/permisos", requireRole("admin"), wrap((req, res) => {
  res.json({ permisos: db.prepare(`SELECT * FROM permisos ORDER BY vencimiento`).all() });
}));

app.post("/api/permisos", requireRole("admin"), wrap((req, res) => {
  const nombre = text(req.body.nombre, 80);
  const entidad = text(req.body.entidad, 80);
  const numero = text(req.body.numero, 40);
  const vencimiento = /^\d{4}-\d{2}-\d{2}$/.test(req.body.vencimiento || "") ? req.body.vencimiento : null;
  if (nombre.length < 3 || entidad.length < 2 || !vencimiento) throw business("Completa el permiso");
  const estado = vencimiento < dateISO(new Date()) ? "vencido" : "vigente";
  const id = db.prepare(
    `INSERT INTO permisos (nombre, entidad, numero, vencimiento, estado) VALUES (?, ?, ?, ?, ?)`
  ).run(nombre, entidad, numero || null, vencimiento, estado).lastInsertRowid;
  res.status(201).json({ id });
}));

app.get("/api/proveedores", requireRole("admin", "empleado"), wrap((req, res) => {
  res.json({ proveedores: db.prepare(`SELECT * FROM proveedores ORDER BY nombre`).all() });
}));

app.get("/api/reportes", requireRole("admin"), wrap((req, res) => {
  let bounds;
  try {
    bounds = resolvePeriod({
      rango: req.query.rango,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
  } catch (error) {
    throw error.status ? error : business(error.message);
  }
  const horasJornada = 16;
  const ventas = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM ventas WHERE fecha >= ? AND fecha < ?`).get(bounds.start, bounds.end).total;
  const reservas = db.prepare(`
    SELECT monto, estado, inicio FROM reservas
    WHERE proposito != 'evento' AND estado != 'cancelada' AND inicio < ? AND fin > ?
  `).all(bounds.end, bounds.start);
  const reservasRealizadas = reservas.filter((item) => item.estado === "completada" || item.estado === "en_curso").reduce((sum, item) => sum + item.monto, 0);
  const reservasPrevistas = reservas.filter((item) => item.estado === "confirmada").reduce((sum, item) => sum + item.monto, 0);
  const experiencias = loadExperiencias().filter((item) => item.estado !== "cancelada" && item.inicio < bounds.end && item.fin > bounds.start);
  const experienciasRealizadas = experiencias.filter((item) => item.estado === "finalizada" || item.estado === "en_curso").reduce((sum, item) => sum + item.ingresos, 0);
  const experienciasPrevistas = experiencias.filter((item) => item.estado === "programada").reduce((sum, item) => sum + item.ingresos, 0);
  const items = db.prepare(`
    SELECT vi.producto_id, vi.cantidad, vi.precio, p.nombre, v.fecha
    FROM venta_items vi
    JOIN ventas v ON v.id = vi.venta_id
    JOIN productos p ON p.id = vi.producto_id
    WHERE v.fecha >= ? AND v.fecha < ?
  `).all(bounds.start, bounds.end);
  const costoInsumos = costoProductos(items);
  const topMap = new Map();
  for (const item of items) {
    const current = topMap.get(item.producto_id) || { nombre: item.nombre, cantidad: 0, ingresos: 0 };
    current.cantidad += item.cantidad;
    current.ingresos += item.cantidad * item.precio;
    topMap.set(item.producto_id, current);
  }
  const topProductos = [...topMap.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, 6);
  const meses = [...new Set(eachDay(bounds.start, bounds.end).map((dia) => dia.slice(0, 7)))];
  const costos = db.prepare(
    `SELECT * FROM costos WHERE periodo IN (${meses.map(() => "?").join(",")}) ORDER BY categoria, concepto`
  ).all(...meses);
  const costosFijos = Math.round(costos.reduce((sum, item) => sum + prorateAmount(item.monto, item.periodo, bounds.start, bounds.end), 0));
  const costoExperiencias = experiencias
    .filter((item) => item.estado === "finalizada" || item.estado === "en_curso")
    .reduce((sum, item) => sum + item.costo_productos, 0);
  const ingresosTotal = ventas + reservasRealizadas + experienciasRealizadas;
  const egresosTotal = costosFijos + costoInsumos + costoExperiencias;
  const espacios = db.prepare(`SELECT * FROM espacios`).all();
  const reservasMes = db.prepare(`
    SELECT espacio_id, inicio, fin FROM reservas
    WHERE estado != 'cancelada' AND inicio < ? AND fin > ?
  `).all(bounds.end, bounds.start);
  const utilizacion = espacios.map((espacio) => {
    const horas = reservasMes
      .filter((reserva) => reserva.espacio_id === espacio.id)
      .reduce((sum, reserva) => sum + clippedHours(reserva.inicio, reserva.fin, bounds.start, bounds.end), 0);
    const capacidad = bounds.days * horasJornada;
    return {
      nombre: espacio.nombre,
      tipo: espacio.tipo,
      horas: Math.round(horas * 10) / 10,
      porcentaje: capacidad ? Math.round((horas / capacidad) * 1000) / 10 : 0,
    };
  });
  const rentables = utilizacion.filter((item) => item.tipo === "puesto" || item.tipo === "sala");
  const ocupacionPromedio = rentables.length
    ? Math.round((rentables.reduce((sum, item) => sum + item.porcentaje, 0) / rentables.length) * 10) / 10
    : 0;
  const demanda = Array.from({ length: 16 }, (_, index) => ({ hora: 7 + index, reservas: 0, ventas: 0 }));
  const reservasHora = db.prepare(`
    SELECT inicio FROM reservas WHERE estado != 'cancelada' AND inicio >= ? AND inicio < ?
  `).all(bounds.start, bounds.end);
  for (const reserva of reservasHora) {
    const hora = Number(reserva.inicio.slice(11, 13));
    const bucket = demanda.find((item) => item.hora === hora);
    if (bucket) bucket.reservas += 1;
  }
  const ventasHora = db.prepare(`SELECT fecha FROM ventas WHERE fecha >= ? AND fecha < ?`).all(bounds.start, bounds.end);
  for (const venta of ventasHora) {
    const hora = Number(venta.fecha.slice(11, 13));
    const bucket = demanda.find((item) => item.hora === hora);
    if (bucket) bucket.ventas += 1;
  }

  const recetaCosto = new Map();
  for (const line of db.prepare(`
    SELECT r.producto_id, r.cantidad, i.costo_unitario
    FROM recetas r JOIN insumos i ON i.id = r.insumo_id
  `).all()) {
    recetaCosto.set(line.producto_id, (recetaCosto.get(line.producto_id) || 0) + line.cantidad * line.costo_unitario);
  }
  const ventasPorDia = new Map();
  const insumosPorDia = new Map();
  for (const item of items) {
    const dia = item.fecha.slice(0, 10);
    ventasPorDia.set(dia, (ventasPorDia.get(dia) || 0) + item.precio * item.cantidad);
    insumosPorDia.set(dia, (insumosPorDia.get(dia) || 0) + Math.round((recetaCosto.get(item.producto_id) || 0) * item.cantidad));
  }
  const reservasPorDia = new Map();
  for (const reserva of reservas.filter((item) => item.estado === "completada" || item.estado === "en_curso")) {
    const dia = reserva.inicio.slice(0, 10);
    if (dia >= bounds.start.slice(0, 10) && dia < bounds.end.slice(0, 10)) {
      reservasPorDia.set(dia, (reservasPorDia.get(dia) || 0) + reserva.monto);
    }
  }
  const fijoPorDia = bounds.days ? Math.round(costosFijos / bounds.days) : 0;
  const flujo = eachDay(bounds.start, bounds.end).map((dia) => {
    const ingresos = (ventasPorDia.get(dia) || 0) + (reservasPorDia.get(dia) || 0);
    const egresos = (insumosPorDia.get(dia) || 0) + fijoPorDia;
    return { dia, ingresos, egresos };
  });

  res.json({
    rango: bounds.key,
    periodo: bounds.label,
    desde: bounds.start.slice(0, 10),
    hasta: dateISO(addDays(parseISODate(bounds.end.slice(0, 10)), -1)),
    ingresos: {
      ventas,
      reservasRealizadas,
      reservasPrevistas,
      experienciasRealizadas,
      experienciasPrevistas,
      total: ingresosTotal,
    },
    egresos: {
      fijos: costosFijos,
      insumos: costoInsumos,
      experiencias: costoExperiencias,
      total: egresosTotal,
      detalle: costos.map((item) => ({
        ...item,
        prorrateado: Math.round(prorateAmount(item.monto, item.periodo, bounds.start, bounds.end)),
      })),
    },
    costos: { fijos: costosFijos, insumos: costoInsumos, experiencias: costoExperiencias, detalle: costos },
    margenRealizado: ingresosTotal - egresosTotal,
    ocupacionPromedio,
    utilizacion,
    demanda,
    flujo,
    topProductos,
    experiencias: experiencias.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      estado: item.estado,
      participantes: item.participantes.length,
      capacidad: item.capacidad,
      ingresos: item.ingresos,
      costo_productos: item.costo_productos,
      costo_espacio: item.costo_espacio,
      margen: item.ingresos - item.costo_productos - item.costo_espacio,
    })),
  });
}));

function clippedHours(inicio, fin, rangeStart, rangeEnd) {
  const start = Math.max(new Date(inicio.replace(" ", "T")).getTime(), new Date(rangeStart.replace(" ", "T")).getTime());
  const end = Math.min(new Date(fin.replace(" ", "T")).getTime(), new Date(rangeEnd.replace(" ", "T")).getTime());
  return Math.max(0, (end - start) / 36e5);
}

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? say(req, "Error interno del servidor", "Internal server error") : error.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Kairo listo en http://localhost:${port}`);
  console.log("Dirección  admin@kairo.local");
  console.log("Barista    barista@kairo.local");
  console.log("Cliente    valentina@kairo.local");
  console.log("Inactiva   inactivo@kairo.local");
  console.log("Clave      kairo123");
});
