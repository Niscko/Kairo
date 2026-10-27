-- CreateEnum
CREATE TYPE "AccionRegistro" AS ENUM ('crear', 'actualizar', 'eliminar');

-- CreateTable
CREATE TABLE "registros_actividad" (
    "id" SERIAL NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER,
    "actor_nombre" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "actor_rol" "Rol",
    "accion" "AccionRegistro" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "resumen" TEXT NOT NULL,
    "detalle" JSONB,

    CONSTRAINT "registros_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registros_actividad_creado_en_idx" ON "registros_actividad"("creado_en");

-- CreateIndex
CREATE INDEX "registros_actividad_entidad_creado_en_idx" ON "registros_actividad"("entidad", "creado_en");

-- AddForeignKey
ALTER TABLE "registros_actividad" ADD CONSTRAINT "registros_actividad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
