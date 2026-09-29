const state = {
  user: null,
  view: "dashboard",
  cache: {},
  toast: "",
  error: "",
  cart: {},
};

const money = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

const views = {
  admin: [
    ["dashboard", "Tablero"],
    ["espacios", "Espacios"],
    ["cafeteria", "Cafetería"],
    ["experiencias", "Experiencias"],
    ["personas", "Personas"],
    ["equipos", "Equipos"],
    ["operacion", "Operación"],
    ["reportes", "Reportes"],
  ],
  empleado: [
    ["dashboard", "Tablero"],
    ["espacios", "Espacios"],
    ["cafeteria", "Cafetería"],
    ["experiencias", "Experiencias"],
    ["personas", "Personas"],
    ["equipos", "Equipos"],
  ],
  cliente: [
    ["dashboard", "Hoy"],
    ["espacios", "Reservar"],
    ["cafeteria", "Pedir"],
    ["experiencias", "Experiencias"],
  ],
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la acción");
  return data;
}

function el(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function toast(message) {
  document.querySelectorAll(".toast").forEach((node) => node.remove());
  const node = el(`<div class="toast">${message}</div>`);
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

function localStamp(iso) {
  return iso ? iso.replace(" ", "T").slice(0, 16) : "";
}

function fromLocal(value) {
  return value ? value.replace("T", " ") : "";
}

function tag(estado) {
  const map = {
    ocupado: "bad",
    pronto: "warn",
    libre: "ok",
    mantenimiento: "warn",
    confirmada: "moss",
    en_curso: "warn",
    completada: "ok",
    cancelada: "bad",
    programada: "moss",
    finalizada: "ok",
    pendiente: "warn",
    pagado: "ok",
    vigente: "ok",
    vencido: "bad",
    operativo: "ok",
    prestado: "warn",
  };
  return `<span class="tag ${map[estado] || ""}">${estado.replace("_", " ")}</span>`;
}

async function boot() {
  try {
    state.user = await api("/api/me");
  } catch {
    state.user = null;
  }
  render();
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  root.append(state.user ? appShell() : gate());
  bind();
}

function gate() {
  return el(`
    <section class="gate">
      <div class="gate-visual">
        <div>
          <div class="brand">Kairo</div>
          <h1>Un solo sistema para el día, el café y la noche.</h1>
          <p>Espacios, reservas, inventario, personal y experiencias sociales viven en la misma operación.</p>
        </div>
        <div class="pills">
          <span class="pill">Coworking</span>
          <span class="pill">Cafetería</span>
          <span class="pill">Experiencias</span>
        </div>
      </div>
      <div class="gate-form">
        <form class="card auth" id="login-form">
          <h2>Entrar</h2>
          <p class="muted">Usa una cuenta de demostración o crea un cliente nuevo.</p>
          ${state.error ? `<div class="error">${state.error}</div>` : ""}
          <div class="stack">
            <label>Correo<input name="email" type="email" required value="admin@kairo.local"></label>
            <label>Clave<input name="password" type="password" required value="kairo123"></label>
            <button class="btn terra">Entrar</button>
          </div>
          <div class="hint">
            <button type="button" data-fill="admin@kairo.local">Dirección · admin@kairo.local</button>
            <button type="button" data-fill="barista@kairo.local">Barista · barista@kairo.local</button>
            <button type="button" data-fill="valentina@kairo.local">Cliente · valentina@kairo.local</button>
            <span>Clave: kairo123</span>
          </div>
          <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
          <p class="muted">¿Primera visita?</p>
          <button type="button" class="btn ghost" id="show-register">Crear cuenta de cliente</button>
        </form>
      </div>
    </section>
  `);
}

function registerCard() {
  return el(`
    <section class="gate">
      <div class="gate-visual">
        <div>
          <div class="brand">Kairo</div>
          <h1>Reserva un puesto, pide un café, entra a una experiencia.</h1>
        </div>
      </div>
      <div class="gate-form">
        <form class="card auth" id="register-form">
          <h2>Crear cuenta</h2>
          ${state.error ? `<div class="error">${state.error}</div>` : ""}
          <div class="stack">
            <label>Nombre<input name="nombre" required></label>
            <label>Correo<input name="email" type="email" required></label>
            <label>Clave<input name="password" type="password" minlength="6" required></label>
            <div class="row">
              <label>Teléfono<input name="telefono"></label>
              <label>Documento<input name="documento"></label>
            </div>
            <button class="btn terra">Registrarme</button>
            <button type="button" class="btn ghost" id="show-login">Ya tengo cuenta</button>
          </div>
        </form>
      </div>
    </section>
  `);
}

function appShell() {
  const nav = views[state.user.rol] || views.cliente;
  const page = pages[state.view] ? pages[state.view]() : pages.dashboard();
  const links = nav.map(([id, label]) => `<button data-view="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`).join("");
  return el(`
    <div class="shell">
      <aside class="side">
        <div class="brand">Kairo</div>
        <nav class="nav">${links}</nav>
        <div class="who">
          <b>${state.user.nombre}</b><br>
          ${state.user.rol}<br>
          <button class="btn ghost small" id="logout" style="margin-top:10px;color:#f4eee4;border-color:#4a3c33">Salir</button>
        </div>
      </aside>
      <div>
        <nav class="mobile-nav">${links}<button id="logout-mobile">Salir</button></nav>
        <main class="main">${page}</main>
      </div>
    </div>
  `);
}

const pages = {
  dashboard() {
    return `<div class="empty">Cargando tablero…</div>`;
  },
  espacios() {
    return `<div class="empty">Cargando espacios…</div>`;
  },
  cafeteria() {
    return `<div class="empty">Cargando cafetería…</div>`;
  },
  experiencias() {
    return `<div class="empty">Cargando experiencias…</div>`;
  },
  personas() {
    return `<div class="empty">Cargando personas…</div>`;
  },
  equipos() {
    return `<div class="empty">Cargando equipos…</div>`;
  },
  operacion() {
    return `<div class="empty">Cargando operación…</div>`;
  },
  reportes() {
    return `<div class="empty">Cargando reportes…</div>`;
  },
};

function bind() {
  document.querySelectorAll("[data-fill]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelector('[name="email"]').value = btn.dataset.fill;
      document.querySelector('[name="password"]').value = "kairo123";
    };
  });
  const login = document.getElementById("login-form");
  if (login) {
    login.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(login);
      try {
        const data = await api("/api/login", {
          method: "POST",
          body: { email: form.get("email"), password: form.get("password") },
        });
        state.user = data.user;
        state.view = "dashboard";
        state.error = "";
        render();
        loadView();
      } catch (error) {
        state.error = error.message;
        render();
      }
    };
  }
  const register = document.getElementById("register-form");
  if (register) {
    register.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(register);
      try {
        const data = await api("/api/registro", {
          method: "POST",
          body: Object.fromEntries(form.entries()),
        });
        state.user = data.user;
        state.view = "dashboard";
        state.error = "";
        render();
        loadView();
      } catch (error) {
        state.error = error.message;
        render();
      }
    };
  }
  const showRegister = document.getElementById("show-register");
  if (showRegister) {
    showRegister.onclick = () => {
      state.error = "";
      document.getElementById("app").innerHTML = "";
      document.getElementById("app").append(registerCard());
      bind();
    };
  }
  const showLogin = document.getElementById("show-login");
  if (showLogin) showLogin.onclick = () => {
    state.error = "";
    render();
  };
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.onclick = () => {
      state.view = btn.dataset.view;
      render();
      loadView();
    };
  });
  const logout = async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    state.cache = {};
    state.cart = {};
    render();
  };
  const logoutBtn = document.getElementById("logout");
  const logoutMobile = document.getElementById("logout-mobile");
  if (logoutBtn) logoutBtn.onclick = logout;
  if (logoutMobile) logoutMobile.onclick = logout;
}

async function loadView() {
  if (!state.user) return;
  const loaders = {
    dashboard: loadDashboard,
    espacios: loadEspacios,
    cafeteria: loadCafeteria,
    experiencias: loadExperiencias,
    personas: loadPersonas,
    equipos: loadEquipos,
    operacion: loadOperacion,
    reportes: loadReportes,
  };
  const fn = loaders[state.view];
  if (fn) await fn();
}

function paint(html) {
  const main = document.querySelector(".main");
  if (main) main.innerHTML = html;
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  const max = Math.max(...(data.serie || []).map((d) => d.total), 1);
  paint(`
    <div class="top">
      <div>
        <p class="muted">Operación del día</p>
        <h1>Tablero</h1>
      </div>
    </div>
    <div class="kpis">
      <div class="card kpi"><span>Espacios ocupados</span><b>${data.ocupados}</b></div>
      <div class="card kpi"><span>Ventas de hoy</span><b>${money(data.ventasHoy.total)}</b></div>
      <div class="card kpi"><span>Operaciones</span><b>${data.ventasHoy.operaciones}</b></div>
      <div class="card kpi"><span>${data.rol === "cliente" ? "Consumo del mes" : "Alertas de stock"}</span><b>${data.rol === "cliente" ? money(data.consumoMes) : (data.stock || []).length}</b></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>Presencia</h2>
        <div class="spaces">
          ${data.espacios
            .map(
              (espacio) => `
            <div class="space ${espacio.presencia}">
              <b>${espacio.nombre}</b>
              <small>${espacio.zona} · ${espacio.tipo}</small>
              ${tag(espacio.presencia)}
              <small>${espacio.ocupante ? `${espacio.ocupante} hasta ${espacio.hasta}` : espacio.proxima || "Libre"}</small>
            </div>`
            )
            .join("")}
        </div>
      </section>
      <section class="card panel">
        <h2>${data.rol === "cliente" ? "Tus reservas" : "Próximas reservas"}</h2>
        <div class="list">
          ${(data.reservas || [])
            .map(
              (r) => `
            <div class="item">
              <div><b>${r.espacio}</b><br><span class="muted">${r.inicio} → ${r.fin.slice(11)}</span></div>
              <div>${r.cliente || r.proposito}<br>${money(r.monto)}</div>
            </div>`
            )
            .join("") || `<div class="empty">No hay reservas próximas.</div>`}
        </div>
        ${
          data.serie
            ? `<h2 style="margin-top:18px">Ventas, 7 días</h2>
          <div class="chart">${data.serie
            .map((d) => `<div class="bar" style="height:${Math.max(8, (d.total / max) * 120)}px"><span>${d.dia.slice(8)}</span></div>`)
            .join("")}</div>`
            : ""
        }
      </section>
    </div>
    ${
      data.rol !== "cliente"
        ? `<div class="grid cols-3" style="margin-top:16px">
      <section class="card panel">
        <h2>Stock bajo</h2>
        ${(data.stock || []).map((s) => `<div class="item"><span>${s.nombre}</span><b>${s.stock} ${s.unidad}</b></div>`).join("") || `<div class="empty">Inventario en rango.</div>`}
      </section>
      <section class="card panel">
        <h2>Turnos de hoy</h2>
        ${(data.turnos || []).map((t) => `<div class="item"><span>${t.nombre}<br><small>${t.area}</small></span><span>${t.hora_inicio}–${t.hora_fin}</span></div>`).join("")}
      </section>
      <section class="card panel">
        <h2>Permisos y costos</h2>
        ${(data.permisos || []).map((p) => `<div class="alert">${p.nombre} vence ${p.vencimiento}</div>`).join("")}
        ${data.costosPendientesTotal != null ? `<div class="item"><span>Costos pendientes</span><b>${money(data.costosPendientesTotal)}</b></div>` : ""}
      </section>
    </div>`
        : ""
    }
  `);
}

async function loadEspacios() {
  const [espacios, clientes] = await Promise.all([
    api("/api/espacios"),
    state.user.rol === "cliente" ? Promise.resolve({ clientes: [] }) : api("/api/clientes"),
  ]);
  const dia = new Date().toISOString().slice(0, 10);
  const reservas = await api(`/api/reservas?dia=${dia}`);
  paint(`
    <div class="top"><div><p class="muted">Coworking, salas, mesas y terraza</p><h1>Espacios</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>Mapa del local</h2>
        <div class="spaces">
          ${espacios.espacios
            .map(
              (espacio) => `
            <div class="space ${espacio.presencia}">
              <b>${espacio.nombre}</b>
              <small>${espacio.capacidad} personas · ${money(espacio.tarifa_hora)}/h</small>
              ${tag(espacio.presencia)}
              ${
                state.user.rol === "admin"
                  ? `<button class="btn ghost small" data-space-state="${espacio.id}" data-next="${espacio.estado === "mantenimiento" ? "disponible" : "mantenimiento"}">${espacio.estado === "mantenimiento" ? "Reabrir" : "Mantenimiento"}</button>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </div>
      </section>
      <section class="card panel">
        <h2>Nueva reserva</h2>
        <form id="reserva-form" class="stack">
          <label>Espacio
            <select name="espacio_id">${espacios.espacios.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join("")}</select>
          </label>
          ${
            state.user.rol === "cliente"
              ? ""
              : `<label>Cliente<select name="cliente_id">${clientes.clientes.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}</select></label>`
          }
          <div class="row">
            <label>Inicio<input type="datetime-local" name="inicio" step="1800" required></label>
            <label>Fin<input type="datetime-local" name="fin" step="1800" required></label>
          </div>
          <label>Propósito
            <select name="proposito">
              <option value="trabajo">Trabajo</option>
              <option value="estudio">Estudio</option>
              <option value="reunion">Reunión</option>
              <option value="consumo">Consumo</option>
            </select>
          </label>
          <label>Notas<input name="notas"></label>
          <button class="btn terra">Reservar</button>
        </form>
      </section>
    </div>
    <section class="card panel" style="margin-top:16px">
      <h2>Reservas de hoy</h2>
      <table class="table">
        <tr><th>Espacio</th><th>Quién</th><th>Horario</th><th>Estado</th><th>Monto</th><th></th></tr>
        ${reservas.reservas
          .map(
            (r) => `<tr>
              <td>${r.espacio}</td>
              <td>${r.cliente || "Experiencia"}</td>
              <td>${r.inicio.slice(11)}–${r.fin.slice(11)}</td>
              <td>${tag(r.estado)}</td>
              <td class="money">${money(r.monto)}</td>
              <td>${r.estado === "cancelada" || r.estado === "completada" ? "" : `<button class="btn ghost small" data-cancel-reserva="${r.id}">Cancelar</button>`}</td>
            </tr>`
          )
          .join("")}
      </table>
    </section>
  `);
  document.getElementById("reserva-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const result = await api("/api/reservas", {
        method: "POST",
        body: {
          espacio_id: Number(form.get("espacio_id")),
          cliente_id: form.get("cliente_id") ? Number(form.get("cliente_id")) : undefined,
          inicio: fromLocal(form.get("inicio")),
          fin: fromLocal(form.get("fin")),
          proposito: form.get("proposito"),
          notas: form.get("notas"),
        },
      });
      toast(result.incluido ? "Reserva incluida en la membresía" : `Reserva creada por ${money(result.monto)}`);
      loadEspacios();
    } catch (error) {
      toast(error.message);
    }
  };
  document.querySelectorAll("[data-cancel-reserva]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/reservas/${btn.dataset.cancelReserva}`, { method: "PATCH", body: { estado: "cancelada" } });
        toast("Reserva cancelada");
        loadEspacios();
      } catch (error) {
        toast(error.message);
      }
    };
  });
  document.querySelectorAll("[data-space-state]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/espacios/${btn.dataset.spaceState}`, { method: "PATCH", body: { estado: btn.dataset.next } });
      loadEspacios();
    };
  });
}

async function loadCafeteria() {
  const [productos, insumos, movimientos, ventas] = await Promise.all([
    api("/api/productos"),
    state.user.rol === "cliente" ? { insumos: [] } : api("/api/insumos"),
    state.user.rol === "cliente" ? { movimientos: [] } : api("/api/movimientos"),
    state.user.rol === "cliente" ? { ventas: [] } : api("/api/ventas"),
  ]);
  const clientes = state.user.rol === "cliente" ? { clientes: [] } : await api("/api/clientes");
  const cartItems = Object.entries(state.cart)
    .map(([id, qty]) => {
      const producto = productos.productos.find((p) => p.id === Number(id));
      return producto ? { ...producto, qty } : null;
    })
    .filter(Boolean);
  const total = cartItems.reduce((sum, item) => sum + item.precio * item.qty, 0);
  paint(`
    <div class="top"><div><p class="muted">Punto de venta e inventario</p><h1>Cafetería</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>Menú</h2>
        <div class="menu">
          ${productos.productos
            .map(
              (p) => `
            <div class="menu-item">
              <div><b>${p.nombre}</b><br><span class="muted">${p.descripcion || p.categoria}${p.es_alcohol ? " · 18+" : ""}</span></div>
              <div class="money">${money(p.precio)}</div>
              <div class="qty">
                <button data-minus="${p.id}">−</button>
                <span>${state.cart[p.id] || 0}</span>
                <button data-plus="${p.id}">+</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </section>
      <section class="card panel">
        <h2>Pedido</h2>
        ${cartItems.length ? cartItems.map((i) => `<div class="item"><span>${i.qty} × ${i.nombre}</span><b>${money(i.precio * i.qty)}</b></div>`).join("") : `<div class="empty">Agrega productos del menú.</div>`}
        <div class="item"><span>Total</span><b>${money(total)}</b></div>
        <form id="venta-form" class="stack">
          ${
            state.user.rol === "cliente"
              ? ""
              : `<label>Cliente
            <select name="cliente_id">
              <option value="">Mostrador</option>
              ${clientes.clientes.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}
            </select>
          </label>`
          }
          <label>Pago
            <select name="metodo_pago">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>
          <label class="checks"><input type="checkbox" name="mayor_edad"> Confirmo que el cliente es mayor de 18 años si hay alcohol</label>
          <button class="btn terra" ${total ? "" : "disabled"}>Cobrar</button>
        </form>
      </section>
    </div>
    ${
      state.user.rol === "cliente"
        ? ""
        : `<div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>Inventario</h2>
        <table class="table">
          <tr><th>Insumo</th><th>Stock</th><th>Mínimo</th></tr>
          ${insumos.insumos
            .map(
              (i) => `<tr>
              <td>${i.nombre}</td>
              <td>${i.stock} ${i.unidad}</td>
              <td>${i.stock <= i.stock_minimo ? tag("pendiente") : i.stock_minimo}</td>
            </tr>`
            )
            .join("")}
        </table>
        <form id="mov-form" class="stack" style="margin-top:16px">
          <div class="row">
            <label>Insumo<select name="insumo_id">${insumos.insumos.map((i) => `<option value="${i.id}">${i.nombre}</option>`).join("")}</select></label>
            <label>Tipo
              <select name="tipo">
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="merma">Merma</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label>Cantidad<input name="cantidad" type="number" step="0.1" required></label>
            <label>Motivo<input name="motivo" required></label>
          </div>
          <button class="btn">Registrar movimiento</button>
        </form>
      </section>
      <section class="card panel">
        <h2>Últimas ventas</h2>
        ${ventas.ventas
          .map(
            (v) => `<div class="item"><div><b>${money(v.total)}</b><br><span class="muted">${v.fecha} · ${v.metodo_pago}</span></div><span>${(v.items || []).map((i) => `${i.cantidad} ${i.nombre}`).join(", ")}</span></div>`
          )
          .join("")}
        <h2 style="margin-top:18px">Movimientos</h2>
        ${movimientos.movimientos
          .slice(0, 8)
          .map((m) => `<div class="item"><span>${m.tipo} · ${m.insumo}</span><b>${m.cantidad} ${m.unidad}</b></div>`)
          .join("")}
      </section>
    </div>`
    }
  `);
  document.querySelectorAll("[data-plus]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.plus;
      state.cart[id] = (state.cart[id] || 0) + 1;
      loadCafeteria();
    };
  });
  document.querySelectorAll("[data-minus]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.minus;
      state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1);
      if (!state.cart[id]) delete state.cart[id];
      loadCafeteria();
    };
  });
  document.getElementById("venta-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const result = await api("/api/ventas", {
        method: "POST",
        body: {
          cliente_id: form.get("cliente_id") ? Number(form.get("cliente_id")) : undefined,
          metodo_pago: form.get("metodo_pago"),
          mayor_edad: form.get("mayor_edad") === "on",
          items: Object.entries(state.cart).map(([producto_id, cantidad]) => ({ producto_id: Number(producto_id), cantidad })),
        },
      });
      state.cart = {};
      toast(`Venta ${money(result.total)}`);
      loadCafeteria();
    } catch (error) {
      toast(error.message);
    }
  };
  const mov = document.getElementById("mov-form");
  if (mov) {
    mov.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(mov);
      try {
        await api("/api/movimientos", {
          method: "POST",
          body: {
            insumo_id: Number(form.get("insumo_id")),
            tipo: form.get("tipo"),
            cantidad: Number(form.get("cantidad")),
            motivo: form.get("motivo"),
          },
        });
        toast("Inventario actualizado");
        loadCafeteria();
      } catch (error) {
        toast(error.message);
      }
    };
  }
}

async function loadExperiencias() {
  const [data, espacios, empleados, equipos, productos, clientes] = await Promise.all([
    api("/api/experiencias"),
    api("/api/espacios"),
    state.user.rol === "cliente" ? { empleados: [] } : api("/api/empleados"),
    state.user.rol === "cliente" ? { equipos: [] } : api("/api/equipos"),
    api("/api/productos"),
    state.user.rol === "cliente" ? { clientes: [] } : api("/api/clientes"),
  ]);
  paint(`
    <div class="top"><div><p class="muted">Un evento arrastra espacio, gente, equipos y productos</p><h1>Experiencias</h1></div></div>
    <div class="grid ${state.user.rol === "cliente" ? "" : "cols-2"}">
      <section class="card panel">
        ${data.experiencias
          .map((e) => {
            const mine = e.participantes.some((p) => p.id === state.user.cliente_id);
            return `
          <div class="item" style="grid-template-columns:1fr">
            <div>
              <b>${e.nombre}</b> ${tag(e.estado)}
              <div class="muted">${e.espacio} · ${e.inicio} → ${e.fin.slice(11)} · ${e.participantes.length}/${e.capacidad}</div>
              <p>${e.descripcion || ""}</p>
              <div class="muted">Empleados: ${e.empleados.map((x) => x.nombre).join(", ") || "—"}</div>
              <div class="muted">Equipos: ${e.equipos.map((x) => x.nombre).join(", ") || "—"}</div>
              <div class="muted">Productos: ${e.productos.map((x) => `${x.cantidad} ${x.nombre}`).join(", ") || "—"}</div>
              <div class="item"><span>Ingresos previstos</span><b>${money(e.ingresos)}</b></div>
              <div class="form-actions">
                ${
                  state.user.rol === "cliente"
                    ? mine
                      ? `<button class="btn ghost small" data-leave="${e.id}">Salir</button>`
                      : `<button class="btn terra small" data-join="${e.id}">Tomar cupo · ${money(e.precio)}</button>`
                    : `
                    ${e.estado === "programada" || e.estado === "en_curso" ? `<button class="btn small" data-close="${e.id}">Cerrar y descontar inventario</button>` : ""}
                    ${e.estado !== "finalizada" && e.estado !== "cancelada" ? `<button class="btn ghost small" data-cancel-exp="${e.id}">Cancelar</button>` : ""}
                    <select data-add-part="${e.id}"><option value="">Agregar participante</option>${clientes.clientes.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}</select>
                  `
                }
              </div>
            </div>
          </div>`;
          })
          .join("")}
      </section>
      ${
        state.user.rol === "cliente"
          ? ""
          : `<section class="card panel">
        <h2>Programar</h2>
        <form id="exp-form" class="stack">
          <label>Nombre<input name="nombre" required></label>
          <label>Descripción<textarea name="descripcion"></textarea></label>
          <label>Espacio<select name="espacio_id">${espacios.espacios.map((e) => `<option value="${e.id}">${e.nombre} (${e.capacidad})</option>`).join("")}</select></label>
          <div class="row">
            <label>Inicio<input type="datetime-local" name="inicio" required></label>
            <label>Fin<input type="datetime-local" name="fin" required></label>
          </div>
          <div class="row">
            <label>Capacidad<input type="number" name="capacidad" required></label>
            <label>Precio<input type="number" name="precio" required></label>
          </div>
          <div class="checks">
            ${empleados.empleados.map((e) => `<label><input type="checkbox" name="empleados" value="${e.id}"> ${e.nombre} · ${e.cargo}</label>`).join("")}
          </div>
          <div class="checks">
            ${equipos.equipos
              .filter((e) => e.estado === "operativo")
              .map((e) => `<label><input type="checkbox" name="equipos" value="${e.id}"> ${e.nombre}</label>`)
              .join("")}
          </div>
          <label>Producto
            <select name="producto_id">${productos.productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("")}</select>
          </label>
          <label>Cantidad prevista<input type="number" name="producto_cantidad" value="6"></label>
          <button class="btn terra">Crear experiencia</button>
        </form>
      </section>`
      }
    </div>
  `);
  const form = document.getElementById("exp-form");
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const dataForm = new FormData(form);
      try {
        await api("/api/experiencias", {
          method: "POST",
          body: {
            nombre: dataForm.get("nombre"),
            descripcion: dataForm.get("descripcion"),
            espacio_id: Number(dataForm.get("espacio_id")),
            inicio: fromLocal(dataForm.get("inicio")),
            fin: fromLocal(dataForm.get("fin")),
            capacidad: Number(dataForm.get("capacidad")),
            precio: Number(dataForm.get("precio")),
            empleados: [...form.querySelectorAll('[name="empleados"]:checked')].map((n) => Number(n.value)),
            equipos: [...form.querySelectorAll('[name="equipos"]:checked')].map((n) => Number(n.value)),
            productos: dataForm.get("producto_id")
              ? [{ producto_id: Number(dataForm.get("producto_id")), cantidad: Number(dataForm.get("producto_cantidad") || 0) }]
              : [],
          },
        });
        toast("Experiencia programada");
        loadExperiencias();
      } catch (error) {
        toast(error.message);
      }
    };
  }
  document.querySelectorAll("[data-join]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/experiencias/${btn.dataset.join}/participantes`, { method: "POST", body: {} });
        toast("Cupo reservado");
        loadExperiencias();
      } catch (error) {
        toast(error.message);
      }
    };
  });
  document.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/experiencias/${btn.dataset.leave}/participantes/${state.user.cliente_id}`, { method: "DELETE" });
      toast("Saliste de la experiencia");
      loadExperiencias();
    };
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/experiencias/${btn.dataset.close}/cerrar`, { method: "POST" });
        toast("Inventario descontado");
        loadExperiencias();
      } catch (error) {
        toast(error.message);
      }
    };
  });
  document.querySelectorAll("[data-cancel-exp]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/experiencias/${btn.dataset.cancelExp}/cancelar`, { method: "POST" });
      loadExperiencias();
    };
  });
  document.querySelectorAll("[data-add-part]").forEach((select) => {
    select.onchange = async () => {
      if (!select.value) return;
      try {
        await api(`/api/experiencias/${select.dataset.addPart}/participantes`, {
          method: "POST",
          body: { cliente_id: Number(select.value) },
        });
        loadExperiencias();
      } catch (error) {
        toast(error.message);
        select.value = "";
      }
    };
  });
}

async function loadPersonas() {
  const [empleados, clientes, turnos] = await Promise.all([
    api("/api/empleados"),
    api("/api/clientes"),
    api("/api/turnos"),
  ]);
  paint(`
    <div class="top"><div><p class="muted">Personal, turnos y miembros</p><h1>Personas</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>Empleados</h2>
        <table class="table">
          <tr><th>Nombre</th><th>Cargo</th><th>Ingreso</th>${state.user.rol === "admin" ? "<th>Salario</th>" : ""}</tr>
          ${empleados.empleados
            .map(
              (e) => `<tr><td>${e.nombre}</td><td>${e.cargo}</td><td>${e.fecha_ingreso}</td>${state.user.rol === "admin" ? `<td>${money(e.salario)}</td>` : ""}</tr>`
            )
            .join("")}
        </table>
        ${
          state.user.rol === "admin"
            ? `<form id="turno-form" class="stack" style="margin-top:16px">
          <h2>Turno</h2>
          <label>Empleado<select name="empleado_id">${empleados.empleados.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join("")}</select></label>
          <div class="row">
            <label>Fecha<input type="date" name="fecha" required></label>
            <label>Área<input name="area" required></label>
          </div>
          <div class="row">
            <label>Inicio<input type="time" name="hora_inicio" required></label>
            <label>Fin<input type="time" name="hora_fin" required></label>
          </div>
          <button class="btn">Guardar turno</button>
        </form>`
            : ""
        }
      </section>
      <section class="card panel">
        <h2>Turnos ${turnos.fecha}</h2>
        ${turnos.turnos.map((t) => `<div class="item"><span>${t.nombre}<br><small>${t.area}</small></span><b>${t.hora_inicio}–${t.hora_fin}</b></div>`).join("")}
        <h2 style="margin-top:18px">Clientes</h2>
        ${clientes.clientes
          .map(
            (c) => `<div class="item"><span>${c.nombre}<br><small>${c.membresia}${c.membresia_vence ? ` hasta ${c.membresia_vence}` : ""}</small></span><span>${c.email}</span></div>`
          )
          .join("")}
      </section>
    </div>
  `);
  const form = document.getElementById("turno-form");
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const dataForm = new FormData(form);
      try {
        await api("/api/turnos", {
          method: "POST",
          body: Object.fromEntries([...dataForm.entries(), ["empleado_id", Number(dataForm.get("empleado_id"))]]),
        });
        toast("Turno creado");
        loadPersonas();
      } catch (error) {
        toast(error.message);
      }
    };
  }
}

async function loadEquipos() {
  const [equipos, espacios] = await Promise.all([api("/api/equipos"), api("/api/espacios")]);
  paint(`
    <div class="top"><div><p class="muted">Tecnología, mobiliario y producción</p><h1>Equipos</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <table class="table">
          <tr><th>Equipo</th><th>Tipo</th><th>Estado</th><th>Espacio</th><th></th></tr>
          ${equipos.equipos
            .map(
              (e) => `<tr>
              <td>${e.nombre}</td><td>${e.tipo}</td><td>${tag(e.estado)}</td><td>${e.espacio || "—"}</td>
              <td>
                <select data-eq="${e.id}">
                  ${["operativo", "mantenimiento", "prestado"].map((s) => `<option ${s === e.estado ? "selected" : ""}>${s}</option>`).join("")}
                </select>
              </td>
            </tr>`
            )
            .join("")}
        </table>
      </section>
      ${
        state.user.rol === "admin"
          ? `<section class="card panel">
        <h2>Registrar equipo</h2>
        <form id="eq-form" class="stack">
          <label>Nombre<input name="nombre" required></label>
          <label>Tipo
            <select name="tipo">
              <option value="tecnologico">Tecnológico</option>
              <option value="mobiliario">Mobiliario</option>
              <option value="produccion">Producción</option>
              <option value="administracion">Administración</option>
            </select>
          </label>
          <label>Costo<input type="number" name="costo" required></label>
          <label>Espacio
            <select name="espacio_id">
              <option value="">Sin asignar</option>
              ${espacios.espacios.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join("")}
            </select>
          </label>
          <button class="btn terra">Guardar</button>
        </form>
      </section>`
          : ""
      }
    </div>
  `);
  document.querySelectorAll("[data-eq]").forEach((select) => {
    select.onchange = async () => {
      await api(`/api/equipos/${select.dataset.eq}`, { method: "PATCH", body: { estado: select.value } });
      loadEquipos();
    };
  });
  const form = document.getElementById("eq-form");
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const dataForm = new FormData(form);
      await api("/api/equipos", {
        method: "POST",
        body: {
          nombre: dataForm.get("nombre"),
          tipo: dataForm.get("tipo"),
          costo: Number(dataForm.get("costo")),
          espacio_id: dataForm.get("espacio_id") ? Number(dataForm.get("espacio_id")) : null,
        },
      });
      loadEquipos();
    };
  }
}

async function loadOperacion() {
  const [costos, permisos, proveedores] = await Promise.all([api("/api/costos"), api("/api/permisos"), api("/api/proveedores")]);
  paint(`
    <div class="top"><div><p class="muted">Arriendo, servicios y permisos</p><h1>Operación</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>Costos ${costos.periodo}</h2>
        ${costos.costos
          .map(
            (c) => `<div class="item">
            <span>${c.concepto}<br><small>${c.categoria} · vence ${c.vencimiento || "—"}</small></span>
            <div>
              <b>${money(c.monto)}</b>
              <button class="btn ghost small" data-cost="${c.id}" data-next="${c.estado === "pagado" ? "pendiente" : "pagado"}">${c.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}</button>
            </div>
          </div>`
          )
          .join("")}
        <form id="costo-form" class="stack" style="margin-top:16px">
          <div class="row">
            <label>Concepto<input name="concepto" required></label>
            <label>Categoría<input name="categoria" value="servicios"></label>
          </div>
          <div class="row">
            <label>Monto<input type="number" name="monto" required></label>
            <label>Vencimiento<input type="date" name="vencimiento"></label>
          </div>
          <button class="btn">Agregar costo</button>
        </form>
      </section>
      <section class="card panel">
        <h2>Permisos</h2>
        ${permisos.permisos.map((p) => `<div class="item"><span>${p.nombre}<br><small>${p.entidad} · ${p.numero || ""}</small></span><div>${tag(p.estado)}<br>${p.vencimiento}</div></div>`).join("")}
        <form id="perm-form" class="stack" style="margin-top:16px">
          <label>Nombre<input name="nombre" required></label>
          <label>Entidad<input name="entidad" required></label>
          <div class="row">
            <label>Número<input name="numero"></label>
            <label>Vence<input type="date" name="vencimiento" required></label>
          </div>
          <button class="btn">Guardar permiso</button>
        </form>
        <h2 style="margin-top:18px">Proveedores</h2>
        ${proveedores.proveedores.map((p) => `<div class="item"><span>${p.nombre}</span><span>${p.categoria}</span></div>`).join("")}
      </section>
    </div>
  `);
  document.querySelectorAll("[data-cost]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/costos/${btn.dataset.cost}`, { method: "PATCH", body: { estado: btn.dataset.next } });
      loadOperacion();
    };
  });
  document.getElementById("costo-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await api("/api/costos", { method: "POST", body: Object.fromEntries(form.entries()) });
    loadOperacion();
  };
  document.getElementById("perm-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await api("/api/permisos", { method: "POST", body: Object.fromEntries(form.entries()) });
    loadOperacion();
  };
}

async function loadReportes() {
  const data = await api("/api/reportes");
  const max = Math.max(...data.demanda.map((d) => d.reservas + d.ventas), 1);
  paint(`
    <div class="top"><div><p class="muted">Periodo ${data.periodo}</p><h1>Reportes</h1></div></div>
    <div class="kpis">
      <div class="card kpi"><span>Ventas</span><b>${money(data.ingresos.ventas)}</b></div>
      <div class="card kpi"><span>Reservas realizadas</span><b>${money(data.ingresos.reservasRealizadas)}</b></div>
      <div class="card kpi"><span>Ocupación</span><b>${data.ocupacionPromedio}%</b></div>
      <div class="card kpi"><span>Margen realizado</span><b>${money(data.margenRealizado)}</b></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>Utilización de espacios</h2>
        ${data.utilizacion.map((u) => `<div class="item"><span>${u.nombre}</span><b>${u.porcentaje}% · ${u.horas} h</b></div>`).join("")}
      </section>
      <section class="card panel">
        <h2>Demanda por hora</h2>
        <div class="chart">${data.demanda
          .map((d) => `<div class="bar" style="height:${Math.max(6, ((d.reservas + d.ventas) / max) * 120)}px"><span>${d.hora}</span></div>`)
          .join("")}</div>
      </section>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>Productos</h2>
        ${data.topProductos.map((p) => `<div class="item"><span>${p.nombre} · ${p.cantidad}</span><b>${money(p.ingresos)}</b></div>`).join("")}
        <div class="item"><span>Costo de insumos</span><b>${money(data.costos.insumos)}</b></div>
        <div class="item"><span>Costos fijos</span><b>${money(data.costos.fijos)}</b></div>
      </section>
      <section class="card panel">
        <h2>Rentabilidad de experiencias</h2>
        ${data.experiencias
          .map(
            (e) => `<div class="item"><span>${e.nombre}<br><small>${e.participantes}/${e.capacidad} · ${e.estado}</small></span><b>${money(e.margen)}</b></div>`
          )
          .join("")}
      </section>
    </div>
  `);
}

boot().then(loadView);
