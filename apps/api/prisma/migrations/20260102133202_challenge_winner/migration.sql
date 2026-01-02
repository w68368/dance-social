-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "winnerId" TEXT;

-- CreateIndex
CREATE INDEX "Challenge_winnerId_idx" ON "Challenge"("winnerId");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
