import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { reconcileYookassaPayment } from "@/lib/paymentFulfillment"
import { jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"

/**
 * Вызывается фронтендом при возврате на /dashboard.html?payment=pending —
 * не ждём вебхук ЮKassa (в локальной разработке он вообще не может достучаться
 * до localhost, а в проде может прийти с задержкой), а сверяем незавершённые
 * платежи пользователя сразу, через ту же логику, что и вебхук.
 *
 * Важно: сверяем не только PENDING, но и SUCCEEDED с fulfilledAt = null —
 * оплата могла пройти, а выдача VPN временно не получиться (Remnawave
 * недоступен), и такой платёж больше никогда не попадёт под "PENDING".
 * Обрабатываем все найденные, а не только последний — иначе при нескольких
 * подряд оплатах "застревают" все, кроме той, что попала под предыдущую сверку.
 */
export const POST = withErrorHandling(async () => {
  const user = await getCurrentUser()
  if (!user) return jsonError("Не авторизован", 401)

  // Каждая сверка ходит в ЮKassa и Remnawave. Фронтенд делает до 6 попыток
  // за один возврат с оплаты — лимит с запасом на это, но не на спам.
  if (await isRateLimited(`sync:user:${user.id}`, 30, 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const unresolved = await prisma.payment.findMany({
    where: {
      userId: user.id,
      providerPaymentId: { not: null },
      OR: [{ status: "PENDING" }, { status: "SUCCEEDED", fulfilledAt: null }],
    },
    orderBy: { createdAt: "asc" },
  })

  if (unresolved.length === 0) {
    return NextResponse.json({ status: null })
  }

  let last = null
  for (const payment of unresolved) {
    // providerPaymentId гарантирован фильтром выше, но TS об этом не знает
    last = await reconcileYookassaPayment(payment.providerPaymentId as string)
  }

  return NextResponse.json({ status: last?.status ?? "PENDING" })
})
