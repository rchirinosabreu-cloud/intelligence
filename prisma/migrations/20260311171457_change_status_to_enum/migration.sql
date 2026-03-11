-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA', 'ELIMINADA');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deletionReason" TEXT;

-- Convert existing data and change column type
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus" USING (
  CASE
    WHEN "status" = 'Pendiente' THEN 'PENDIENTE'::"TaskStatus"
    WHEN "status" = 'En proceso' THEN 'EN_CURSO'::"TaskStatus"
    WHEN "status" = 'Realizado' THEN 'REALIZADA'::"TaskStatus"
    WHEN "status" = 'Devuelto' THEN 'DEVUELTA'::"TaskStatus"
    WHEN "status" = 'Eliminada' THEN 'ELIMINADA'::"TaskStatus"
    ELSE 'PENDIENTE'::"TaskStatus"
  END
);

-- Set default for future inserts
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
