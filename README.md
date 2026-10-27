# Kairo

Sistema de información para un establecimiento híbrido de coworking, cafetería y experiencias
sociales.

## Arquitectura

Monorepo con tres procesos separados, cada uno en su propio contenedor:

| Servicio  | Tecnología              | Puerto | Responsabilidad                            |
| --------- | ----------------------- | ------ | ------------------------------------------ |
| `db`      | PostgreSQL 16 (Alpine)  | 5433   | Datos; esquema gestionado con Prisma       |
| `backend` | Node 20 + Express 4    | 3001   | API REST, autenticación, lógica de negocio |
| `frontend`| Vite + React 18 + TS    | 8080   | SPA servida por nginx, con proxy a `/api`  |

```
kairo/
├── docker/
│   ├── backend.Dockerfile      # build multi-etapa, imagen final sin devDeps
│   ├── frontend.Dockerfile
│   └── backend-entrypoint.sh   # aplica migraciones y luego arranca la API
├── docker-compose.yml
├── Makefile                    # atajos de desarrollo
├── .env.example
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # fuente de verdad del modelo
│   │   ├── migrations/         # historial ejecutable
│   │   └── seed.ts             # datos de demostración (idempotente)
│   ├── src/
│   │   ├── config/             # env validado con Zod + logger con redacción de PII
│   │   ├── lib/                # prisma, tokens, errores tipados, lógica de dominio
│   │   ├── middleware/         # auth, roles, rate limit, errores, async handler
│   │   └── modules/            # un directorio por dominio (health, auth, espacios…)
│   └── tests/{unit,integration}/
└── frontend/
    ├── src/
    │   ├── app/                 # router, providers, límite de errores
    │   ├── features/            # una carpeta por módulo de negocio
    │   ├── lib/                 # cliente HTTP con refresh y CSRF
    │   └── styles/              # tokens de diseño + Tailwind
    └── tests/{unit,e2e}/
```

Cada módulo del backend sigue la misma forma: `routes.ts` (HTTP y guards),
`service.ts` (reglas de negocio) y `schema.ts` (validación Zod). El frontend
consume la API sin conocer nada de la base de datos.

## Puesta en marcha

Requisitos: Docker con Compose v2. Node 20 y pnpm solo hacen falta para
desarrollar sin contenedores.

```bash
cp .env.example .env
# Genera tres secretos distintos (mínimo 32 caracteres cada uno):
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
openssl rand -base64 48   # -> CSRF_SECRET
# Edita .env y pega cada valor.

make up
```

`make up` construye las imágenes, espera a que los tres servicios estén sanos,
aplica las migraciones y siembra los datos si la base está vacía.

| URL                                     | Qué es                          |
| --------------------------------------- | ------------------------------- |
| http://localhost:8080                   | Aplicación web                  |
| http://localhost:3001/api/health/ready | Sonda de salud de la API        |

### Cuentas de demostración

Contraseña para todas: `kairo123`

| Correo                 | Rol      | Uso                                |
| ---------------------- | -------- | ---------------------------------- |
| `admin@kairo.local`    | admin    | Dirección: todo permitido          |
| `barista@kairo.local`  | empleado | Personal de cafetería              |
| `valentina@kairo.local`| cliente  | Cliente con membresía mensual      |
| `inactivo@kairo.local` | cliente  | Cuenta desactivada (login rechazado) |

## Comandos habituales

```bash
make help        # lista todos los objetivos
make up          # levanta todo
make down        # detiene conservando los datos
make destroy     # detiene y borra el volumen de la base
make db-reset    # recrea la base desde cero y siembra
make logs        # sigue los logs de los tres servicios
make check       # lint + typecheck + tests en ambos paquetes
make test-e2e    # pruebas de extremo a extremo (requiere el stack en marcha)
make dev-api     # API con recarga en caliente (contra la base local)
make dev-web     # web con recarga en caliente
make psql        # consola de la base de datos
```

## Modelo de datos

`schema.prisma` traduce el modelo original a PostgreSQL. Los `CHECK` de SQLite
se volvieron enumeraciones de Prisma, y las claves primarias compuestas
(`recetas`, `experiencia_*`) se modelaron como `@id([...])`.

Grupos de entidades:

- **Identidad**: `usuarios`, `empleados`, `clientes`, `sesiones_refresh`, `recuperaciones`
- **Espacios**: `espacios`, `reservas` (con índices para solapamientos)
- **Cafetería**: `proveedores`, `insumos`, `productos`, `recetas`, `ventas`,
  `venta_items`, `movimientos_inventario`
- **Experiencias**: `experiencias` y sus cuatro tablas de vinculación
- **Operación**: `costos`, `permisos`, `turnos`, `equipos`

## Autenticación

Modelo híbrido, adecuado para una SPA sobre el mismo origen:

- **Access token**: JWT HS256 de 15 minutos, firmado con `JWT_ACCESS_SECRET`.
  Vive en `sessionStorage`, no en `localStorage`, para que un XSS no lo persista.
- **Refresh token**: valor opaco de 48 bytes, no JWT. Se guarda **hasheado**
  (SHA-256) en `sesiones_refresh`, en cookie `HttpOnly`, `SameSite=Lax` y con
  `Path=/api/auth`, de modo que no viaja a cada petición.
- **Rotación con detección de reuso**: al refrescar se emite un token nuevo
  encadenado por familia. Presentar un token ya rotado revoca la familia
  completa: es la señal de que alguien copió la credencial.
- **CSRF**: doble cookie. El backend firma una cookie legible por JavaScript y el
  cliente la copia a la cabecera `X-XSRF-TOKEN` en cada escritura. El backend
  comprueba que la cabecera y la cookie coincidan y que el token esté firmado
  para el usuario de la sesión.
- **RBAC**: `requireAuth` deja el payload en `req.auth`; `requireRole(...)` lo
  restringe. Solo `admin` escribe espacios.
- **Identidad efectiva**: `identidadDeUsuario` resuelve el perfil asociado al
  token. El discriminante es explícito, no un `null` ambiguo: una cuenta con
  rol `cliente` sin perfil de cliente se rechaza con 403 en vez de tratarse
  como personal.
- **Rate limit**: 10 intentos por ventana en `/auth/login` (solo los fallidos se
  cuentan), 100 en el resto de la API.

## Seguridad

- Helmet: `X-Content-Type-Options`, `X-Frame-Options`, HSTS, `Referrer-Policy: no-referrer`.
- CORS con lista blanca explícita; un origen no permitido se rechaza con 403.
- Validación Zod en el borde: los 422 devuelven el detalle por campo.
- Errores tipados (`AppError` y derivados). Los 5xx nunca filtran el motivo al
  cliente; se registran con su stack.
- Logs con `pino` y redacción de cookies, contraseñas, tokens, teléfonos y documentos.
- La configuración se valida al arrancar: un secreto corto o repetido detiene el
  proceso con un mensaje explícito en lugar de fallar en runtime.
- El contenedor corre como usuario no root (`kairo`, uid 1001) con `tini` como PID 1.
- **El panel y la agenda filtran por rol**: un cliente no recibe el inventario,
  los permisos, los turnos del personal ni la caja del día. Tampoco ve la receta
  de los productos: es información de costos.

## API

Rutas bajo `/api`. Todas exigen `Authorization: Bearer <token>` salvo `health`
y `auth/login`.

| Ruta                        | Método        | Acceso          | Qué hace                                    |
| --------------------------- | ------------- | --------------- | ------------------------------------------- |
| `/api/health/live`          | GET           | público         | El proceso responde                         |
| `/api/health/ready`         | GET           | público         | El proceso responde y la base de datos también |
| `/api/auth/login`           | POST          | público         | Inicia sesión; devuelve access token y cookies |
| `/api/auth/refresh`         | POST          | cookie refresh  | Rota el refresh token y renueva el acceso   |
| `/api/auth/logout`          | POST          | cookie refresh  | Revoca la sesión                            |
| `/api/auth/me`              | GET           | autenticado     | Usuario de la sesión actual                 |
| `/api/agenda`               | GET           | autenticado     | Agenda del día; un cliente solo ve la suya  |
| `/api/dashboard`            | GET           | autenticado     | Panel con métricas; cambia según el rol    |
| `/api/usuarios`             | GET POST PATCH| admin           | Cuentas y sus perfiles                      |
| `/api/espacios`             | GET POST PATCH DELETE | autenticado / admin | Espacios del local                 |
| `/api/reservas`             | GET POST PATCH| autenticado     | Reservas; un cliente solo ve las suyas      |
| `/api/clientes`             | GET PATCH     | admin, empleado | Base de clientes y membresías               |
| `/api/turnos`               | GET POST      | admin, empleado / admin | Turnos del personal                  |
| `/api/empleados`            | GET           | admin, empleado | Personal; el salario solo lo ve la dirección |
| `/api/productos`            | GET POST PATCH| autenticado / personal | Catálogo y recetas                   |
| `/api/insumos`              | GET POST      | admin, empleado | Inventario y proveedores de insumos         |
| `/api/movimientos`          | GET POST      | admin, empleado | Entradas, salidas y mermas                  |
| `/api/proveedores`          | GET POST      | admin, empleado | Proveedores                                 |
| `/api/ventas`               | GET POST      | admin, empleado / autenticado | Caja y registro de ventas       |
| `/api/pedidos`              | POST          | autenticado     | Pedido al mostrador; el cliente pide a su nombre |
| `/api/pedidos/disponibilidad` | GET         | autenticado     | Cuántas unidades quedan de cada producto    |
| `/api/experiencias`          | GET POST      | autenticado / personal | Experiencias, participantes, cierre y cancelación |
| `/api/equipos`              | GET POST PATCH| admin, empleado | Equipos del local                           |
| `/api/costos`               | GET POST PATCH| admin           | Costos y obligaciones                       |
| `/api/permisos`             | GET POST      | admin           | Licencias y permisos vigentes                |
| `/api/reportes`             | GET           | admin           | Reporte de ingresos, egresos y margen        |
| `/api/exportaciones`        | GET           | admin, personal | Descarga de CSV de ventas, reservas e inventario |

Los errores siempre llegan con la misma forma:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

`code` es estable y el frontend lo traduce; `message` es para el registro y los
mensajes de consola.

## Reglas de negocio

- **Horarios**: las reservas van de 07:00 a 23:00, en bloques de 30 minutos,
  entre 1 y 14 horas, siempre dentro del mismo día. Los turnos siguen las
  mismas reglas de bloque y horario. No se admiten reservas en el pasado.
- **Precio de reserva**: por hora del espacio, según su tarifa. Un puesto
  covered por membresía vigente no se cobra. Un evento no se cobra por hora:
  se cobra por el producto de la experiencia.
- **Solapamientos**: un espacio no admite dos reservas activas en el mismo
  tramo; una persona no puede estar en dos experiencias a la vez; un equipo no
  puede estar comprometido dos veces; los turnos de una persona no se cruzan.
- **Inventario**: una venta descuenta el stock de los insumos de la receta del
  producto, dentro de la misma transacción. Ni una venta ni una salida pueden
  dejar el stock en negativo.
- **Alcohol**: una venta con bebidas alcohólicas exige confirmar la mayoría de
  edad del cliente.
- **Experiencias**: al crearse, generan la reserva que bloquea su espacio; al
  cancelarse, la liberan.
- **Estado de una reserva**: se deriva del horario, no de un campo que nadie
  actualiza. Una reserva vencida queda `completada` y cuenta como ingreso
  realizado; el reporte la barrer antes de medir.

## Reportes

`GET /api/reportes?rango=<hoy|7d|21d|mes|custom>&desde=&hasta=` (solo dirección).

El reporte tiene tres partes que conviene entender:

- **Ingresos**: ventas de cafetería, reservas realizadas (completadas o en
  curso) y lo previsto (reservas confirmadas, que aún no se ha facturado).
  Las experiencias aportan por participantes, no por venta.
- **Egresos**: costos fijos **prorrateados** al período analizado, costo de los
  insumos consumidos y costo de productos de las experiencias realizadas.
- **Margen**: ingresos totales menos egresos totales.

Dos decisiones de cálculo que importan:

- **El prorrateo** reparte los costos mensuales sobre el período. Un arriendo
  de $8.500.000 en un mes de 31 días, analizado en 21, aporta $5.758.065. Sin
  esto, un reporte de una semana mostraría el arriendo completo y el margen
  saldría falseado.
- **El costo de insumos usa el factor de conversión de unidades**. El café se
  compra por kilo ($4.200) pero se consume por gramo: 18 g de café costan
  18 × 4,20 = $75,60, no 18 × 4.200 = $75.600. El factor vive en
  `insumos.factor_conversion` y sin él el margen de la cafetería salía
  desfigurado: 6.664.000 de ingresos contra 307 millones de egresos.

## Convenciones

- **TypeScript estricto** en ambos paquetes, con `noUncheckedIndexedAccess`.
- **ESLint 9** en configuración plana, incluyendo `no-floating-promises` con
  información de tipos (detecta promesas olvidadas).
- **Prettier** con ancho 100 y comillas dobles.
- **Vitest** para unidad e integración; las pruebas de API usan la base real, sin
  simulacros de Prisma.
- **Playwright** para el recorrido completo contra el stack en Docker.
- **Errores explícitos**: nada de `catch` que trague excepciones ni de
  `try/catch` con retorno silencioso.

## Notas de operación

Detalles que cuesta descubrir y conviene documentar:

- **La zona horaria debe ser la misma en todos los procesos.** Base, API y web
  usan `TZ` (por defecto `America/Bogota`). Si difieren, una fecha local se
  guarda desplazada un día: un turno creado "el 27" aparece como "el 26".
  Los turnos se almacenan en UTC a medianoche (`lib/fechas.ts`) porque son un
  día sin hora; las marcas de tiempo de los eventos usan hora local.
- **El contenedor aplica las migraciones al arrancar.** `docker/backend-entrypoint.sh`
  ejecuta `prisma migrate deploy` antes de levantar la API, de modo que el
  esquema siempre corresponde al binario desplegado. Con varias réplicas este
  paso debe serializarse.
- **Prisma en Alpine necesita dos elementos**: `openssl` en la imagen (el motor
  de consulta lo carga en tiempo de ejecución) y el binario de musl en
  `binaryTargets`. El `schema-engine` de la plataforma anfitriona no sirve, así
  que el build lo descarga aparte en `/opt/prisma-engines`.
- **`prisma` es dependencia de producción**, no de desarrollo: `migrate deploy`
  la necesita dentro del contenedor.
- **pnpm 12 verifica políticas de supply-chain** sobre el lockfile completo
  antes de instalar. Con red lenta esa comprobación puede quedarse esperando
  minutos; se desactiva en `pnpm-workspace.yaml` con `verifyDepsBeforeRun: false`.
- **`make wait` tiene tiempo máximo** (`WAIT_TIMEOUT`, 180 s por defecto) y
  muestra los logs del servicio que falló en vez de esperar indefinidamente.
- **Los rate limits se miden por IP.** La suite e2e hace muchas peticiones
  desde la misma dirección, así que con los límites normales (10 intentos
  fallidos de login y 100 peticiones en el resto de la API) se bloquearía a sí
  misma. `make test-e2e` levanta el backend con `RELAJAR_RATE_LIMIT=true`; en
  producción esa variable está en `false` y los límites se aplican con
  normalidad.
- **Los insumos tienen dos unidades**: la del stock (`g`, `ml`, `un`) y la de
  compra (`kg`, `L`, `unidad`). El campo `factor_conversion` dice cuántas
  unidades de stock hay en una unidad de compra. Sin él, el costo de insumos
  sale inflado por mil.

## Estado del proyecto

- [x] **Fase 0 — Andamiaje**: monorepo, contenedores, esquema Prisma y migración
      inicial, semilla de demostración, endurecimiento de seguridad, lint y tipos
      estrictos, pruebas y documentación.
- [x] **Fase 1 — Backend funcional**: los 16 módulos de dominio del sistema
      original portados a Express con servicios tipados, validación Zod y
      agregaciones en SQL. 164 pruebas cubren reglas de negocio, RBAC y casos
      límite.
- [x] **Fase 2 — Interfaz base**: shell con navegación por rol, componentes
      shadcn/Radix, tablas con orden y filtro, formularios con validación en el
      cliente, i18n es/en con 536 claves, y 20 pruebas de extremo a extremo que
      comprueban el camino completo del navegador hasta Postgres.
- [x] **Fase 3 — Reportes**: módulo de reportes con agregaciones en SQL:
  ingresos (ventas, reservas realizadas y previstas, experiencias), egresos
  (costos fijos prorrateados, insumos, experiencias), margen, ocupación,
  utilización por espacio, demanda por hora, flujo diario y top de productos.
  La pantalla muestra gráficos (Recharts) y tablas con filtro.

El sistema anterior (Node/Express + SQLite y frontend vanilla) ya fue migrado por
completo: sus 23 tablas, 15 restricciones `CHECK` y su semilla de demostración
existen ahora en el esquema de Prisma y en `prisma/seed.ts`. El código antiguo
se eliminó del repositorio.

## Interfaz

La aplicación es una SPA en React 18 con Vite. La estructura sigue una regla
simple: un directorio por módulo de negocio, en `src/features/`.

```
frontend/src/
├── app/                 # router, layout, navegación por rol
├── components/ui/       # primitivos (shadcn sobre Radix) y componentes propios
├── features/            # una carpeta por módulo: dashboard, espacios, reservas…
├── i18n/                # diccionarios es.json y en.json
├── lib/                 # cliente HTTP, tipos del dominio, utilidades
└── styles/              # tokens de diseño y Tailwind
```

Decisiones que conviene conocer:

- **Los formularios son HTML nativo.** Se leen con `FormData` y se envían
  como `FormData`. El componente `SelectCampo` envuelve el `Select` de Radix
  con un `<input type="hidden">` porque Radix no genera un `<select>` nativo
  y su valor no viajaría en el `FormData`.
- **El access token vive en `sessionStorage`**, no en `localStorage`: se
  descarta al cerrar la pestaña y no queda expuesto ante un XSS persistente.
  El refresh token está en una cookie `HttpOnly` que el JavaScript no ve.
- **La navegación declara los roles de cada enlace** en `app/navegacion.ts`,
  la misma fuente que usa el router. Un usuario nunca ve un enlace que el
  backend le vaya a rechazar.
- **Los estados se traducen con la clave `status.*`**, no con el valor crudo
  de la API. `BadgeEstado` asigna además el color según la semántica.
- **Las tablas fijan arriba la fila recién creada** (`destacado`), para que el
  usuario vea el resultado de su acción aunque la tabla esté paginada.
- **El i18n tiene 536 claves** en español e inglés, extraídas del sistema
  original y ampliadas con las de los módulos nuevos. Todas están verificadas
  contra el código: no hay claves huérfanas ni referenciadas sin traducir.