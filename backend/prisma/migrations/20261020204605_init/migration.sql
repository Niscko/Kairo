-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('admin', 'empleado', 'cliente');

-- CreateEnum
CREATE TYPE "TipoEspacio" AS ENUM ('puesto', 'sala', 'mesa', 'evento');

-- CreateEnum
CREATE TYPE "EstadoEspacio" AS ENUM ('disponible', 'mantenimiento');

-- CreateEnum
CREATE TYPE "PropositoReserva" AS ENUM ('trabajo', 'estudio', 'reunion', 'consumo', 'evento');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('confirmada', 'en_curso', 'completada', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoMembresia" AS ENUM ('ninguna', 'dia', 'mensual');

-- CreateEnum
CREATE TYPE "CategoriaProducto" AS ENUM ('bebida', 'alimento', 'servicio');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('efectivo', 'tarjeta', 'transferencia');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('entrada', 'salida', 'merma');

-- CreateEnum
CREATE TYPE "TipoEquipo" AS ENUM ('tecnologico', 'mobiliario', 'produccion', 'administracion');

-- CreateEnum
CREATE TYPE "EstadoEquipo" AS ENUM ('operativo', 'mantenimiento', 'prestado');

-- CreateEnum
CREATE TYPE "EstadoExperiencia" AS ENUM ('programada', 'en_curso', 'finalizada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoCosto" AS ENUM ('pendiente', 'pagado');

-- CreateEnum
CREATE TYPE "EstadoPermiso" AS ENUM ('vigente', 'vencido');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recuperaciones" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recuperaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones_refresh" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira" TIMESTAMP(3) NOT NULL,
    "revocado" TIMESTAMP(3),
    "reemplazado_por_id" INTEGER,
    "user_agent" TEXT,

    CONSTRAINT "sesiones_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cargo" TEXT NOT NULL,
    "salario" INTEGER NOT NULL,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "documento" TEXT,
    "membresia" "TipoMembresia" NOT NULL DEFAULT 'ninguna',
    "membresia_vence" TIMESTAMP(3),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espacios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoEspacio" NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "tarifa_hora" INTEGER NOT NULL,
    "zona" TEXT NOT NULL,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'disponible',

    CONSTRAINT "espacios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" SERIAL NOT NULL,
    "espacio_id" INTEGER NOT NULL,
    "cliente_id" INTEGER,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "proposito" "PropositoReserva" NOT NULL,
    "estado" "EstadoReserva" NOT NULL,
    "monto" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "categoria" TEXT NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_minimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costo_unitario" INTEGER NOT NULL,
    "proveedor_id" INTEGER,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaProducto" NOT NULL,
    "precio" INTEGER NOT NULL,
    "descripcion" TEXT,
    "es_alcohol" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "producto_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("producto_id","insumo_id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "empleado_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "total" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_items" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,

    CONSTRAINT "venta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" SERIAL NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoEquipo" NOT NULL,
    "estado" "EstadoEquipo" NOT NULL DEFAULT 'operativo',
    "espacio_id" INTEGER,
    "costo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiencias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "espacio_id" INTEGER NOT NULL,
    "reserva_id" INTEGER,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,
    "estado" "EstadoExperiencia" NOT NULL,

    CONSTRAINT "experiencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiencia_empleados" (
    "experiencia_id" INTEGER NOT NULL,
    "empleado_id" INTEGER NOT NULL,

    CONSTRAINT "experiencia_empleados_pkey" PRIMARY KEY ("experiencia_id","empleado_id")
);

-- CreateTable
CREATE TABLE "experiencia_equipos" (
    "experiencia_id" INTEGER NOT NULL,
    "equipo_id" INTEGER NOT NULL,

    CONSTRAINT "experiencia_equipos_pkey" PRIMARY KEY ("experiencia_id","equipo_id")
);

-- CreateTable
CREATE TABLE "experiencia_productos" (
    "experiencia_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "experiencia_productos_pkey" PRIMARY KEY ("experiencia_id","producto_id")
);

-- CreateTable
CREATE TABLE "experiencia_participantes" (
    "experiencia_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,

    CONSTRAINT "experiencia_participantes_pkey" PRIMARY KEY ("experiencia_id","cliente_id")
);

-- CreateTable
CREATE TABLE "costos" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "vencimiento" TIMESTAMP(3),
    "estado" "EstadoCosto" NOT NULL,

    CONSTRAINT "costos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "numero" TEXT,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPermiso" NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" SERIAL NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "area" TEXT NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "recuperaciones_usuario_id_usado_idx" ON "recuperaciones"("usuario_id", "usado");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_refresh_token_hash_key" ON "sesiones_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_refresh_usuario_id_revocado_idx" ON "sesiones_refresh"("usuario_id", "revocado");

-- CreateIndex
CREATE INDEX "sesiones_refresh_familia_idx" ON "sesiones_refresh"("familia");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_usuario_id_key" ON "empleados"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_usuario_id_key" ON "clientes"("usuario_id");

-- CreateIndex
CREATE INDEX "reservas_espacio_id_inicio_fin_idx" ON "reservas"("espacio_id", "inicio", "fin");

-- CreateIndex
CREATE INDEX "reservas_cliente_id_inicio_idx" ON "reservas"("cliente_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_estado_inicio_idx" ON "reservas"("estado", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_nombre_key" ON "insumos"("nombre");

-- CreateIndex
CREATE INDEX "insumos_proveedor_id_idx" ON "insumos"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_nombre_key" ON "productos"("nombre");

-- CreateIndex
CREATE INDEX "productos_categoria_activo_idx" ON "productos"("categoria", "activo");

-- CreateIndex
CREATE INDEX "ventas_fecha_idx" ON "ventas"("fecha");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_fecha_idx" ON "ventas"("cliente_id", "fecha");

-- CreateIndex
CREATE INDEX "ventas_empleado_id_fecha_idx" ON "ventas"("empleado_id", "fecha");

-- CreateIndex
CREATE INDEX "venta_items_venta_id_idx" ON "venta_items"("venta_id");

-- CreateIndex
CREATE INDEX "venta_items_producto_id_idx" ON "venta_items"("producto_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_insumo_id_fecha_idx" ON "movimientos_inventario"("insumo_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_tipo_fecha_idx" ON "movimientos_inventario"("tipo", "fecha");

-- CreateIndex
CREATE INDEX "equipos_espacio_id_idx" ON "equipos"("espacio_id");

-- CreateIndex
CREATE INDEX "equipos_estado_idx" ON "equipos"("estado");

-- CreateIndex
CREATE INDEX "experiencias_espacio_id_idx" ON "experiencias"("espacio_id");

-- CreateIndex
CREATE INDEX "experiencias_estado_inicio_idx" ON "experiencias"("estado", "inicio");

-- CreateIndex
CREATE INDEX "experiencias_inicio_fin_idx" ON "experiencias"("inicio", "fin");

-- CreateIndex
CREATE INDEX "costos_periodo_categoria_idx" ON "costos"("periodo", "categoria");

-- CreateIndex
CREATE INDEX "costos_estado_vencimiento_idx" ON "costos"("estado", "vencimiento");

-- CreateIndex
CREATE INDEX "permisos_estado_vencimiento_idx" ON "permisos"("estado", "vencimiento");

-- CreateIndex
CREATE INDEX "turnos_empleado_id_fecha_idx" ON "turnos"("empleado_id", "fecha");

-- CreateIndex
CREATE INDEX "turnos_fecha_idx" ON "turnos"("fecha");

-- AddForeignKey
ALTER TABLE "recuperaciones" ADD CONSTRAINT "recuperaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_refresh" ADD CONSTRAINT "sesiones_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_refresh" ADD CONSTRAINT "sesiones_refresh_reemplazado_por_id_fkey" FOREIGN KEY ("reemplazado_por_id") REFERENCES "sesiones_refresh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_empleados" ADD CONSTRAINT "experiencia_empleados_experiencia_id_fkey" FOREIGN KEY ("experiencia_id") REFERENCES "experiencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_empleados" ADD CONSTRAINT "experiencia_empleados_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_equipos" ADD CONSTRAINT "experiencia_equipos_experiencia_id_fkey" FOREIGN KEY ("experiencia_id") REFERENCES "experiencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_equipos" ADD CONSTRAINT "experiencia_equipos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_productos" ADD CONSTRAINT "experiencia_productos_experiencia_id_fkey" FOREIGN KEY ("experiencia_id") REFERENCES "experiencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_productos" ADD CONSTRAINT "experiencia_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_participantes" ADD CONSTRAINT "experiencia_participantes_experiencia_id_fkey" FOREIGN KEY ("experiencia_id") REFERENCES "experiencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_participantes" ADD CONSTRAINT "experiencia_participantes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
