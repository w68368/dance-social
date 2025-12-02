// apps/api/src/scripts/cleanupTokens.ts
import { prisma } from "../lib/prisma.js";

const RETENTION_DAYS = Number(process.env.TOKEN_CLEANUP_RETENTION_DAYS ?? 30);

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  const threshold = daysAgo(RETENTION_DAYS);
  const now = new Date();

  console.log(
    `[cleanup] Start cleanup with retention=${RETENTION_DAYS} days, threshold=${threshold.toISOString()}`
  );

  // 1) RefreshToken:
  // - expired long ago
  // - revoked long ago
  const refreshResult = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        // expired long ago
        { expiresAt: { lt: threshold } },
        // revoked long ago
        {
          AND: [{ revokedAt: { not: null } }, { revokedAt: { lt: threshold } }],
        },
      ],
    },
  });

  // 2) EmailVerification:
  // all codes where expiresAt < threshold
  const emailVerificationResult = await prisma.emailVerification.deleteMany({
    where: {
      expiresAt: { lt: threshold },
    },
  });

  // 3) PasswordReset:
  // - expired long ago
  // - used long ago
  const passwordResetResult = await prisma.passwordReset.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: threshold } },
        {
          AND: [{ usedAt: { not: null } }, { usedAt: { lt: threshold } }],
        },
      ],
    },
  });

  console.log("[cleanup] Deleted rows:");
  console.log("  RefreshToken:", refreshResult.count);
  console.log("  EmailVerification:", emailVerificationResult.count);
  console.log("  PasswordReset:", passwordResetResult.count);

  console.log("[cleanup] Done at", now.toISOString());
}

main()
  .catch((err) => {
    console.error("[cleanup] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
