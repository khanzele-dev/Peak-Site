import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { listRemnawaveNodes } from "@/lib/remnawave"
import { jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser()
  if (!user) return jsonError("Не авторизован", 401)

  // Каждый запрос идёт наружу в Remnawave-панель — лимитируем по юзеру,
  // чтобы один залогиненный аккаунт не мог заспамить панель запросами.
  if (await isRateLimited(`nodes:user:${user.id}`, 30, 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  try {
    const nodes = await listRemnawaveNodes()
    // Адреса нод наружу не отдаём: регистрация бесплатная, и любой аккаунт
    // получал бы готовый список целей. Кабинету нужны только страна и статус.
    return NextResponse.json({
      nodes: nodes.map((n) => ({ countryCode: n.countryCode, status: n.status })),
    })
  } catch (err) {
    console.error("[nodes] remnawave lookup failed", err)
    return NextResponse.json({ nodes: [] })
  }
})
