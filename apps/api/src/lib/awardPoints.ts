import { prisma } from "./prisma.js";

export async function awardPoints(params: {
  userId: string;
  action: "POST_PUBLISHED";
  points: number;
  entityType?: string;
  entityId?: string;
}) {
  const { userId, action, points, entityType, entityId } = params;

  return prisma.$transaction(async (tx) => {
    // 1) запись в ledger (уникальность защитит от дублей)
    await tx.pointsLedger.create({
      data: {
        userId,
        action,
        points,
        entityType,
        entityId,
      },
    });

    // 2) инкремент user.points
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        points: { increment: points },
        pointsUpdatedAt: new Date(),
      },
      select: { id: true, points: true, pointsUpdatedAt: true },
    });

    return updatedUser;
  });
}