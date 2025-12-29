/*
  Warnings:

  - You are about to drop the column `createdAt` on the `ConversationParticipant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ConversationParticipant" DROP COLUMN "createdAt",
ADD COLUMN     "lastReadAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant"("conversationId");
