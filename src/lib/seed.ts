import { prisma } from "./prisma"
import { MOCK_ACCOUNTS } from "@/data/mock/accounts"
import { MOCK_USER_ID } from "@/data/mock/user"

async function seed() {
  console.log("Seeding database...")

  // Clear existing data for the mock user
  await prisma.account.deleteMany({ where: { userId: MOCK_USER_ID } })
  await prisma.complianceData.deleteMany({ where: { userId: MOCK_USER_ID } })

  // Insert mock accounts
  for (const account of MOCK_ACCOUNTS) {
    await prisma.account.create({ data: account })
  }

  // Seed a starting FX rate
  await prisma.fxRate.upsert({
    where: { pair: "USD_INR" },
    update: { rate: 83.5 },
    create: { pair: "USD_INR", rate: 83.5 },
  })

  // Seed compliance data baseline
  await prisma.complianceData.upsert({
    where: { userId: MOCK_USER_ID },
    update: {},
    create: {
      userId: MOCK_USER_ID,
      indiaPeakBalanceUsd: 0,
      indiaDaysCurrentYear: 0,
      lrsUsedUsd: 0,
    },
  })

  const count = await prisma.account.count({ where: { userId: MOCK_USER_ID } })
  console.log(`Done. ${count} accounts seeded for user ${MOCK_USER_ID}.`)

  await prisma.$disconnect()
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
