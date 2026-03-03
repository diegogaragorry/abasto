-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('KG', 'UNIT', 'LITER');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseUnit" "ProductUnit" NOT NULL DEFAULT 'KG',
ADD COLUMN     "sizeValue" DOUBLE PRECISION NOT NULL DEFAULT 1;
