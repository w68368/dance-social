-- CreateEnum
CREATE TYPE "PointsAction" AS ENUM ('POST_PUBLISHED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PointsAction" NOT NULL,
    "points" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsLedger_userId_createdAt_idx" ON "PointsLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsLedger_action_createdAt_idx" ON "PointsLedger"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointsLedger_action_entityType_entityId_userId_key" ON "PointsLedger"("action", "entityType", "entityId", "userId");

-- CreateIndex
CREATE INDEX "User_points_idx" ON "User"("points");

-- CreateIndex
CREATE INDEX "User_pointsUpdatedAt_idx" ON "User"("pointsUpdatedAt");

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
