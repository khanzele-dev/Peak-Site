import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import { normalizePhone } from "../lib/phone.ts"

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const PLANS = [
  { code: "1m", name: "1 месяц", badge: null, months: 1, days: 0, priceRub: 109, sortOrder: 1 },
  { code: "3m", name: "3 месяца", badge: "🔥 Скидка −5%", months: 3, days: 0, priceRub: 309, sortOrder: 2 },
  { code: "6m", name: "6 месяцев", badge: "⚡️ Скидка −8%", months: 6, days: 0, priceRub: 599, sortOrder: 3 },
  { code: "12m", name: "12 месяцев", badge: "🏔 Скидка −16%", months: 12, days: 0, priceRub: 1099, sortOrder: 4 },
]

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    })
  }
  console.log(`Seeded ${PLANS.length} plans.`)

  const adminPhoneRaw = process.env.SEED_ADMIN_PHONE
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminPhoneRaw || !adminPassword) {
    console.log("SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD not set — skipping admin user.")
    return
  }
  const adminPhone = normalizePhone(adminPhoneRaw)
  if (!adminPhone) {
    console.log("SEED_ADMIN_PHONE is not a valid phone number — skipping admin user.")
    return
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { role: "ADMIN" },
    create: { phone: adminPhone, passwordHash, role: "ADMIN" },
  })
  console.log(`Admin user ready: ${adminPhone}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
