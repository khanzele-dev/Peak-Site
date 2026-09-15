import { prisma } from "@/lib/prisma"

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, phone: true, role: true, remnawaveUuid: true, createdAt: true },
  })

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Пользователи</h1>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-[#a0a0a0]">
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">VPN выдан</th>
              <th className="px-4 py-3">Регистрация</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-none">
                <td className="px-4 py-3 text-white">{u.phone}</td>
                <td className="px-4 py-3">{u.role === "ADMIN" ? "Админ" : "Пользователь"}</td>
                <td className="px-4 py-3">{u.remnawaveUuid ? "Да" : "—"}</td>
                <td className="px-4 py-3 text-[#a0a0a0]">{u.createdAt.toLocaleDateString("ru-RU")}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#a0a0a0]">Пока нет пользователей</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
