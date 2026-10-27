-- AlterTable
ALTER TABLE "insumos" ADD COLUMN     "factor_conversion" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "unidad_compra" TEXT NOT NULL DEFAULT 'unidad';
