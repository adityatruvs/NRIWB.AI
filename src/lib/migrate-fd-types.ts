/**
 * One-off: re-type India accounts saved as NRE/NRO *Savings* whose name says
 * they're a fixed deposit ("HDFC NRE FD") to `fd` + the matching fdScheme, so
 * they sit under Fixed Deposits with the user's other FDs.
 *
 * Dry run by default — prints every row it would change and writes nothing.
 * Review that list, then re-run with --apply to write it.
 *
 *   npm run db:migrate-fd-types              # review
 *   npm run db:migrate-fd-types -- --apply   # write
 */

import { config } from "dotenv"
import { fdRetypePatch } from "@/lib/account-details"
import type { Prisma } from "@/generated/prisma"

config({ path: ".env.local" })
config()

async function main() {
  const apply = process.argv.includes("--apply")
  // Imported after the env is loaded — the client reads DATABASE_URL on creation.
  const { prisma } = await import("./prisma")

  const rows = await prisma.account.findMany({
    where: { country: "IN", accountType: { in: ["nre", "nro"] } },
    select: { id: true, userId: true, nickname: true, accountType: true, country: true, details: true },
  })
  const changes = rows.flatMap((r) => {
    const patch = fdRetypePatch(r)
    return patch ? [{ row: r, patch }] : []
  })

  console.log(`${rows.length} India NRE/NRO accounts checked, ${changes.length} look like fixed deposits:`)
  for (const { row, patch } of changes) {
    console.log(`  ${row.userId}  ${row.id}  "${row.nickname}"  ${row.accountType} -> fd (${patch.details.fdScheme})`)
  }

  if (!apply) {
    console.log(changes.length ? "\nDry run — nothing written. Re-run with --apply to update these rows." : "")
    await prisma.$disconnect()
    return
  }

  // lastSyncedAt is left alone: the balance hasn't been re-confirmed, only re-filed.
  await prisma.$transaction(
    changes.map(({ row, patch }) =>
      prisma.account.update({
        where: { id: row.id },
        data: { accountType: patch.accountType, details: patch.details as Prisma.InputJsonValue },
      }),
    ),
  )
  console.log(`\nUpdated ${changes.length} accounts.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
