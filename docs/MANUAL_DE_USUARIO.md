# Manual de usuario de Kairo

Kairo es el sistema de gestión de un establecimiento que combina **coworking,
cafetería y experiencias sociales**. Reúne en una sola aplicación las reservas
de espacios, los pedidos de la cafetería, el inventario, el personal, los
equipos y los costos, y los muestra en un tablero y en reportes.

Este manual explica cómo usar la aplicación desde el navegador. Para instalarla
o desarrollarla, consulta el [README](../README.md).

## Contenido

1. [Cómo entrar](#1-cómo-entrar)
2. [Roles: qué ve y qué puede hacer cada persona](#2-roles-qué-ve-y-qué-puede-hacer-cada-persona)
3. [Cómo se ve la aplicación](#3-cómo-se-ve-la-aplicación)
4. [Guía por pantalla](#4-guía-por-pantalla)
5. [Tareas paso a paso](#5-tareas-paso-a-paso)
6. [Reglas que verás en funcionamiento](#6-reglas-que-verás-en-funcionamiento)
7. [Mensajes frecuentes y qué hacer](#7-mensajes-frecuentes-y-qué-hacer)
8. [Limitaciones de esta versión](#8-limitaciones-de-esta-versión)

---

## 1. Cómo entrar

1. Abre la dirección de la aplicación en el navegador. Si la instalaste con
   Docker en tu propio equipo, es `http://localhost:8080` (o el puerto que hayas
   configurado en `FRONTEND_PORT`).
2. Escribe tu **correo** y tu **contraseña** y pulsa **Entrar**.
3. Para salir, usa el botón **Salir** que está al final de la barra lateral.

Cierra siempre la sesión al terminar, sobre todo si usas un equipo compartido.

### Cuentas de demostración

Si la base se sembró con los datos de ejemplo, puedes entrar con estas cuentas.
La contraseña de todas es `kairo123`.

| Correo | Rol | Para qué sirve |
| --- | --- | --- |
| `admin@kairo.local` | Dirección | Ve y administra todo |
| `barista@kairo.local` | Personal | Atiende la cafetería y consulta la operación |
| `valentina@kairo.local` | Cliente | Reserva espacios y hace pedidos |

> Las cuentas de demostración existen solo para probar. En un uso real, cámbialas
> o desactívalas.

---

## 2. Roles: qué ve y qué puede hacer cada persona

Kairo tiene tres roles. Lo que aparece en el menú lateral depende de tu rol: no
verás enlaces a pantallas que no te corresponden.

| Pantalla | Dirección | Personal | Cliente |
| --- | :---: | :---: | :---: |
| Tablero | Completo | Operativo (sin costos) | Solo lo suyo |
| Hoy | ✔ | ✔ | ✔ |
| Espacios | Ver, crear y editar | Ver | Ver |
| Reservar | ✔ | ✔ | ✔ (las suyas) |
| Pedir | ✔ | ✔ | ✔ |
| Cafetería (productos) | Ver, crear y editar | Ver | — |
| Inventario | ✔ | ✔ | — |
| Ventas | ✔ | ✔ | — |
| Experiencias | ✔ | ✔ | ✔ |
| Personas | Ver y añadir | Ver (sin salarios) | — |
| Clientes | ✔ | ✔ | — |
| Turnos | ✔ | ✔ | — |
| Equipos | ✔ | ✔ | — |
| Operación (costos y permisos) | ✔ | — | — |
| Reportes | ✔ | — | — |

Un cliente solo ve sus propias reservas y su propio consumo. Los datos internos
del negocio (ventas del local, inventario, salarios, costos) están reservados
al personal y a la dirección.

---

## 3. Cómo se ve la aplicación

- **Barra lateral (izquierda):** el menú, agrupado en *Principal*, *Cafetería*,
  *Experiencias* y *Gestión*. Se queda fija al desplazarte por la página. El
  botón de la esquina superior la contrae a solo íconos.
- **Cabecera (arriba):** el botón del **idioma** (español o inglés). En el celular,
  el menú se abre con el botón de las tres rayas.
- **Tablas:** casi todas las listas tienen:
  - un cuadro de **búsqueda** que filtra mientras escribes;
  - **encabezados ordenables**: pulsa uno para ordenar y otra vez para invertir;
  - **paginación** al pie cuando hay muchas filas;
  - el número de resultados encontrados.
- **Formularios:** se abren en una ventana emergente. Si el formulario es largo,
  la ventana se desplaza.
- **Avisos:** al guardar o fallar una acción aparece un mensaje breve en una
  esquina de la pantalla.

### Cambiar el idioma

Pulsa el botón de idioma de la cabecera y elige **Español** o **English**. La
elección se recuerda en ese navegador. Los datos que escribió el negocio (por
ejemplo, el nombre de un producto) se muestran tal cual; los textos de la
aplicación y los datos de ejemplo se traducen.

---

## 4. Guía por pantalla

### Tablero
La vista de resumen al entrar.

- **Dirección y personal:** ventas del día (total y número de operaciones),
  espacios ocupados y porcentaje de ocupación, insumos por debajo del mínimo,
  un gráfico de ventas de los últimos días, la ocupación de cada espacio, las
  próximas reservas, los turnos de hoy, el inventario por reponer y los
  permisos próximos a vencer. Los **costos pendientes** los ve solo la dirección.
- **Cliente:** su consumo del mes, la ocupación de los espacios, sus próximas
  reservas y las experiencias disponibles.

### Hoy
La agenda del día: la ocupación y las horas reservadas de cada espacio, las
reservas del día, las experiencias y los turnos del personal.

### Espacios
El catálogo de espacios del local: puestos, salas, mesas y el espacio de eventos.
Cada uno muestra su tipo, zona, capacidad, tarifa por hora y estado
(disponible o en mantenimiento).

- La **dirección** puede crear espacios y editarlos con el ícono del lápiz.

### Reservar
Las reservas de espacios, filtradas por día.

- Muestra el horario, el espacio, el cliente, el propósito, el total, el estado
  y la opción de cancelar.
- Una reserva **incluida** no se cobra: la cubre una membresía vigente.
- Las reservas que pertenecen a una **experiencia** (propósito *Evento*) no se
  cancelan desde aquí: se gestionan desde la experiencia.

### Pedir
El menú de la cafetería para hacer un pedido. Los productos aparecen por
categoría (bebidas, alimentos, servicios). Los que no tienen existencias se
marcan como **Sin existencias** y no se pueden pedir. Las bebidas con alcohol
llevan la etiqueta **+18**.

### Cafetería (productos)
*Solo dirección y personal.* La lista de productos y servicios con su categoría,
precio y receta (los insumos que consume cada uno).

- La **dirección** puede crear productos y servicios y editarlos.

### Inventario
*Solo dirección y personal.* El nivel de existencias de cada insumo frente a su
mínimo, su proveedor, y el historial de movimientos (entradas, salidas y mermas)
con su motivo.

### Ventas
*Solo dirección y personal.* Las últimas ventas, con fecha, productos, cliente,
quién atendió, medio de pago y total.

### Experiencias
Los eventos y actividades: espacio, horario, participantes frente a la capacidad
y estado. Cada experiencia bloquea su espacio durante su horario.

### Personas
*Solo dirección y personal.* El equipo de trabajo: nombre, cargo, correo,
teléfono, fecha de ingreso y, solo para la dirección, el salario.

- La **dirección** puede añadir nuevas personas al equipo.

### Clientes
*Solo dirección y personal.* Los clientes del local, su documento, su tipo de
membresía (ninguna, día o mensual) y cuándo vence.

### Turnos
*Solo dirección y personal.* Los turnos del personal del día: horario, persona,
cargo y área.

### Equipos
*Solo dirección y personal.* El inventario de equipos (portátiles, proyector,
equipo de sonido, máquinas de la cafetería…) con su tipo, estado, ubicación y
costo.

### Operación
*Solo dirección.* Dos listas: los **costos** del negocio (arriendo, servicios,
obligaciones), con el total pendiente de pago, y los **permisos de
funcionamiento** con su entidad, número, vencimiento y estado.

### Reportes
*Solo dirección.* El análisis del negocio en un período:

- **Ingresos**, **egresos** y **margen** (ingresos menos egresos).
- **Ocupación** promedio de puestos y salas.
- Gráfico de ingresos y egresos por día (los ingresos en verde, los egresos en rojo).
- **Demanda por hora:** reservas y ventas en cada hora de atención.
- **Productos con más ingresos.**
- Detalle de los egresos.
- Botón **Descargar** para exportar a CSV: reporte diario, ventas, reservas e
  inventario.

---

## 5. Tareas paso a paso

### Hacer una reserva
1. Ve a **Reservar** y pulsa **Nueva reserva**.
2. Elige el **espacio**, el **propósito** (trabajo, estudio, reunión o consumo)
   y, si eres personal, el **cliente**.
3. Indica el **inicio** y el **fin**. Las reservas son de 07:00 a 23:00, en
   bloques de 30 minutos, de 1 a 14 horas y dentro del mismo día.
4. Añade **notas** si quieres y guarda.

Si el espacio ya está ocupado en ese tramo, o la fecha ya pasó, la aplicación te
lo indica y no crea la reserva.

### Cancelar una reserva
1. En **Reservar**, ubica la reserva.
2. Pulsa el ícono de cancelar al final de la fila.

Solo se pueden cancelar reservas confirmadas o en curso que no pertenezcan a una
experiencia.

### Hacer un pedido en la cafetería
1. Ve a **Pedir** y elige productos con el botón **Agregar**.
2. Pulsa **Ver pedido** para revisar las cantidades.
3. Elige el **medio de pago** (efectivo, tarjeta o transferencia).
4. Si el pedido incluye alcohol, marca la casilla que confirma que el cliente es
   **mayor de 18 años**. Sin ella no se puede confirmar.
5. Pulsa **Confirmar pedido**.

El pedido se registra como una venta y descuenta las existencias de los insumos
de cada receta.

### Crear un espacio *(dirección)*
1. En **Espacios**, pulsa **Nuevo espacio**.
2. Completa nombre, tipo, zona, capacidad y tarifa por hora, y guarda.
3. El espacio nuevo aparece fijado arriba de la tabla.

Para cambiar uno existente, pulsa el lápiz de su fila. Desde ahí también puedes
ponerlo en **mantenimiento**.

### Crear un producto o servicio *(dirección)*
1. En **Cafetería**, pulsa **Nuevo producto o servicio**.
2. Escribe el **nombre**, elige la **categoría** (bebida, alimento o servicio) y
   el **precio**. La descripción es opcional.
3. Marca **Contiene alcohol** si la venta es solo para mayores de 18 años.
4. Guarda.

El nombre debe ser único y el precio no puede ser negativo.

### Añadir una persona al equipo *(dirección)*
1. En **Personas**, pulsa **Nuevo integrante**.
2. Completa nombre, correo, teléfono, cargo, salario y una **contraseña
   temporal** (mínimo 8 caracteres).
3. Guarda. La persona ya puede entrar con su correo y esa contraseña.

Comparte la contraseña temporal por un medio seguro.

### Ver las ventas de un día o de un período *(dirección)*
La pantalla **Ventas** muestra solo las últimas ventas. Para un día o un período
concreto:

1. Ve a **Reportes** y en **Período** elige **Personalizado**.
2. Indica **Desde** y **Hasta** (para un solo día, la misma fecha en ambos).
3. Consulta los totales, o pulsa **Descargar → Ventas (CSV)** para obtener el
   detalle.

### Descargar información *(dirección)*
En **Reportes**, pulsa **Descargar** y elige el archivo. Los CSV se abren con
Excel u otra hoja de cálculo. El de inventario siempre refleja el estado actual;
los demás respetan el período elegido.

---

## 6. Reglas que verás en funcionamiento

- **Horarios:** reservas de 07:00 a 23:00, en bloques de 30 minutos, de 1 a 14
  horas, dentro del mismo día. No se aceptan reservas en el pasado. Los turnos
  siguen las mismas reglas.
- **Sin cruces:** un espacio no admite dos reservas al mismo tiempo; una persona
  no puede estar en dos experiencias a la vez ni tener dos turnos cruzados; un
  equipo no puede comprometerse dos veces.
- **Precio de una reserva:** se cobra por hora según la tarifa del espacio. Un
  puesto cubierto por una membresía vigente no se cobra. Un evento no se cobra
  por hora, sino a través del producto de la experiencia.
- **Inventario:** cada venta descuenta los insumos de la receta. Nunca se permite
  dejar una existencia en negativo.
- **Alcohol:** una venta con bebidas alcohólicas exige confirmar la mayoría de
  edad.
- **Experiencias:** al crearse bloquean su espacio; al cancelarse lo liberan.
- **Estado de las reservas:** depende del horario. Una reserva ya vencida pasa a
  *completada* y cuenta como ingreso realizado; las futuras confirmadas cuentan
  como ingreso previsto.

---

## 7. Mensajes frecuentes y qué hacer

| Mensaje o situación | Qué significa | Qué hacer |
| --- | --- | --- |
| *Correo o contraseña incorrectos* | Las credenciales no coinciden | Revisa los datos. Si olvidaste la clave, pide a la dirección que gestione tu cuenta |
| *Demasiadas solicitudes* | Se superó el límite de peticiones o de intentos de acceso | Espera unos instantes y vuelve a intentarlo |
| *Tu rol no tiene acceso a este recurso* | La acción no corresponde a tu rol | Pide a la dirección que la haga o que revise tu rol |
| *Ese espacio ya está reservado en ese horario* | Hay otra reserva en ese tramo | Elige otro horario o espacio |
| *Esta reserva pertenece a una experiencia* | Las reservas de eventos se liberan cancelando la experiencia | Cancela la experiencia en lugar de la reserva |
| *Stock insuficiente* | No hay existencias para completar el pedido | Quita el producto o repón el insumo |
| *La venta incluye alcohol…* | Falta confirmar la mayoría de edad | Marca la casilla de confirmación |
| *Ya existe un producto llamado…* o *una cuenta con el correo…* | Los nombres de producto y los correos deben ser únicos | Usa otro valor o edita el registro existente |
| Una pantalla aparece vacía | No hay datos para ese día o filtro | Revisa la fecha o limpia la búsqueda |
| No ves una opción del menú | Tu rol no tiene acceso a esa pantalla | Consulta la tabla de la sección 2 |

---

## 8. Limitaciones de esta versión

Para evitar sorpresas, esto es lo que **todavía no se puede hacer desde la
interfaz**:

- **Registrarse o recuperar la contraseña por cuenta propia.** Las cuentas las
  crea la dirección. Desde la pantalla *Personas* solo se pueden crear cuentas
  de personal; no hay formulario para dar de alta a un cliente.
- **Gestionar desde la pantalla:** inventario (registrar entradas o mermas),
  turnos, equipos, costos, permisos y experiencias se consultan, pero su
  creación y edición hoy no tienen formulario en la interfaz.
- **Filtrar las ventas por fecha** en la pantalla *Ventas*; para eso se usan los
  *Reportes*.
- **Facturación electrónica, nómina y contabilidad formal** no forman parte del
  alcance.

Estas funciones pueden incorporarse en versiones futuras.
