import { prisma } from "@/lib/prisma"

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#080808] p-5">
      <p className="text-[11px] uppercase tracking-widest text-[#a0a0a0]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

export default async function AdminOverviewPage() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [totalUsers, newUsers30d, succeededPayments, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.payment.count({ where: { status: "SUCCEEDED" } }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountRub: true } }),
  ])

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Обзор</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Пользователей" value={totalUsers} />
        <Card label="Новых за 30 дней" value={newUsers30d} />
        <Card label="Оплаченных заказов" value={succeededPayments} />
        <Card label="Выручка, ₽" value={(revenueAgg._sum.amountRub ?? 0).toLocaleString("ru-RU")} />
      </div>
    </div>
  )
}
