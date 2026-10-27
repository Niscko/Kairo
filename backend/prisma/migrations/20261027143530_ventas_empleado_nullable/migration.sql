-- DropForeignKey
ALTER TABLE "ventas" DROP CONSTRAINT "ventas_empleado_id_fkey";

-- AlterTable
ALTER TABLE "ventas" ALTER COLUMN "empleado_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
