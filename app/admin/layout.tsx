import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/session"

const NAV = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/payments", label: "Платежи" },
  { href: "/admin/plans", label: "Тарифы" },
  { href: "/admin/settings", label: "Настройки" },
]

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Дублирует проверку из proxy.ts — это Server Component, доверять только
  // edge-гейту нельзя (там нет обращения к БД), поэтому здесь она авторитетная.
  const admin = await requireAdmin()
  if (!admin) redirect("/login.html")

  return (
    <div className="min-h-screen bg-[#080808] text-[#e8e8e8]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:flex-row lg:gap-8">
        <aside className="shrink-0 lg:w-56">
          <Link href="/index.html" className="mb-6 flex items-center gap-2.5 text-lg font-extrabold tracking-wide text-white lg:mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/peak-mark.png" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="tracking-[0.16em]">PEAK</span>
            <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-widest text-[#a0a0a0]">admin</span>
          </Link>
          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-[#c8c8c8] transition hover:bg-[#d6a33a]/10 hover:text-[#f2c45f]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-white/10 pt-4 text-xs text-[#a0a0a0] lg:mt-8">{admin.phone}</div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
