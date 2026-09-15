import { NextResponse } from "next/server"
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { withErrorHandling } from "@/lib/apiHandler"

export const POST = withErrorHandling(async () => {
  // Отзываем сессию на сервере, а не только стираем куку: инкремент
  // tokenVersion делает недействительными все ранее выданные JWT этого
  // пользователя — в том числе скопированную/украденную куку.
  const user = await getCurrentUser()
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return res
})
