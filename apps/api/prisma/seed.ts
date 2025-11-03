import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Чистим (аккуратно в проде!)
  await prisma.teamMember.deleteMany();
  await prisma.post.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  const user1 = await prisma.user.create({
    data: { email: "demo1@stepunity.app", displayName: "Demo Dancer 1" },
  });

  const user2 = await prisma.user.create({
    data: { email: "demo2@stepunity.app", displayName: "Demo Dancer 2" },
  });

  const team = await prisma.team.create({
    data: { name: "StepUnity Stars" },
  });

  await prisma.teamMember.create({
    data: { userId: user1.id, teamId: team.id, role: "owner" },
  });

  await prisma.teamMember.create({
    data: { userId: user2.id, teamId: team.id, role: "member" },
  });

  await prisma.post.create({
    data: {
      authorId: user1.id,
      caption: "First traning! 🔥",
      videoUrl: "https://example.com/video1.mp4",
    },
  });

  console.log("✅ Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
