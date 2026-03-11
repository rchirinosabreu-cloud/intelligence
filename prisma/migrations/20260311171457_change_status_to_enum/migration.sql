-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA', 'ELIMINADA');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deletionReason" TEXT;

-- Convert existing data and change column type
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus" USING (
  CASE
    WHEN UPPER("status") = 'PENDIENTE' THEN 'PENDIENTE'::"TaskStatus"
    WHEN UPPER("status") = 'EN PROCESO' OR UPPER("status") = 'EN_CURSO' THEN 'EN_CURSO'::"TaskStatus"
    WHEN UPPER("status") = 'REALIZADO' OR UPPER("status") = 'REALIZADA' THEN 'REALIZADA'::"TaskStatus"
    WHEN UPPER("status") = 'DEVUELTO' OR UPPER("status") = 'DEVUELTA' THEN 'DEVUELTA'::"TaskStatus"
    WHEN UPPER("status") = 'ELIMINADA' OR UPPER("status") = 'ELIMINADO' THEN 'ELIMINADA'::"TaskStatus"
    ELSE 'PENDIENTE'::"TaskStatus"
  END
);

-- Set default for future inserts
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
