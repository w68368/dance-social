-- AlterTable
ALTER TABLE "PostComment" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PostComment_postId_isPinned_idx" ON "PostComment"("postId", "isPinned");
