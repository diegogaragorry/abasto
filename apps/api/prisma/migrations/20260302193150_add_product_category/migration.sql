-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('ALMACEN', 'VERDURAS', 'FRUTAS', 'LACTEOS', 'CARNES', 'OTROS');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" "ProductCategory" NOT NULL DEFAULT 'OTROS';
