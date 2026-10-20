const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { stamp, dateISO, addDays, dayStamp, hoursBetween, monthBounds, pad } = require("./time");
const { montoReserva, estadoPorHorario } = require("./domain");

const SCHEMA_VERSION = 1;
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "kairo.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'empleado', 'cliente')),
  telefono TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  cargo TEXT NOT NULL,
  salario INTEGER NOT NULL,
  fecha_ingreso TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  documento TEXT,
  membresia TEXT NOT NULL DEFAULT 'ninguna' CHECK (membresia IN ('ninguna', 'dia', 'mensual')),
  membresia_vence TEXT
);
CREATE TABLE IF NOT EXISTS espacios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('puesto', 'sala', 'mesa', 'evento')),
  capacidad INTEGER NOT NULL,
  tarifa_hora INTEGER NOT NULL,
  zona TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'mantenimiento'))
);
CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  cliente_id INTEGER REFERENCES clientes(id),
  inicio TEXT NOT NULL,
  fin TEXT NOT NULL,
  proposito TEXT NOT NULL CHECK (proposito IN ('trabajo', 'estudio', 'reunion', 'consumo', 'evento')),
  estado TEXT NOT NULL CHECK (estado IN ('confirmada', 'en_curso', 'completada', 'cancelada')),
  monto INTEGER NOT NULL DEFAULT 0,
  notas TEXT
);
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  categoria TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS insumos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  unidad TEXT NOT NULL,
  stock REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 0,
  costo_unitario INTEGER NOT NULL,
  proveedor_id INTEGER REFERENCES proveedores(id)
);
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('bebida', 'alimento', 'servicio')),
  precio INTEGER NOT NULL,
  descripcion TEXT,
  es_alcohol INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS recetas (
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  cantidad REAL NOT NULL,
  PRIMARY KEY (producto_id, insumo_id)
);
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  empleado_id INTEGER REFERENCES empleados(id),
  fecha TEXT NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia')),
  total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL,
  precio INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'merma')),
  cantidad REAL NOT NULL,
  motivo TEXT,
  fecha TEXT NOT NULL,
  referencia TEXT
);
CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('tecnologico', 'mobiliario', 'produccion', 'administracion')),
  estado TEXT NOT NULL DEFAULT 'operativo' CHECK (estado IN ('operativo', 'mantenimiento', 'prestado')),
  espacio_id INTEGER REFERENCES espacios(id),
  costo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS experiencias (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  reserva_id INTEGER REFERENCES reservas(id),
  inicio TEXT NOT NULL,
  fin TEXT NOT NULL,
  capacidad INTEGER NOT NULL,
  precio INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('programada', 'en_curso', 'finalizada', 'cancelada'))
);
CREATE TABLE IF NOT EXISTS experiencia_empleados (
  experiencia_id INTEGER NOT NULL REFERENCES experiencias(id),
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  PRIMARY KEY (experiencia_id, empleado_id)
);
CREATE TABLE IF NOT EXISTS experiencia_equipos (
  experiencia_id INTEGER NOT NULL REFERENCES experiencias(id),
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  PRIMARY KEY (experiencia_id, equipo_id)
);
CREATE TABLE IF NOT EXISTS experiencia_productos (
  experiencia_id INTEGER NOT NULL REFERENCES experiencias(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL,
  PRIMARY KEY (experiencia_id, producto_id)
);
CREATE TABLE IF NOT EXISTS experiencia_participantes (
  experiencia_id INTEGER NOT NULL REFERENCES experiencias(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  PRIMARY KEY (experiencia_id, cliente_id)
);
CREATE TABLE IF NOT EXISTS costos (
  id INTEGER PRIMARY KEY,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto INTEGER NOT NULL,
  periodo TEXT NOT NULL,
  vencimiento TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'pagado'))
);
CREATE TABLE IF NOT EXISTS permisos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  entidad TEXT NOT NULL,
  numero TEXT,
  vencimiento TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('vigente', 'vencido'))
);
CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  fecha TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  area TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recuperaciones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  codigo_hash TEXT NOT NULL,
  creado INTEGER NOT NULL,
  expira INTEGER NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  usado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reservas_espacio ON reservas (espacio_id, inicio, fin);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha);
CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario ON recuperaciones (usuario_id, usado);
`;

function mulberry32(seed) {
  let value = seed;
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(random, pairs) {
  let cursor = random();
  for (const pair of pairs) {
    cursor -= pair.weight;
    if (cursor <= 0) return pair;
  }
  return pairs[pairs.length - 1];
}

function nextWindow(startTime, endTime) {
  const now = stamp();
  let day = new Date();
  let inicio = dayStamp(day, startTime);
  let fin = dayStamp(day, endTime);
  if (fin <= now) {
    day = addDays(day, 1);
    inicio = dayStamp(day, startTime);
    fin = dayStamp(day, endTime);
  }
  return { inicio, fin };
}

function seed(db) {
  const random = mulberry32(20260929);
  const passwordHash = bcrypt.hashSync("kairo123", 8);
  const now = new Date();
  const hoy = dateISO(now);
  const ahora = stamp(now);
  const periodo = monthBounds(now).periodo;

  const addUser = db.prepare(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono) VALUES (?, ?, ?, ?, ?)`
  );
  const addEmpleado = db.prepare(
    `INSERT INTO empleados (usuario_id, cargo, salario, fecha_ingreso) VALUES (?, ?, ?, ?)`
  );
  const addCliente = db.prepare(
    `INSERT INTO clientes (usuario_id, documento, membresia, membresia_vence) VALUES (?, ?, ?, ?)`
  );

  const staff = [
    ["Helena Marín", "admin@kairo.local", "admin", "3004102201", "administrador", 4500000, "2024-01-15"],
    ["Camila Restrepo", "barista@kairo.local", "empleado", "3004102202", "barista", 1900000, "2024-06-01"],
    ["Julián Ortiz", "cocina@kairo.local", "empleado", "3004102203", "cocina", 1850000, "2024-08-12"],
    ["Sara Vélez", "sala@kairo.local", "empleado", "3004102204", "atencion", 1750000, "2025-02-03"],
    ["Andrés Cano", "aseo@kairo.local", "empleado", "3004102205", "aseo", 1550000, "2025-04-20"],
  ];
  const empleadoPorCargo = new Map();
  const empleadoPorNombre = new Map();
  for (const person of staff) {
    const userId = addUser.run(person[0], person[1], passwordHash, person[2], person[3]).lastInsertRowid;
    const empleadoId = addEmpleado.run(userId, person[4], person[5], person[6]).lastInsertRowid;
    empleadoPorCargo.set(person[4], empleadoId);
    empleadoPorNombre.set(person[0], empleadoId);
  }

  const venceMensual = dateISO(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  const venceDia = hoy;
  const venceDiaLargo = dateISO(addDays(now, 3));
  const clients = [
    ["Valentina Henao", "valentina@kairo.local", "3005103301", "1002003001", "mensual", venceMensual],
    ["Tomás Giraldo", "tomas@kairo.local", "3005103302", "1002003002", "mensual", venceMensual],
    ["Samuel Quintero", "samuel@kairo.local", "3005103303", "1002003003", "mensual", venceMensual],
    ["Felipe Castro", "felipe@kairo.local", "3005103304", "1002003004", "dia", venceDia],
    ["Lucía Cárdenas", "lucia@kairo.local", "3005103305", "1002003005", "dia", venceDiaLargo],
    ["Mateo Ríos", "mateo@kairo.local", "3005103306", "1002003006", "ninguna", null],
    ["Elena Vargas", "elena@kairo.local", "3005103307", "1002003007", "ninguna", null],
    ["Mariana López", "mariana@kairo.local", "3005103308", "1002003008", "ninguna", null],
    ["Pablo Mejía", "pablo@kairo.local", "3005103309", "1002003009", "ninguna", null],
    ["Renata Gil", "renata@kairo.local", "3005103310", "1002003010", "ninguna", null],
  ];
  const clientePorNombre = new Map();
  const pagadores = [];
  const miembros = [];
  for (const person of clients) {
    const userId = addUser.run(person[0], person[1], passwordHash, "cliente", person[2]).lastInsertRowid;
    const clienteId = addCliente.run(userId, person[3], person[4], person[5]).lastInsertRowid;
    const record = { id: clienteId, nombre: person[0], membresia: person[4], membresia_vence: person[5] };
    clientePorNombre.set(person[0], record);
    if (person[4] === "mensual") miembros.push(record);
    if (person[4] === "ninguna") pagadores.push(record);
  }

  const addEspacio = db.prepare(
    `INSERT INTO espacios (nombre, tipo, capacidad, tarifa_hora, zona) VALUES (?, ?, ?, ?, ?)`
  );
  const espacioPorNombre = new Map();
  const puestos = [];
  const espacios = [
    ["Puesto 01 · Ventana", "puesto", 1, 8000, "Planta 1"],
    ["Puesto 02 · Ventana", "puesto", 1, 8000, "Planta 1"],
    ["Puesto 03 · Ventana", "puesto", 1, 8000, "Planta 1"],
    ["Puesto 04 · Jardín", "puesto", 1, 7000, "Planta 1"],
    ["Puesto 05 · Jardín", "puesto", 1, 7000, "Planta 1"],
    ["Puesto 06 · Barra", "puesto", 1, 6000, "Planta 1"],
    ["Sala Roble", "sala", 6, 35000, "Planta 2"],
    ["Sala Ceiba", "sala", 10, 55000, "Planta 2"],
    ["Mesa 01", "mesa", 2, 0, "Café"],
    ["Mesa 02", "mesa", 4, 0, "Café"],
    ["Mesa 03", "mesa", 4, 0, "Café"],
    ["Mesa 04 · Sofá", "mesa", 4, 0, "Café"],
    ["Terraza", "evento", 40, 180000, "Exterior"],
  ];
  for (const espacio of espacios) {
    const id = addEspacio.run(...espacio).lastInsertRowid;
    const record = { id, nombre: espacio[0], tipo: espacio[1], tarifa_hora: espacio[3], capacidad: espacio[2] };
    espacioPorNombre.set(espacio[0], record);
    if (espacio[1] === "puesto") puestos.push(record);
  }

  const addProveedor = db.prepare(
    `INSERT INTO proveedores (nombre, contacto, telefono, categoria) VALUES (?, ?, ?, ?)`
  );
  const proveedorId = {
    cafe: addProveedor.run("Finca Alto Verde", "Compras de café", "6044441122", "Café").lastInsertRowid,
    pan: addProveedor.run("Panadería La Miga", "Pedidos de la mañana", "6045552211", "Panadería").lastInsertRowid,
    abarrotes: addProveedor.run("Distribuciones San Juan", "Lácteos y bebidas", "6043330099", "Abarrotes").lastInsertRowid,
    aseo: addProveedor.run("Limpieza Nova", "Insumos de aseo", "6042221188", "Aseo").lastInsertRowid,
  };

  const addInsumo = db.prepare(
    `INSERT INTO insumos (nombre, unidad, stock, stock_minimo, costo_unitario, proveedor_id) VALUES (?, ?, 0, ?, ?, ?)`
  );
  const insumos = [
    ["Café especial", "g", 1000, 80, proveedorId.cafe, 4200],
    ["Leche entera", "ml", 5000, 4, proveedorId.abarrotes, 18000],
    ["Leche de avena", "ml", 4000, 8, proveedorId.abarrotes, 1200],
    ["Agua", "ml", 2000, 1, proveedorId.abarrotes, 20000],
    ["Azúcar", "g", 500, 5, proveedorId.abarrotes, 3000],
    ["Hielo", "g", 2000, 1, proveedorId.abarrotes, 8000],
    ["Vaso 8 oz", "un", 50, 180, proveedorId.abarrotes, 180],
    ["Vaso 12 oz", "un", 40, 220, proveedorId.abarrotes, 90],
    ["Pan croissant", "un", 10, 2800, proveedorId.pan, 6],
    ["Pan baguette", "un", 8, 2200, proveedorId.pan, 14],
    ["Queso", "g", 500, 28, proveedorId.abarrotes, 1800],
    ["Jamón", "g", 400, 32, proveedorId.abarrotes, 900],
    ["Brownie", "un", 8, 3500, proveedorId.pan, 15],
    ["Pulpa de maracuyá", "ml", 1000, 12, proveedorId.abarrotes, 3500],
    ["Cerveza lata", "un", 24, 4500, proveedorId.abarrotes, 48],
    ["Detergente", "ml", 1000, 8, proveedorId.aseo, 4000],
    ["Papel higiénico", "un", 20, 450, proveedorId.aseo, 36],
  ];
  const insumoPorNombre = new Map();
  for (const item of insumos) {
    const id = addInsumo.run(item[0], item[1], item[2], item[3], item[4]).lastInsertRowid;
    insumoPorNombre.set(item[0], { id, unidad: item[1], final: item[5], costo: item[3] });
  }

  const addProducto = db.prepare(
    `INSERT INTO productos (nombre, categoria, precio, descripcion) VALUES (?, ?, ?, ?)`
  );
  const productos = [
    ["Americano", "bebida", 7000, "Espresso largo de origen Huila."],
    ["Latte", "bebida", 9000, "Espresso con leche entera texturizada."],
    ["Latte de avena", "bebida", 10000, "Espresso con leche de avena."],
    ["Cold brew", "bebida", 11000, "Extracción en frío, doce horas."],
    ["Jugo de maracuyá", "bebida", 10000, "Pulpa natural, sin azúcar añadida."],
    ["Cerveza artesanal", "bebida", 12000, "Lata 355 ml. Venta a mayores de 18 años."],
    ["Croissant", "alimento", 7500, "De mantequilla, horneado en la mañana."],
    ["Sándwich", "alimento", 22000, "Baguette, jamón y queso."],
    ["Brownie", "alimento", 8000, "Chocolate al 70%."],
    ["Día de cowork", "servicio", 32000, "Acceso a un puesto durante la jornada."],
    ["Membresía mensual", "servicio", 280000, "Puestos incluidos por 30 días."],
  ];
  const productoPorNombre = new Map();
  for (const item of productos) {
    const id = addProducto.run(...item).lastInsertRowid;
    productoPorNombre.set(item[0], { id, precio: item[2], categoria: item[1] });
  }
  db.prepare(`UPDATE productos SET es_alcohol = 1 WHERE nombre = 'Cerveza artesanal'`).run();

  const addReceta = db.prepare(`INSERT INTO recetas (producto_id, insumo_id, cantidad) VALUES (?, ?, ?)`);
  const recetas = [
    ["Americano", [["Café especial", 18], ["Vaso 8 oz", 1], ["Azúcar", 5]]],
    ["Latte", [["Café especial", 18], ["Leche entera", 160], ["Vaso 8 oz", 1]]],
    ["Latte de avena", [["Café especial", 18], ["Leche de avena", 160], ["Vaso 8 oz", 1]]],
    ["Cold brew", [["Café especial", 30], ["Agua", 180], ["Hielo", 80], ["Vaso 12 oz", 1]]],
    ["Jugo de maracuyá", [["Pulpa de maracuyá", 220], ["Vaso 12 oz", 1]]],
    ["Cerveza artesanal", [["Cerveza lata", 1]]],
    ["Croissant", [["Pan croissant", 1]]],
    ["Sándwich", [["Pan baguette", 1], ["Queso", 40], ["Jamón", 45]]],
    ["Brownie", [["Brownie", 1]]],
  ];
  const recetaPorProducto = new Map();
  for (const [nombre, items] of recetas) {
    const productoId = productoPorNombre.get(nombre).id;
    const lines = [];
    for (const [insumo, cantidad] of items) {
      const insumoId = insumoPorNombre.get(insumo).id;
      addReceta.run(productoId, insumoId, cantidad);
      lines.push({ insumoId, cantidad });
    }
    recetaPorProducto.set(productoId, lines);
  }

  const menu = [
    ["Americano", 0.24],
    ["Latte", 0.18],
    ["Latte de avena", 0.08],
    ["Cold brew", 0.08],
    ["Jugo de maracuyá", 0.07],
    ["Cerveza artesanal", 0.05],
    ["Croissant", 0.12],
    ["Sándwich", 0.1],
    ["Brownie", 0.08],
  ].map(([nombre, weight]) => ({ ...productoPorNombre.get(nombre), nombre, weight }));

  const metodos = [
    { nombre: "tarjeta", weight: 0.5 },
    { nombre: "efectivo", weight: 0.3 },
    { nombre: "transferencia", weight: 0.2 },
  ];
  const plan = [];
  const vendedores = [empleadoPorCargo.get("barista"), empleadoPorCargo.get("cocina"), empleadoPorCargo.get("atencion")];

  function pushSale(fecha, producto, cantidad, clienteId, empleadoId) {
    plan.push({
      fecha,
      clienteId,
      empleadoId,
      metodo: weighted(random, metodos).nombre,
      items: [{ id: producto.id, precio: producto.precio, cantidad }],
    });
  }

  for (let offset = -21; offset <= -1; offset += 1) {
    const date = addDays(now, offset);
    const dow = date.getDay();
    const count = dow === 0 ? 7 : 12 + Math.floor(random() * 5);
    for (let i = 0; i < count; i += 1) {
      const hour = 7 + Math.floor(random() * 13);
      const minute = [0, 15, 30, 45][Math.floor(random() * 4)];
      const producto = weighted(random, menu);
      const cantidad = random() > 0.82 ? 2 : 1;
      const cliente = random() > 0.45 ? pagadores[Math.floor(random() * pagadores.length)] : null;
      const empleadoId = vendedores[Math.floor(random() * vendedores.length)];
      pushSale(dayStamp(date, `${pad(hour)}:${pad(minute)}`), producto, cantidad, cliente ? cliente.id : null, empleadoId);
    }
  }

  const ventasHoy = ["07:20", "08:05", "08:40", "09:15", "10:10", "11:05", "11:40", "12:30", "13:15", "13:50", "14:10"];
  ventasHoy.forEach((time, index) => {
    const fecha = `${hoy} ${time}`;
    if (fecha >= ahora) return;
    const producto = menu[index % menu.length];
    const clienteId = index % 3 === 0 ? clientePorNombre.get("Valentina Henao").id : null;
    pushSale(fecha, producto, 1, clienteId, empleadoPorCargo.get("barista"));
  });

  const inicioMes = dayStamp(new Date(now.getFullYear(), now.getMonth(), 1), "08:10");
  if (inicioMes < ahora) {
    for (const miembro of miembros) {
      pushSale(inicioMes, productoPorNombre.get("Membresía mensual"), 1, miembro.id, empleadoPorCargo.get("administrador"));
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const date = addDays(now, -2 - i * 3);
    const fecha = dayStamp(date, "09:00");
    if (fecha >= ahora) continue;
    pushSale(fecha, productoPorNombre.get("Día de cowork"), 1, pagadores[i % pagadores.length].id, empleadoPorCargo.get("atencion"));
  }

  const consumo = new Map();
  for (const sale of plan) {
    for (const item of sale.items) {
      for (const line of recetaPorProducto.get(item.id) || []) {
        consumo.set(line.insumoId, (consumo.get(line.insumoId) || 0) + line.cantidad * item.cantidad);
      }
    }
  }
  const mermas = [["Café especial", 80, "Merma de molienda"]];
  for (const [nombre, cantidad] of mermas) {
    const insumo = insumoPorNombre.get(nombre);
    consumo.set(insumo.id, (consumo.get(insumo.id) || 0) + cantidad);
  }

  const entrada = db.prepare(
    `INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, fecha, referencia) VALUES (?, 'entrada', ?, 'Inventario inicial del mes', ?, 'Apertura')`
  );
  const setStock = db.prepare(`UPDATE insumos SET stock = ? WHERE id = ?`);
  const fechaInventario = dayStamp(addDays(now, -21), "06:30");
  for (const insumo of insumoPorNombre.values()) {
    const usado = consumo.get(insumo.id) || 0;
    const inicial = usado + insumo.final;
    setStock.run(inicial, insumo.id);
    entrada.run(insumo.id, inicial, fechaInventario);
  }

  const addVenta = db.prepare(
    `INSERT INTO ventas (cliente_id, empleado_id, fecha, metodo_pago, total) VALUES (?, ?, ?, ?, ?)`
  );
  const addItem = db.prepare(
    `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio) VALUES (?, ?, ?, ?)`
  );
  const salida = db.prepare(
    `INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, fecha, referencia) VALUES (?, 'salida', ?, 'Venta de mostrador', ?, ?)`
  );
  const descontar = db.prepare(`UPDATE insumos SET stock = stock - ? WHERE id = ?`);
  for (const sale of plan) {
    const total = sale.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const ventaId = addVenta.run(sale.clienteId, sale.empleadoId, sale.fecha, sale.metodo, total).lastInsertRowid;
    for (const item of sale.items) {
      addItem.run(ventaId, item.id, item.cantidad, item.precio);
      for (const line of recetaPorProducto.get(item.id) || []) {
        const cantidad = line.cantidad * item.cantidad;
        descontar.run(cantidad, line.insumoId);
        salida.run(line.insumoId, cantidad, sale.fecha, `Venta ${ventaId}`);
      }
    }
  }
  const merma = db.prepare(
    `INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, fecha, referencia) VALUES (?, 'merma', ?, ?, ?, 'Cocina')`
  );
  for (const [nombre, cantidad, motivo] of mermas) {
    const insumo = insumoPorNombre.get(nombre);
    descontar.run(cantidad, insumo.id);
    merma.run(insumo.id, cantidad, motivo, dayStamp(addDays(now, -1), "18:10"));
  }

  const addReserva = db.prepare(
    `INSERT INTO reservas (espacio_id, cliente_id, inicio, fin, proposito, estado, monto, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  function reservar({ espacio, cliente, inicio, fin, proposito, notas }) {
    const place = espacioPorNombre.get(espacio);
    const person = cliente ? clientePorNombre.get(cliente) : null;
    const monto = montoReserva({
      hours: hoursBetween(inicio, fin),
      tarifaHora: place.tarifa_hora,
      tipo: place.tipo,
      membresia: person ? person.membresia : "ninguna",
      membresiaVence: person ? person.membresia_vence : null,
      day: inicio.slice(0, 10),
      proposito,
    });
    return addReserva.run(
      place.id,
      person ? person.id : null,
      inicio,
      fin,
      proposito,
      estadoPorHorario(inicio, fin, ahora),
      monto,
      notas || null
    ).lastInsertRowid;
  }

  const slots = [
    ["08:00", "12:00"],
    ["08:00", "17:00"],
    ["09:00", "13:00"],
    ["13:00", "18:00"],
    ["10:00", "16:00"],
  ];
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = addDays(now, offset);
    const dow = date.getDay();
    const count = dow === 0 ? 2 : 5;
    for (let i = 0; i < count; i += 1) {
      const [desde, hasta] = slots[i];
      const pool = i === 1 ? miembros : pagadores;
      const cliente = pool[Math.abs(offset + i) % pool.length];
      reservar({
        espacio: puestos[i].nombre,
        cliente: cliente.nombre,
        inicio: dayStamp(date, desde),
        fin: dayStamp(date, hasta),
        proposito: "trabajo",
        notas: null,
      });
    }
    if (dow === 2 || dow === 4) {
      reservar({
        espacio: "Sala Roble",
        cliente: pagadores[Math.abs(offset) % pagadores.length].nombre,
        inicio: dayStamp(date, "10:00"),
        fin: dayStamp(date, "12:00"),
        proposito: "reunion",
        notas: "Reunión de equipo",
      });
    }
    if (dow === 5) {
      reservar({
        espacio: "Sala Ceiba",
        cliente: pagadores[Math.abs(offset) % pagadores.length].nombre,
        inicio: dayStamp(date, "15:00"),
        fin: dayStamp(date, "17:00"),
        proposito: "reunion",
        notas: null,
      });
    }
  }

  reservar({
    espacio: "Puesto 02 · Ventana",
    cliente: "Valentina Henao",
    inicio: `${hoy} 08:00`,
    fin: `${hoy} 17:00`,
    proposito: "trabajo",
    notas: "Cubierto por membresía mensual",
  });
  reservar({
    espacio: "Puesto 05 · Jardín",
    cliente: "Tomás Giraldo",
    inicio: `${hoy} 10:00`,
    fin: `${hoy} 16:00`,
    proposito: "estudio",
    notas: "Cubierto por membresía mensual",
  });
  reservar({
    espacio: "Puesto 01 · Ventana",
    cliente: "Mateo Ríos",
    inicio: `${hoy} 08:00`,
    fin: `${hoy} 12:00`,
    proposito: "trabajo",
    notas: null,
  });
  reservar({
    espacio: "Puesto 04 · Jardín",
    cliente: "Felipe Castro",
    inicio: `${hoy} 14:00`,
    fin: `${hoy} 18:00`,
    proposito: "trabajo",
    notas: "Día de cowork",
  });
  reservar({
    espacio: "Sala Ceiba",
    cliente: "Elena Vargas",
    inicio: `${hoy} 14:00`,
    fin: `${hoy} 16:00`,
    proposito: "reunion",
    notas: "Revisión de propuesta",
  });
  reservar({
    espacio: "Mesa 03",
    cliente: "Lucía Cárdenas",
    inicio: `${hoy} 14:00`,
    fin: `${hoy} 15:30`,
    proposito: "consumo",
    notas: null,
  });
  const manana = addDays(now, 1);
  reservar({
    espacio: "Puesto 03 · Ventana",
    cliente: "Mateo Ríos",
    inicio: dayStamp(manana, "09:00"),
    fin: dayStamp(manana, "12:00"),
    proposito: "trabajo",
    notas: null,
  });
  reservar({
    espacio: "Puesto 01 · Ventana",
    cliente: "Elena Vargas",
    inicio: dayStamp(manana, "08:00"),
    fin: dayStamp(manana, "11:00"),
    proposito: "estudio",
    notas: null,
  });

  const addEquipo = db.prepare(
    `INSERT INTO equipos (nombre, tipo, estado, espacio_id, costo) VALUES (?, ?, ?, ?, ?)`
  );
  const equipoPorNombre = new Map();
  const equipos = [
    ["Portátil de préstamo 1", "tecnologico", "prestado", null, 3200000],
    ["Portátil de préstamo 2", "tecnologico", "operativo", null, 3200000],
    ["Monitor 27 pulgadas", "tecnologico", "mantenimiento", null, 980000],
    ["Proyector", "tecnologico", "operativo", "Sala Ceiba", 2100000],
    ["Equipo de sonido", "tecnologico", "operativo", "Terraza", 4500000],
    ["Máquina de espresso", "produccion", "operativo", null, 12800000],
    ["Molino", "produccion", "operativo", null, 2400000],
    ["Nevera vertical", "produccion", "operativo", null, 3100000],
    ["Impresora", "administracion", "operativo", null, 750000],
    ["Sofá modular", "mobiliario", "operativo", "Mesa 04 · Sofá", 1800000],
  ];
  for (const item of equipos) {
    const espacioId = item[3] ? espacioPorNombre.get(item[3]).id : null;
    const id = addEquipo.run(item[0], item[1], item[2], espacioId, item[4]).lastInsertRowid;
    equipoPorNombre.set(item[0], id);
  }

  const vinilo = nextWindow("19:00", "22:00");
  const lectura = nextWindow("17:00", "19:00");
  if (lectura.inicio.slice(0, 10) === vinilo.inicio.slice(0, 10) && lectura.inicio < vinilo.fin && lectura.fin > vinilo.inicio) {
    const day = addDays(parseDay(lectura.inicio), 1);
    lectura.inicio = dayStamp(day, "17:00");
    lectura.fin = dayStamp(day, "19:00");
  }
  const reservaVinilo = reservar({
    espacio: "Terraza",
    cliente: null,
    inicio: vinilo.inicio,
    fin: vinilo.fin,
    proposito: "evento",
    notas: "Experiencia: Noche de vinilo",
  });
  const reservaLectura = reservar({
    espacio: "Sala Roble",
    cliente: null,
    inicio: lectura.inicio,
    fin: lectura.fin,
    proposito: "evento",
    notas: "Experiencia: Club de lectura",
  });

  const addExperiencia = db.prepare(
    `INSERT INTO experiencias (nombre, descripcion, espacio_id, reserva_id, inicio, fin, capacidad, precio, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const viniloId = addExperiencia.run(
    "Noche de vinilo",
    "Sesión en la terraza con música en vinilo, barra de cerveza y postres.",
    espacioPorNombre.get("Terraza").id,
    reservaVinilo,
    vinilo.inicio,
    vinilo.fin,
    40,
    25000,
    estadoPorHorario(vinilo.inicio, vinilo.fin, ahora) === "completada"
      ? "programada"
      : estadoPorHorario(vinilo.inicio, vinilo.fin, ahora) === "en_curso"
        ? "en_curso"
        : "programada"
  ).lastInsertRowid;
  const lecturaId = addExperiencia.run(
    "Club de lectura",
    "Encuentro en Sala Roble. Incluye un americano de cortesía al llegar.",
    espacioPorNombre.get("Sala Roble").id,
    reservaLectura,
    lectura.inicio,
    lectura.fin,
    6,
    15000,
    estadoPorHorario(lectura.inicio, lectura.fin, ahora) === "en_curso" ? "en_curso" : "programada"
  ).lastInsertRowid;

  const linkEmpleado = db.prepare(
    `INSERT INTO experiencia_empleados (experiencia_id, empleado_id) VALUES (?, ?)`
  );
  const linkEquipo = db.prepare(`INSERT INTO experiencia_equipos (experiencia_id, equipo_id) VALUES (?, ?)`);
  const linkProducto = db.prepare(
    `INSERT INTO experiencia_productos (experiencia_id, producto_id, cantidad) VALUES (?, ?, ?)`
  );
  const linkParticipante = db.prepare(
    `INSERT INTO experiencia_participantes (experiencia_id, cliente_id) VALUES (?, ?)`
  );
  linkEmpleado.run(viniloId, empleadoPorNombre.get("Camila Restrepo"));
  linkEmpleado.run(viniloId, empleadoPorNombre.get("Sara Vélez"));
  linkEquipo.run(viniloId, equipoPorNombre.get("Equipo de sonido"));
  linkProducto.run(viniloId, productoPorNombre.get("Cerveza artesanal").id, 24);
  linkProducto.run(viniloId, productoPorNombre.get("Brownie").id, 10);
  for (const nombre of ["Valentina Henao", "Tomás Giraldo", "Mateo Ríos", "Elena Vargas", "Mariana López", "Pablo Mejía", "Renata Gil", "Samuel Quintero"]) {
    linkParticipante.run(viniloId, clientePorNombre.get(nombre).id);
  }
  linkEmpleado.run(lecturaId, empleadoPorNombre.get("Sara Vélez"));
  linkEmpleado.run(lecturaId, empleadoPorNombre.get("Helena Marín"));
  linkEquipo.run(lecturaId, equipoPorNombre.get("Proyector"));
  linkProducto.run(lecturaId, productoPorNombre.get("Americano").id, 6);
  for (const nombre of ["Valentina Henao", "Lucía Cárdenas", "Felipe Castro", "Renata Gil"]) {
    linkParticipante.run(lecturaId, clientePorNombre.get(nombre).id);
  }

  const addCosto = db.prepare(
    `INSERT INTO costos (concepto, categoria, monto, periodo, vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const finMes = dateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const costos = [
    ["Arriendo local Laureles", "arriendo", 8500000, finMes, "pendiente"],
    ["Energía", "servicios", 920000, dateISO(addDays(now, 6)), "pagado"],
    ["Acueducto", "servicios", 310000, dateISO(addDays(now, 8)), "pagado"],
    ["Gas", "servicios", 180000, dateISO(addDays(now, 8)), "pendiente"],
    ["Internet", "servicios", 250000, dateISO(addDays(now, 4)), "pagado"],
    ["Aseo y residuos", "servicios", 400000, finMes, "pendiente"],
    ["Derechos de música", "obligaciones", 150000, dateISO(addDays(now, 12)), "pendiente"],
  ];
  for (const item of costos) addCosto.run(item[0], item[1], item[2], periodo, item[3], item[4]);

  const addPermiso = db.prepare(
    `INSERT INTO permisos (nombre, entidad, numero, vencimiento, estado) VALUES (?, ?, ?, ?, 'vigente')`
  );
  addPermiso.run("Uso de suelos", "Alcaldía de Medellín", "US-44120", dateISO(addDays(now, 400)));
  addPermiso.run("Concepto sanitario", "Secretaría de Salud", "CS-22811", dateISO(addDays(now, 220)));
  addPermiso.run("Concepto de bomberos", "DAGRD", "CB-10992", dateISO(addDays(now, 300)));
  addPermiso.run("Derechos de ejecución musical", "Sayco / Acinpro", "MU-7731", dateISO(addDays(now, 140)));
  addPermiso.run("Venta de bebidas alcohólicas", "Alcaldía de Medellín", "BA-1904", dateISO(addDays(now, 18)));

  const addTurno = db.prepare(
    `INSERT INTO turnos (empleado_id, fecha, hora_inicio, hora_fin, area) VALUES (?, ?, ?, ?, ?)`
  );
  const turnos = [
    ["Helena Marín", "08:00", "17:00", "Dirección"],
    ["Camila Restrepo", "14:00", "22:00", "Café"],
    ["Julián Ortiz", "08:00", "16:00", "Cocina"],
    ["Sara Vélez", "12:00", "22:00", "Sala"],
    ["Andrés Cano", "07:00", "15:00", "Aseo"],
  ];
  for (const offset of [0, 1]) {
    const fecha = dateISO(addDays(now, offset));
    for (const turno of turnos) {
      addTurno.run(empleadoPorNombre.get(turno[0]), fecha, turno[1], turno[2], turno[3]);
    }
  }

  const overlaps = db.prepare(`
    SELECT a.id AS a, b.id AS b, ea.nombre
    FROM reservas a
    JOIN reservas b ON a.espacio_id = b.espacio_id AND a.id < b.id
    JOIN espacios ea ON ea.id = a.espacio_id
    WHERE a.estado != 'cancelada' AND b.estado != 'cancelada'
      AND a.inicio < b.fin AND a.fin > b.inicio
  `).all();
  if (overlaps.length) {
    throw new Error(`El escenario inicial dejó reservas cruzadas: ${JSON.stringify(overlaps)}`);
  }
  const negativo = db.prepare(`SELECT nombre, stock FROM insumos WHERE stock < 0`).all();
  if (negativo.length) {
    throw new Error(`Stock negativo: ${JSON.stringify(negativo)}`);
  }
}

function parseDay(value) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function schemaVersion(db) {
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).get();
  if (!table) return null;
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema'`).get();
  return row ? Number(row.value) : null;
}

function removeDatabaseFiles() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(DB_PATH + suffix, { force: true });
  }
}

function openDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const version = schemaVersion(db);
  if (version !== null && version !== SCHEMA_VERSION) {
    db.close();
    removeDatabaseFiles();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  if (schemaVersion(db) !== SCHEMA_VERSION) {
    db.exec(SCHEMA);
    try {
      const tx = db.transaction(() => {
        seed(db);
        db.prepare(`INSERT INTO meta (key, value) VALUES ('schema', ?)`).run(String(SCHEMA_VERSION));
      });
      tx();
    } catch (error) {
      db.close();
      removeDatabaseFiles();
      throw error;
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS recuperaciones (
      id INTEGER PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      codigo_hash TEXT NOT NULL,
      creado INTEGER NOT NULL,
      expira INTEGER NOT NULL,
      intentos INTEGER NOT NULL DEFAULT 0,
      usado INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario ON recuperaciones (usuario_id, usado);
  `);
  const inactiveEmail = "inactivo@kairo.local";
  if (!db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(inactiveEmail)) {
    const hash = bcrypt.hashSync("kairo123", 8);
    const userId = db.prepare(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, activo) VALUES (?, ?, ?, 'cliente', ?, 0)`
    ).run("Inés Mora", inactiveEmail, hash, "3005103399").lastInsertRowid;
    db.prepare(`INSERT INTO clientes (usuario_id, documento, membresia) VALUES (?, ?, 'ninguna')`).run(userId, "1002003099");
  }
  return db;
}

module.exports = { openDatabase, DB_PATH };
