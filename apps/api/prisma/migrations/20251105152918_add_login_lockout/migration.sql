-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_lockUntil_idx" ON "User"("lockUntil");
