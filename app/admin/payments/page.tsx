import { prisma } from "@/lib/prisma"

const STATUS_LABEL: Record<string, string> = {
  PENDING: "В обработке",
  SUCCEEDED: "Оплачен",
  FAILED: "Ошибка",
  CANCELED: "Отменён",
}

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { phone: true } }, plan: { select: { name: true } } },
  })

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Платежи</h1>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-[#a0a0a0]">
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Тариф</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">VPN выдан</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-none">
                <td className="px-4 py-3 text-[#a0a0a0]">{p.createdAt.toLocaleDateString("ru-RU")}</td>
                <td className="px-4 py-3 text-white">{p.user.phone}</td>
                <td className="px-4 py-3">{p.plan.name}</td>
                <td className="px-4 py-3">{p.amountRub.toLocaleString("ru-RU")} ₽</td>
                <td className="px-4 py-3">{STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="px-4 py-3">{p.fulfilledAt ? "Да" : "—"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#a0a0a0]">Пока нет платежей</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
