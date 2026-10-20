const state = {
  user: null,
  view: "dashboard",
  gate: "login",
  lang: localStorage.getItem("kairo.lang") === "en" ? "en" : "es",
  cache: {},
  toast: "",
  error: "",
  notice: "",
  draft: null,
  recovery: null,
  cart: {},
  reporte: { rango: "hoy", desde: "", hasta: "" },
};

function t(key, vars) {
  const table = I18N[state.lang] || I18N.es;
  let text = table[key];
  if (text == null) text = I18N.es[key];
  if (text == null) return key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function field(name, fallback = "") {
  const value = state.draft && Object.prototype.hasOwnProperty.call(state.draft, name) ? state.draft[name] : fallback;
  return esc(value);
}

function money(n) {
  const locale = state.lang === "en" ? "en-US" : "es-CO";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

function navFor(rol) {
  const ids = {
    admin: ["dashboard", "espacios", "cafeteria", "experiencias", "personas", "equipos", "operacion", "reportes"],
    empleado: ["dashboard", "espacios", "cafeteria", "experiencias", "personas", "equipos"],
    cliente: ["dashboard", "espacios", "cafeteria", "experiencias"],
  };
  const clientLabels = { dashboard: "nav.today", espacios: "nav.book", cafeteria: "nav.order" };
  return (ids[rol] || ids.cliente).map((id) => [id, t(rol === "cliente" && clientLabels[id] ? clientLabels[id] : `nav.${id}`)]);
}

function translateError(message) {
  if (!message) return "";
  if (state.lang !== "en") return message;
  if (I18N.serverEn[message]) return I18N.serverEn[message];
  let match = message.match(/^Stock insuficiente de (.+)\. Hay (.+) y se necesitan (.+)\.$/);
  if (match) return `Not enough ${match[1]} in stock. Available: ${match[2]}. Needed: ${match[3]}.`;
  match = message.match(/^Stock insuficiente de (.+)$/);
  if (match) return `Not enough ${match[1]} in stock.`;
  match = message.match(/^La capacidad supera la del espacio \((.+)\)$/);
  if (match) return `Capacity exceeds the space limit (${match[1]}).`;
  match = message.match(/^Esa persona ya está asignada a «(.+)» en ese horario$/);
  if (match) return `That person is already assigned to “${match[1]}” at that time.`;
  match = message.match(/^(.+) no está operativo$/);
  if (match) return `${match[1]} is not operational.`;
  match = message.match(/^(.+) ya está comprometido en «(.+)»$/);
  if (match) return `${match[1]} is already booked for “${match[2]}”.`;
  return message;
}

function passwordIssues(password, email) {
  const issues = [];
  if (password.length < 8 || password.length > 72) issues.push("length");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) issues.push("case");
  if (!/\d/.test(password)) issues.push("digit");
  if (/\s/.test(password) || !/[^A-Za-z0-9]/.test(password)) issues.push("symbol");
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local.length >= 3 && password.toLowerCase().includes(local)) issues.push("email");
  return issues;
}

function passwordProblem(form) {
  const password = form.get("password") || "";
  const confirmacion = form.get("confirmacion") || "";
  const email = form.get("email") || state.user?.email || "";
  if (password !== confirmacion) return t("error.mismatch");
  if (passwordIssues(password, email).length) return t("error.policy");
  return "";
}

function rulesHtml() {
  return `<ul class="rules" data-rules>
    ${["length", "case", "digit", "symbol", "email"].map((id) => `<li data-rule="${id}">${t(`rule.${id}`)}</li>`).join("")}
  </ul>`;
}

function langButtons() {
  return ["es", "en"]
    .map((code) => `<button type="button" data-lang="${code}" class="${state.lang === code ? "active" : ""}">${code.toUpperCase()}</button>`)
    .join("");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": state.lang === "en" ? "en" : "es",
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.user) {
    state.user = null;
    state.cache = {};
    state.cart = {};
    state.gate = "login";
    state.error = translateError(data.error || "") || t("error.session");
    state.notice = "";
    render();
  }
  if (!res.ok) throw new Error(translateError(data.error || "") || t("error.generic"));
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
    activo: "ok",
    inactivo: "bad",
  };
  const label = t(`status.${estado}`);
  return `<span class="tag ${map[estado] || ""}">${label === `status.${estado}` ? esc(String(estado).replaceAll("_", " ")) : label}</span>`;
}

function membershipLabel(cliente) {
  const name = t(`membership.${cliente.membresia}`);
  const label = name === `membership.${cliente.membresia}` ? cliente.membresia : name;
  return cliente.membresia_vence ? `${label} ${t("people.until")} ${cliente.membresia_vence}` : label;
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
  document.documentElement.lang = state.lang === "en" ? "en" : "es";
  const root = document.getElementById("app");
  root.innerHTML = "";
  if (!state.user) {
    const screens = { register: registerCard, recover: recoverCard };
    root.append((screens[state.gate] || gate)());
  } else root.append(appShell());
  bind();
}

function gateFrame(title, form) {
  return el(`
    <section class="gate">
      <div class="gate-visual">
        <div>
          <div class="brand">Kairo</div>
          <h1>${title}</h1>
          <p>${state.gate === "login" ? t("gate.lead") : ""}</p>
        </div>
        <div class="pills">
          <span class="pill">${t("pill.cowork")}</span>
          <span class="pill">${t("pill.cafe")}</span>
          <span class="pill">${t("pill.exp")}</span>
        </div>
      </div>
      <div class="gate-form">${form}</div>
    </section>
  `);
}

function feedback() {
  return `${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}`;
}

function gate() {
  return gateFrame(
    t("gate.title"),
    `
      <form class="card auth" id="login-form">
        <div class="auth-head">
          <h2>${t("login.title")}</h2>
          <div class="lang-switch">${langButtons()}</div>
        </div>
        <p class="muted">${t("login.lead")}</p>
        ${feedback()}
        <div class="stack">
          <label>${t("field.email")}<input name="email" type="email" autocomplete="username" required value="${field("email", "admin@kairo.local")}"></label>
          <label>${t("field.password")}<input name="password" type="password" autocomplete="current-password" required value="${field("password", "kairo123")}"></label>
          <button class="btn terra">${t("login.submit")}</button>
        </div>
        <div class="hint">
          <button type="button" data-fill="admin@kairo.local">${t("demo.admin")}</button>
          <button type="button" data-fill="barista@kairo.local">${t("demo.barista")}</button>
          <button type="button" data-fill="valentina@kairo.local">${t("demo.client")}</button>
          <button type="button" data-fill="inactivo@kairo.local">${t("demo.inactive")}</button>
          <span>${t("demo.password")}</span>
          <span>${t("demo.note")}</span>
        </div>
        <hr class="split">
        <p class="muted">${t("login.new")}</p>
        <button type="button" class="btn ghost" id="show-register">${t("login.register")}</button>
        <button type="button" class="btn ghost" id="show-recover">${t("login.forgot")}</button>
      </form>
    `
  );
}

function registerCard() {
  return gateFrame(
    t("gate.registerTitle"),
    `
      <form class="card auth" id="register-form">
        <div class="auth-head">
          <h2>${t("register.title")}</h2>
          <div class="lang-switch">${langButtons()}</div>
        </div>
        ${feedback()}
        <div class="stack">
          <label>${t("field.name")}<input name="nombre" autocomplete="name" required value="${field("nombre")}"></label>
          <label>${t("field.email")}<input name="email" type="email" autocomplete="email" required value="${field("email")}"></label>
          <label>${t("field.password")}<input name="password" type="password" autocomplete="new-password" required value="${field("password")}"></label>
          <label>${t("field.password2")}<input name="confirmacion" type="password" autocomplete="new-password" required value="${field("confirmacion")}"></label>
          ${rulesHtml()}
          <div class="row">
            <label>${t("field.phone")}<input name="telefono" autocomplete="tel" value="${field("telefono")}"></label>
            <label>${t("field.doc")}<input name="documento" value="${field("documento")}"></label>
          </div>
          <button class="btn terra">${t("register.submit")}</button>
          <button type="button" class="btn ghost" data-gate="login">${t("register.back")}</button>
        </div>
      </form>
    `
  );
}

function recoverCard() {
  const sent = state.recovery;
  return gateFrame(
    t("gate.recoverTitle"),
    `
      <form class="card auth" id="recover-form">
        <div class="auth-head">
          <h2>${t("recover.title")}</h2>
          <div class="lang-switch">${langButtons()}</div>
        </div>
        <p class="muted">${t("recover.lead")}</p>
        ${feedback()}
        <div class="stack">
          <label>${t("field.email")}<input name="email" type="email" autocomplete="username" required value="${esc(sent?.email || field("email"))}"></label>
          ${
            sent
              ? `<div class="mail-demo">
                  <b>${t("recover.inbox")}</b>
                  <p>${sent.codigo ? t("recover.inboxHelp") : t("recover.empty")}</p>
                  ${sent.codigo ? `<div class="code">${esc(sent.codigo)}</div>` : ""}
                </div>
                <label>${t("recover.code")}<input name="codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required value="${field("codigo")}"></label>
                <label>${t("recover.new")}<input name="password" type="password" autocomplete="new-password" required value="${field("password")}"></label>
                <label>${t("field.password2")}<input name="confirmacion" type="password" autocomplete="new-password" required value="${field("confirmacion")}"></label>
                ${rulesHtml()}
                <button class="btn terra" name="step" value="confirm">${t("recover.save")}</button>
                <button class="btn ghost" name="step" value="ask" formnovalidate>${t("recover.submit")}</button>`
              : `<button class="btn" name="step" value="ask">${t("recover.submit")}</button>`
          }
          <button type="button" class="btn ghost" data-gate="login">${t("recover.back")}</button>
        </div>
      </form>
    `
  );
}

function appShell() {
  const nav = navFor(state.user.rol);
  const page = pages[state.view] ? pages[state.view]() : pages.dashboard();
  const links = nav.map(([id, label]) => `<button data-view="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`).join("");
  return el(`
    <div class="shell">
      <aside class="side">
        <div class="brand">Kairo</div>
        <nav class="nav">${links}</nav>
        <div class="who">
          <b>${esc(state.user.nombre)}</b><br>
          ${t(`role.${state.user.rol}`)}<br>
          <div class="lang-switch" style="margin-top:10px">${langButtons()}</div>
          <button class="btn ghost small" id="account" style="margin-top:10px;color:#f4eee4;border-color:#4a3c33">${t("account.link")}</button>
          <button class="btn ghost small" id="logout" style="margin-top:8px;color:#f4eee4;border-color:#4a3c33">${t("logout")}</button>
        </div>
      </aside>
      <div>
        <nav class="mobile-nav">${links}<span class="lang-switch">${langButtons()}</span><button id="account-mobile">${t("account.link")}</button><button id="logout-mobile">${t("logout")}</button></nav>
        <main class="main">${page}</main>
      </div>
    </div>
  `);
}

const pages = {
  dashboard() {
    return `<div class="empty">${t("loading.dashboard")}</div>`;
  },
  espacios() {
    return `<div class="empty">${t("loading.espacios")}</div>`;
  },
  cafeteria() {
    return `<div class="empty">${t("loading.cafeteria")}</div>`;
  },
  experiencias() {
    return `<div class="empty">${t("loading.experiencias")}</div>`;
  },
  personas() {
    return `<div class="empty">${t("loading.personas")}</div>`;
  },
  equipos() {
    return `<div class="empty">${t("loading.equipos")}</div>`;
  },
  operacion() {
    return `<div class="empty">${t("loading.operacion")}</div>`;
  },
  reportes() {
    return `<div class="empty">${t("loading.reportes")}</div>`;
  },
  cuenta() {
    return `<div class="empty">${t("loading.cuenta")}</div>`;
  },
};

function openGate(name) {
  state.gate = name;
  state.error = "";
  state.notice = "";
  state.draft = null;
  if (name !== "recover") state.recovery = null;
  render();
}

function setLang(lang) {
  state.lang = lang === "en" ? "en" : "es";
  localStorage.setItem("kairo.lang", state.lang);
  render();
  if (state.user) loadView();
}

function paintRules(form) {
  const input = form.querySelector('[name="password"]');
  const list = form.querySelector("[data-rules]");
  if (!input || !list) return;
  const email = form.querySelector('[name="email"]')?.value || state.user?.email || "";
  const password = input.value;
  const failed = new Set(passwordIssues(password, email));
  list.querySelectorAll("[data-rule]").forEach((item) => {
    item.className = password ? (failed.has(item.dataset.rule) ? "bad" : "ok") : "";
  });
}

function bindPasswordRules(root) {
  root.querySelectorAll("form").forEach((form) => {
    if (!form.querySelector("[data-rules]")) return;
    const update = () => paintRules(form);
    form.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
    update();
  });
}

function keepDraft(form) {
  state.draft = Object.fromEntries(new FormData(form).entries());
}

function bind() {
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.onclick = () => setLang(btn.dataset.lang);
  });
  document.querySelectorAll("[data-fill]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelector('[name="email"]').value = btn.dataset.fill;
      const password = document.querySelector('[name="password"]');
      if (password) password.value = "kairo123";
    };
  });
  document.querySelectorAll("[data-gate]").forEach((btn) => {
    btn.onclick = () => openGate(btn.dataset.gate);
  });
  const login = document.getElementById("login-form");
  if (login) {
    login.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(login);
      keepDraft(login);
      try {
        const data = await api("/api/login", {
          method: "POST",
          body: { email: form.get("email"), password: form.get("password") },
        });
        state.user = data.user;
        state.view = "dashboard";
        state.error = "";
        state.notice = "";
        state.draft = null;
        state.recovery = null;
        render();
        loadView();
      } catch (error) {
        state.error = error.message;
        state.notice = "";
        render();
      }
    };
  }
  const register = document.getElementById("register-form");
  if (register) {
    register.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(register);
      const problem = passwordProblem(form);
      if (problem) {
        keepDraft(register);
        state.error = problem;
        render();
        return;
      }
      try {
        const data = await api("/api/registro", {
          method: "POST",
          body: {
            nombre: form.get("nombre"),
            email: form.get("email"),
            password: form.get("password"),
            confirmacion: form.get("confirmacion"),
            telefono: form.get("telefono"),
            documento: form.get("documento"),
          },
        });
        state.user = data.user;
        state.view = "dashboard";
        state.error = "";
        state.notice = "";
        state.draft = null;
        render();
        loadView();
      } catch (error) {
        keepDraft(register);
        state.error = error.message;
        render();
      }
    };
  }
  const recover = document.getElementById("recover-form");
  if (recover) {
    recover.onsubmit = async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const step = submitter ? submitter.value : "ask";
      const form = new FormData(recover);
      keepDraft(recover);
      try {
        if (step === "confirm") {
          const problem = passwordProblem(form);
          if (problem) {
            state.error = problem;
            render();
            return;
          }
          await api("/api/recuperar/confirmar", {
            method: "POST",
            body: {
              email: form.get("email"),
              codigo: form.get("codigo"),
              password: form.get("password"),
              confirmacion: form.get("confirmacion"),
            },
          });
          state.gate = "login";
          state.recovery = null;
          state.draft = { email: form.get("email"), password: "" };
          state.error = "";
          state.notice = t("recover.done");
          render();
          return;
        }
        const data = await api("/api/recuperar", {
          method: "POST",
          body: { email: form.get("email") },
        });
        state.recovery = { email: form.get("email"), codigo: data.correo_simulado || "" };
        state.draft = { email: form.get("email") };
        state.error = "";
        state.notice = "";
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    };
  }
  const showRegister = document.getElementById("show-register");
  if (showRegister) showRegister.onclick = () => openGate("register");
  const showRecover = document.getElementById("show-recover");
  if (showRecover) showRecover.onclick = () => openGate("recover");
  bindPasswordRules(document);
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
    state.gate = "login";
    state.draft = null;
    state.error = "";
    state.notice = "";
    render();
  };
  const logoutBtn = document.getElementById("logout");
  const logoutMobile = document.getElementById("logout-mobile");
  if (logoutBtn) logoutBtn.onclick = logout;
  if (logoutMobile) logoutMobile.onclick = logout;
  const openAccount = () => {
    state.view = "cuenta";
    render();
    loadView();
  };
  const account = document.getElementById("account");
  const accountMobile = document.getElementById("account-mobile");
  if (account) account.onclick = openAccount;
  if (accountMobile) accountMobile.onclick = openAccount;
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
    cuenta: loadCuenta,
  };
  const fn = loaders[state.view];
  try {
    if (fn) await fn();
  } catch (error) {
    if (state.user) toast(error.message);
  }
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
        <p class="muted">${t("dash.kicker")}</p>
        <h1>${t("dash.title")}</h1>
      </div>
    </div>
    <div class="kpis">
      <div class="card kpi"><span>${t("dash.occupied")}</span><b>${data.ocupados}</b></div>
      <div class="card kpi"><span>${t("dash.sales")}</span><b>${money(data.ventasHoy.total)}</b></div>
      <div class="card kpi"><span>${t("dash.ops")}</span><b>${data.ventasHoy.operaciones}</b></div>
      <div class="card kpi"><span>${data.rol === "cliente" ? t("dash.spend") : t("dash.stockAlerts")}</span><b>${data.rol === "cliente" ? money(data.consumoMes) : (data.stock || []).length}</b></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>${t("dash.presence")}</h2>
        <div class="spaces">
          ${data.espacios
            .map(
              (espacio) => `
            <div class="space ${espacio.presencia}">
              <b>${espacio.nombre}</b>
              <small>${espacio.zona} · ${espacio.tipo}</small>
              ${tag(espacio.presencia)}
              <small>${espacio.ocupante ? `${esc(espacio.ocupante)} ${t("dash.until")} ${espacio.hasta}` : esc(espacio.proxima || t("dash.free"))}</small>
            </div>`
            )
            .join("")}
        </div>
      </section>
      <section class="card panel">
        <h2>${data.rol === "cliente" ? t("dash.yourBookings") : t("dash.nextBookings")}</h2>
        <div class="list">
          ${(data.reservas || [])
            .map(
              (r) => `
            <div class="item">
              <div><b>${r.espacio}</b><br><span class="muted">${r.inicio} → ${r.fin.slice(11)}</span></div>
              <div>${esc(r.cliente || t(`purpose.${r.proposito}`))}<br>${money(r.monto)}</div>
            </div>`
            )
            .join("") || `<div class="empty">${t("dash.noBookings")}</div>`}
        </div>
        ${
          data.serie
            ? `<h2 style="margin-top:18px">${t("dash.sales7")}</h2>
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
        <h2>${t("dash.lowStock")}</h2>
        ${(data.stock || []).map((s) => `<div class="item"><span>${esc(s.nombre)}</span><b>${s.stock} ${esc(s.unidad)}</b></div>`).join("") || `<div class="empty">${t("dash.stockOk")}</div>`}
      </section>
      <section class="card panel">
        <h2>${t("dash.shiftsToday")}</h2>
        ${(data.turnos || []).map((t) => `<div class="item"><span>${t.nombre}<br><small>${t.area}</small></span><span>${t.hora_inicio}–${t.hora_fin}</span></div>`).join("")}
      </section>
      <section class="card panel">
        <h2>${t("dash.permits")}</h2>
        ${(data.permisos || []).map((p) => `<div class="alert">${esc(p.nombre)} ${t("dash.expires")} ${p.vencimiento}</div>`).join("")}
        ${data.costosPendientesTotal != null ? `<div class="item"><span>${t("dash.pendingCosts")}</span><b>${money(data.costosPendientesTotal)}</b></div>` : ""}
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
    <div class="top"><div><p class="muted">${t("space.kicker")}</p><h1>${t("space.title")}</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>${t("space.map")}</h2>
        <div class="spaces">
          ${espacios.espacios
            .map(
              (espacio) => `
            <div class="space ${espacio.presencia}">
              <b>${espacio.nombre}</b>
              <small>${espacio.capacidad} ${t("space.people")} · ${money(espacio.tarifa_hora)}/h</small>
              ${tag(espacio.presencia)}
              ${
                state.user.rol === "admin"
                  ? `<button class="btn ghost small" data-space-state="${espacio.id}" data-next="${espacio.estado === "mantenimiento" ? "disponible" : "mantenimiento"}">${espacio.estado === "mantenimiento" ? t("space.reopen") : t("space.maintain")}</button>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </div>
      </section>
      <section class="card panel">
        <h2>${t("space.new")}</h2>
        <form id="reserva-form" class="stack">
          <label>${t("exp.space")}
            <select name="espacio_id">${espacios.espacios.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select>
          </label>
          ${
            state.user.rol === "cliente"
              ? ""
              : `<label>${t("space.client")}<select name="cliente_id">${clientes.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></label>`
          }
          <div class="row">
            <label>${t("space.start")}<input type="datetime-local" name="inicio" step="1800" required></label>
            <label>${t("space.end")}<input type="datetime-local" name="fin" step="1800" required></label>
          </div>
          <label>${t("space.purpose")}
            <select name="proposito">
              <option value="trabajo">${t("purpose.trabajo")}</option>
              <option value="estudio">${t("purpose.estudio")}</option>
              <option value="reunion">${t("purpose.reunion")}</option>
              <option value="consumo">${t("purpose.consumo")}</option>
            </select>
          </label>
          <label>${t("space.notes")}<input name="notas"></label>
          <button class="btn terra">${t("space.book")}</button>
        </form>
      </section>
    </div>
    <section class="card panel" style="margin-top:16px">
      <h2>${t("space.today")}</h2>
      <table class="table">
        <tr><th>${t("exp.space")}</th><th>${t("space.who")}</th><th>${t("space.when")}</th><th>${t("space.state")}</th><th>${t("space.amount")}</th><th></th></tr>
        ${reservas.reservas
          .map(
            (r) => `<tr>
              <td>${esc(r.espacio)}</td>
              <td>${esc(r.cliente || t("space.experience"))}</td>
              <td>${r.inicio.slice(11)}–${r.fin.slice(11)}</td>
              <td>${tag(r.estado)}</td>
              <td class="money">${money(r.monto)}</td>
              <td>${r.estado === "cancelada" || r.estado === "completada" ? "" : `<button class="btn ghost small" data-cancel-reserva="${r.id}">${t("space.cancel")}</button>`}</td>
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
      toast(result.incluido ? t("space.included") : t("space.created", { amount: money(result.monto) }));
      loadEspacios();
    } catch (error) {
      toast(error.message);
    }
  };
  document.querySelectorAll("[data-cancel-reserva]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/reservas/${btn.dataset.cancelReserva}`, { method: "PATCH", body: { estado: "cancelada" } });
        toast(t("space.cancelled"));
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
    <div class="top"><div><p class="muted">${t("cafe.kicker")}</p><h1>${t("cafe.title")}</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>${t("cafe.menu")}</h2>
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
        <h2>${t("cafe.order")}</h2>
        ${cartItems.length ? cartItems.map((i) => `<div class="item"><span>${i.qty} × ${esc(i.nombre)}</span><b>${money(i.precio * i.qty)}</b></div>`).join("") : `<div class="empty">${t("cafe.empty")}</div>`}
        <div class="item"><span>${t("cafe.total")}</span><b>${money(total)}</b></div>
        <form id="venta-form" class="stack">
          ${
            state.user.rol === "cliente"
              ? ""
              : `<label>${t("cafe.client")}
            <select name="cliente_id">
              <option value="">${t("cafe.counter")}</option>
              ${clientes.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}
            </select>
          </label>`
          }
          <label>${t("cafe.pay")}
            <select name="metodo_pago">
              <option value="efectivo">${t("pay.efectivo")}</option>
              <option value="tarjeta">${t("pay.tarjeta")}</option>
              <option value="transferencia">${t("pay.transferencia")}</option>
            </select>
          </label>
          <label class="checks"><input type="checkbox" name="mayor_edad"> ${t("cafe.age")}</label>
          <button class="btn terra" ${total ? "" : "disabled"}>${t("cafe.charge")}</button>
        </form>
      </section>
    </div>
    ${
      state.user.rol === "cliente"
        ? ""
        : `<div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>${t("cafe.inventory")}</h2>
        <table class="table">
          <tr><th>${t("cafe.supply")}</th><th>${t("cafe.stock")}</th><th>${t("cafe.min")}</th></tr>
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
            <label>${t("cafe.supply")}<select name="insumo_id">${insumos.insumos.map((i) => `<option value="${i.id}">${esc(i.nombre)}</option>`).join("")}</select></label>
            <label>${t("cafe.type")}
              <select name="tipo">
                <option value="entrada">${t("move.entrada")}</option>
                <option value="salida">${t("move.salida")}</option>
                <option value="merma">${t("move.merma")}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label>${t("cafe.qty")}<input name="cantidad" type="number" step="0.1" required></label>
            <label>${t("cafe.reason")}<input name="motivo" required></label>
          </div>
          <button class="btn">${t("cafe.move")}</button>
        </form>
      </section>
      <section class="card panel">
        <h2>${t("cafe.recent")}</h2>
        ${ventas.ventas
          .map(
            (v) => `<div class="item"><div><b>${money(v.total)}</b><br><span class="muted">${v.fecha} · ${t(`pay.${v.metodo_pago}`)}</span></div><span>${(v.items || []).map((i) => `${i.cantidad} ${esc(i.nombre)}`).join(", ")}</span></div>`
          )
          .join("")}
        <h2 style="margin-top:18px">${t("cafe.moves")}</h2>
        ${movimientos.movimientos
          .slice(0, 8)
          .map((m) => `<div class="item"><span>${t(`move.${m.tipo}`)} · ${esc(m.insumo)}</span><b>${m.cantidad} ${esc(m.unidad)}</b></div>`)
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
      toast(t("cafe.sale", { amount: money(result.total) }));
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
        toast(t("cafe.updated"));
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
    <div class="top"><div><p class="muted">${t("exp.kicker")}</p><h1>${t("exp.title")}</h1></div></div>
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
              <div class="muted">${t("exp.staff")}: ${e.empleados.map((x) => esc(x.nombre)).join(", ") || "—"}</div>
              <div class="muted">${t("exp.gear")}: ${e.equipos.map((x) => esc(x.nombre)).join(", ") || "—"}</div>
              <div class="muted">${t("exp.goods")}: ${e.productos.map((x) => `${x.cantidad} ${esc(x.nombre)}`).join(", ") || "—"}</div>
              <div class="item"><span>${t("exp.income")}</span><b>${money(e.ingresos)}</b></div>
              <div class="form-actions">
                ${
                  state.user.rol === "cliente"
                    ? mine
                      ? `<button class="btn ghost small" data-leave="${e.id}">${t("exp.leave")}</button>`
                      : `<button class="btn terra small" data-join="${e.id}">${t("exp.join", { amount: money(e.precio) })}</button>`
                    : `
                    ${e.estado === "programada" || e.estado === "en_curso" ? `<button class="btn small" data-close="${e.id}">${t("exp.close")}</button>` : ""}
                    ${e.estado !== "finalizada" && e.estado !== "cancelada" ? `<button class="btn ghost small" data-cancel-exp="${e.id}">${t("exp.cancel")}</button>` : ""}
                    <select data-add-part="${e.id}"><option value="">${t("exp.add")}</option>${clientes.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select>
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
        <h2>${t("exp.schedule")}</h2>
        <form id="exp-form" class="stack">
          <label>${t("exp.name")}<input name="nombre" required></label>
          <label>${t("exp.description")}<textarea name="descripcion"></textarea></label>
          <label>${t("exp.space")}<select name="espacio_id">${espacios.espacios.map((e) => `<option value="${e.id}">${esc(e.nombre)} (${e.capacidad})</option>`).join("")}</select></label>
          <div class="row">
            <label>${t("exp.start")}<input type="datetime-local" name="inicio" required></label>
            <label>${t("exp.end")}<input type="datetime-local" name="fin" required></label>
          </div>
          <div class="row">
            <label>${t("exp.capacity")}<input type="number" name="capacidad" required></label>
            <label>${t("exp.price")}<input type="number" name="precio" required></label>
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
          <label>${t("exp.product")}
            <select name="producto_id">${productos.productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select>
          </label>
          <label>${t("exp.expected")}<input type="number" name="producto_cantidad" value="6"></label>
          <button class="btn terra">${t("exp.create")}</button>
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
        toast(t("exp.created"));
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
        toast(t("exp.joined"));
        loadExperiencias();
      } catch (error) {
        toast(error.message);
      }
    };
  });
  document.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/experiencias/${btn.dataset.leave}/participantes/${state.user.cliente_id}`, { method: "DELETE" });
      toast(t("exp.left"));
      loadExperiencias();
    };
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/experiencias/${btn.dataset.close}/cerrar`, { method: "POST" });
        toast(t("exp.closed"));
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

async function loadCuenta() {
  paint(`
    <div class="top"><div><p class="muted">${esc(state.user.email)}</p><h1>${t("account.title")}</h1></div></div>
    <section class="card panel" style="max-width:460px">
      <p class="muted">${t("account.lead")}</p>
      <form id="clave-form" class="stack">
        <label>${t("account.current")}<input name="actual" type="password" autocomplete="current-password" required></label>
        <label>${t("field.password")}<input name="password" type="password" autocomplete="new-password" required></label>
        <label>${t("field.password2")}<input name="confirmacion" type="password" autocomplete="new-password" required></label>
        ${rulesHtml()}
        <button class="btn terra">${t("account.save")}</button>
      </form>
    </section>
  `);
  bindPasswordRules(document);
  document.getElementById("clave-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const problem = passwordProblem(form);
    if (problem) {
      toast(problem);
      return;
    }
    try {
      await api("/api/cuenta/clave", {
        method: "POST",
        body: {
          actual: form.get("actual"),
          password: form.get("password"),
          confirmacion: form.get("confirmacion"),
        },
      });
      event.target.reset();
      paintRules(event.target);
      toast(t("account.saved"));
    } catch (error) {
      toast(error.message);
    }
  };
}

async function loadPersonas() {
  const requests = [api("/api/empleados"), api("/api/clientes"), api("/api/turnos")];
  if (state.user.rol === "admin") requests.push(api("/api/usuarios"));
  const [empleados, clientes, turnos, cuentas] = await Promise.all(requests);
  paint(`
    <div class="top"><div><p class="muted">${t("people.kicker")}</p><h1>${t("people.title")}</h1></div></div>
    ${
      state.user.rol === "admin"
        ? `<section class="card panel" style="margin-bottom:16px">
        <h2>${t("people.accounts")}</h2>
        <p class="muted">${t("people.accountsLead")}</p>
        <div class="table-wrap">
          <table class="table">
            <tr><th>${t("people.name")}</th><th>${t("people.email")}</th><th>${t("people.userRole")}</th><th>${t("people.state")}</th><th></th></tr>
            ${cuentas.usuarios
              .map(
                (usuario) => `<tr>
                <td>${esc(usuario.nombre)}${usuario.cargo ? `<br><small>${esc(usuario.cargo)}</small>` : ""}</td>
                <td>${esc(usuario.email)}</td>
                <td>${t(`role.${usuario.rol}`)}</td>
                <td>${tag(usuario.activo ? "activo" : "inactivo")}</td>
                <td>${
                  usuario.id === state.user.id
                    ? `<span class="muted">${t("people.you")}</span>`
                    : `<button class="btn ghost small" data-user="${usuario.id}" data-activo="${usuario.activo ? "false" : "true"}">${usuario.activo ? t("people.deactivate") : t("people.activate")}</button>`
                }</td>
              </tr>`
              )
              .join("")}
          </table>
        </div>
        <form id="user-form" class="stack" style="margin-top:16px">
          <h2>${t("people.create")}</h2>
          <div class="row">
            <label>${t("field.name")}<input name="nombre" required></label>
            <label>${t("field.email")}<input name="email" type="email" required></label>
          </div>
          <div class="row">
            <label>${t("people.password")}<input name="password" type="password" autocomplete="new-password" required></label>
            <label>${t("field.password2")}<input name="confirmacion" type="password" autocomplete="new-password" required></label>
          </div>
          ${rulesHtml()}
          <div class="row">
            <label>${t("field.rol")}
              <select name="rol" id="user-rol">
                <option value="cliente">${t("role.cliente")}</option>
                <option value="empleado">${t("role.empleado")}</option>
                <option value="admin">${t("role.admin")}</option>
              </select>
            </label>
            <label>${t("field.phone")}<input name="telefono"></label>
          </div>
          <div class="role-extra" data-role="cliente">
            <label>${t("field.doc")}<input name="documento"></label>
          </div>
          <div class="role-extra" data-role="empleado" hidden>
            <div class="row">
              <label>${t("people.job")}<input name="cargo"></label>
              <label>${t("people.pay")}<input name="salario" type="number" min="1"></label>
            </div>
            <label>${t("people.startDate")}<input name="fecha_ingreso" type="date"></label>
          </div>
          <button class="btn terra">${t("people.createSubmit")}</button>
        </form>
      </section>`
        : ""
    }
    <div class="grid cols-2">
      <section class="card panel">
        <h2>${t("people.employees")}</h2>
        <table class="table">
          <tr><th>${t("people.name")}</th><th>${t("people.role")}</th><th>${t("people.joined")}</th>${state.user.rol === "admin" ? `<th>${t("people.salary")}</th>` : ""}</tr>
          ${empleados.empleados
            .map(
              (empleado) => `<tr><td>${esc(empleado.nombre)}</td><td>${esc(empleado.cargo)}</td><td>${empleado.fecha_ingreso}</td>${state.user.rol === "admin" ? `<td>${money(empleado.salario)}</td>` : ""}</tr>`
            )
            .join("")}
        </table>
        ${
          state.user.rol === "admin"
            ? `<form id="turno-form" class="stack" style="margin-top:16px">
          <h2>${t("people.shift")}</h2>
          <label>${t("people.employee")}<select name="empleado_id">${empleados.empleados.map((empleado) => `<option value="${empleado.id}">${esc(empleado.nombre)}</option>`).join("")}</select></label>
          <div class="row">
            <label>${t("people.date")}<input type="date" name="fecha" required></label>
            <label>${t("people.area")}<input name="area" required></label>
          </div>
          <div class="row">
            <label>${t("people.start")}<input type="time" name="hora_inicio" required></label>
            <label>${t("people.end")}<input type="time" name="hora_fin" required></label>
          </div>
          <button class="btn">${t("people.saveShift")}</button>
        </form>`
            : ""
        }
      </section>
      <section class="card panel">
        <h2>${t("people.shifts")} ${turnos.fecha}</h2>
        ${turnos.turnos.map((turno) => `<div class="item"><span>${esc(turno.nombre)}<br><small>${esc(turno.area)}</small></span><b>${turno.hora_inicio}–${turno.hora_fin}</b></div>`).join("")}
        <h2 style="margin-top:18px">${t("people.clients")}</h2>
        ${clientes.clientes
          .map(
            (cliente) => `<div class="item"><span>${esc(cliente.nombre)}<br><small>${membershipLabel(cliente)}</small></span><span>${esc(cliente.email)}</span></div>`
          )
          .join("")}
      </section>
    </div>
  `);
  const rol = document.getElementById("user-rol");
  if (rol) {
    rol.onchange = () => {
      document.querySelectorAll(".role-extra").forEach((node) => {
        const visible = node.dataset.role === rol.value;
        node.hidden = !visible;
        node.querySelectorAll("input").forEach((input) => {
          input.required = visible && node.dataset.role === "empleado";
        });
      });
    };
  }
  bindPasswordRules(document);
  document.querySelectorAll("[data-user]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/usuarios/${btn.dataset.user}`, {
          method: "PATCH",
          body: { activo: btn.dataset.activo === "true" },
        });
        toast(t("people.toggled"));
        loadPersonas();
      } catch (error) {
        toast(error.message);
      }
    };
  });
  const userForm = document.getElementById("user-form");
  if (userForm) {
    userForm.onsubmit = async (event) => {
      event.preventDefault();
      const dataForm = new FormData(userForm);
      const problem = passwordProblem(dataForm);
      if (problem) {
        toast(problem);
        return;
      }
      const rolValue = dataForm.get("rol");
      try {
        await api("/api/usuarios", {
          method: "POST",
          body: {
            nombre: dataForm.get("nombre"),
            email: dataForm.get("email"),
            password: dataForm.get("password"),
            confirmacion: dataForm.get("confirmacion"),
            telefono: dataForm.get("telefono"),
            rol: rolValue,
            documento: dataForm.get("documento"),
            cargo: dataForm.get("cargo"),
            salario: rolValue === "empleado" ? Number(dataForm.get("salario")) : undefined,
            fecha_ingreso: dataForm.get("fecha_ingreso"),
          },
        });
        toast(t("people.created"));
        loadPersonas();
      } catch (error) {
        toast(error.message);
      }
    };
  }
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
        toast(t("people.shiftOk"));
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
    <div class="top"><div><p class="muted">${t("gear.kicker")}</p><h1>${t("gear.title")}</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <table class="table">
          <tr><th>${t("gear.item")}</th><th>${t("gear.type")}</th><th>${t("gear.state")}</th><th>${t("gear.space")}</th><th></th></tr>
          ${equipos.equipos
            .map(
              (e) => `<tr>
              <td>${esc(e.nombre)}</td><td>${t(`type.${e.tipo}`)}</td><td>${tag(e.estado)}</td><td>${esc(e.espacio || "—")}</td>
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
        <h2>${t("gear.create")}</h2>
        <form id="eq-form" class="stack">
          <label>${t("gear.name")}<input name="nombre" required></label>
          <label>${t("gear.type")}
            <select name="tipo">
              <option value="tecnologico">${t("type.tecnologico")}</option>
              <option value="mobiliario">${t("type.mobiliario")}</option>
              <option value="produccion">${t("type.produccion")}</option>
              <option value="administracion">${t("type.administracion")}</option>
            </select>
          </label>
          <label>${t("gear.cost")}<input type="number" name="costo" required></label>
          <label>${t("gear.space")}
            <select name="espacio_id">
              <option value="">${t("gear.none")}</option>
              ${espacios.espacios.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}
            </select>
          </label>
          <button class="btn terra">${t("gear.save")}</button>
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
    <div class="top"><div><p class="muted">${t("ops.kicker")}</p><h1>${t("ops.title")}</h1></div></div>
    <div class="grid cols-2">
      <section class="card panel">
        <h2>${t("ops.costs", { period: costos.periodo })}</h2>
        ${costos.costos
          .map(
            (c) => `<div class="item">
            <span>${esc(c.concepto)}<br><small>${esc(c.categoria)} · ${t("ops.due")} ${c.vencimiento || "—"}</small></span>
            <div>
              <b>${money(c.monto)}</b>
              <button class="btn ghost small" data-cost="${c.id}" data-next="${c.estado === "pagado" ? "pendiente" : "pagado"}">${c.estado === "pagado" ? t("ops.markPending") : t("ops.markPaid")}</button>
            </div>
          </div>`
          )
          .join("")}
        <form id="costo-form" class="stack" style="margin-top:16px">
          <div class="row">
            <label>${t("ops.concept")}<input name="concepto" required></label>
            <label>${t("ops.category")}<input name="categoria" value="servicios"></label>
          </div>
          <div class="row">
            <label>${t("ops.amount")}<input type="number" name="monto" required></label>
            <label>${t("ops.dueDate")}<input type="date" name="vencimiento"></label>
          </div>
          <button class="btn">${t("ops.addCost")}</button>
        </form>
      </section>
      <section class="card panel">
        <h2>${t("ops.permits")}</h2>
        ${permisos.permisos.map((p) => `<div class="item"><span>${p.nombre}<br><small>${p.entidad} · ${p.numero || ""}</small></span><div>${tag(p.estado)}<br>${p.vencimiento}</div></div>`).join("")}
        <form id="perm-form" class="stack" style="margin-top:16px">
          <label>${t("ops.permitName")}<input name="nombre" required></label>
          <label>${t("ops.entity")}<input name="entidad" required></label>
          <div class="row">
            <label>${t("ops.number")}<input name="numero"></label>
            <label>${t("ops.expires")}<input type="date" name="vencimiento" required></label>
          </div>
          <button class="btn">${t("ops.savePermit")}</button>
        </form>
        <h2 style="margin-top:18px">${t("ops.suppliers")}</h2>
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
  const { rango, desde, hasta } = state.reporte;
  const query = new URLSearchParams({ rango });
  if (rango === "custom" && desde && hasta) {
    query.set("desde", desde);
    query.set("hasta", hasta);
  }
  let data;
  try {
    data = await api(`/api/reportes?${query}`);
  } catch (error) {
    toast(error.message);
    return;
  }
  const maxFlow = Math.max(...(data.flujo || []).map((d) => Math.max(d.ingresos, d.egresos)), 1);
  const maxHour = Math.max(...data.demanda.map((d) => d.reservas + d.ventas), 1);
  const ranges = ["hoy", "7d", "21d", "mes", "custom"];
  const period = rango === "custom" ? (state.lang === "en" ? `${data.desde} to ${data.hasta}` : `${data.desde} a ${data.hasta}`) : t(`period.${data.rango}`);
  paint(`
    <div class="top">
      <div>
        <p class="muted">${period}</p>
        <h1>${t("rep.title")}</h1>
      </div>
      <div class="filters">
        ${ranges.map((id) => `<button class="filter ${rango === id ? "active" : ""}" data-rango="${id}">${t(`range.${id}`)}</button>`).join("")}
      </div>
    </div>
    ${
      rango === "custom"
        ? `<form id="rango-form" class="filters" style="margin-bottom:16px">
            <label>${t("range.from")}<input type="date" name="desde" value="${desde || data.desde}" required></label>
            <label>${t("range.to")}<input type="date" name="hasta" value="${hasta || data.hasta}" required></label>
            <button class="btn terra small">${t("range.apply")}</button>
          </form>`
        : ""
    }
    <div class="kpis">
      <div class="card kpi"><span>${t("rep.income")}</span><b>${money(data.ingresos.total)}</b></div>
      <div class="card kpi"><span>${t("rep.expense")}</span><b>${money(data.egresos.total)}</b></div>
      <div class="card kpi"><span>${t("rep.margin")}</span><b>${money(data.margenRealizado)}</b></div>
      <div class="card kpi"><span>${t("rep.occupancy")}</span><b>${data.ocupacionPromedio}%</b></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>${t("rep.flow")}</h2>
        <div class="flow">
          ${(data.flujo || [])
            .map(
              (d) => `<div class="flow-col">
                <div class="in" style="height:${Math.max(4, (d.ingresos / maxFlow) * 110)}px"></div>
                <div class="out" style="height:${Math.max(4, (d.egresos / maxFlow) * 110)}px"></div>
                <span>${d.dia.slice(8)}</span>
              </div>`
            )
            .join("")}
        </div>
        <div class="legend"><span><i class="in"></i>${t("rep.income")}</span><span><i class="out"></i>${t("rep.expense")}</span></div>
      </section>
      <section class="card panel">
        <h2>${t("rep.breakdown")}</h2>
        <div class="item"><span>${t("rep.sales")}</span><b>${money(data.ingresos.ventas)}</b></div>
        <div class="item"><span>${t("rep.bookingsDone")}</span><b>${money(data.ingresos.reservasRealizadas)}</b></div>
        <div class="item"><span>${t("rep.expDone")}</span><b>${money(data.ingresos.experienciasRealizadas)}</b></div>
        <div class="item"><span>${t("rep.supplies")}</span><b>${money(data.egresos.insumos)}</b></div>
        <div class="item"><span>${t("rep.fixed")}</span><b>${money(data.egresos.fijos)}</b></div>
        <div class="item"><span>${t("rep.expGoods")}</span><b>${money(data.egresos.experiencias)}</b></div>
        ${
          data.ingresos.reservasPrevistas || data.ingresos.experienciasPrevistas
            ? `<p class="muted" style="margin-top:12px">${t("rep.pending", { bookings: money(data.ingresos.reservasPrevistas), events: money(data.ingresos.experienciasPrevistas) })}</p>`
            : ""
        }
      </section>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>${t("rep.use")}</h2>
        ${data.utilizacion.map((u) => `<div class="item"><span>${u.nombre}</span><b>${u.porcentaje}% · ${u.horas} h</b></div>`).join("")}
      </section>
      <section class="card panel">
        <h2>${t("rep.demand")}</h2>
        <div class="chart">${data.demanda
          .map((d) => `<div class="bar" style="height:${Math.max(6, ((d.reservas + d.ventas) / maxHour) * 120)}px"><span>${d.hora}</span></div>`)
          .join("")}</div>
      </section>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card panel">
        <h2>${t("rep.products")}</h2>
        ${data.topProductos.map((p) => `<div class="item"><span>${esc(p.nombre)} · ${p.cantidad}</span><b>${money(p.ingresos)}</b></div>`).join("") || `<div class="empty">${t("rep.emptySales")}</div>`}
      </section>
      <section class="card panel">
        <h2>${t("rep.profit")}</h2>
        ${
          data.experiencias
            .map(
              (e) => `<div class="item"><span>${esc(e.nombre)}<br><small>${e.participantes}/${e.capacidad} · ${t(`status.${e.estado}`)}</small></span><b>${money(e.margen)}</b></div>`
            )
            .join("") || `<div class="empty">${t("rep.emptyExp")}</div>`
        }
      </section>
    </div>
  `);
  document.querySelectorAll("[data-rango]").forEach((btn) => {
    btn.onclick = () => {
      state.reporte.rango = btn.dataset.rango;
      if (btn.dataset.rango === "custom" && !state.reporte.desde) {
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
        const iso = (date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        state.reporte.desde = iso(start);
        state.reporte.hasta = iso(end);
      }
      loadReportes();
    };
  });
  const form = document.getElementById("rango-form");
  if (form) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const dataForm = new FormData(form);
      state.reporte.rango = "custom";
      state.reporte.desde = dataForm.get("desde");
      state.reporte.hasta = dataForm.get("hasta");
      loadReportes();
    };
  }
}

boot().then(loadView);
