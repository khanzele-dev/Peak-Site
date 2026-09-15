import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { clientIp, jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"
import { getRemnawaveUser } from "@/lib/remnawave"
import { reconcileYookassaPayment } from "@/lib/paymentFulfillment"
import { GUEST_ORDER_TTL_MS, hashGuestToken, isGuestToken, toPublicSubscription } from "@/lib/guest"

const bodySchema = z.object({ token: z.string().max(64) })

type OrderStatus = "pending" | "processing" | "succeeded" | "canceled" | "failed" | "refunded"

/**
 * Результат заказа без регистрации по одноразовому токену из return URL.
 * Страница опрашивает его после оплаты: заодно сверяем платёж с ЮKassa
 * (как /api/payments/sync в кабинете), не дожидаясь вебхука.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  // Страница опрашивает раз в 2–3 секунды — лимит с запасом на это
  if (await isRateLimited(`guest-order:ip:${clientIp(req)}`, 90, 10 * 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !isGuestToken(parsed.data.token)) return jsonError("Заказ не найден", 404)

  const payment = await prisma.payment.findUnique({
    where: { guestTokenHash: hashGuestToken(parsed.data.token) },
  })
  if (!payment || payment.kind === "ACCOUNT") return jsonError("Заказ не найден", 404)

  if (Date.now() - payment.createdAt.getTime() > GUEST_ORDER_TTL_MS) {
    return jsonError("Ссылка на заказ устарела. Откройте подписку по ссылке управления.", 410)
  }

  const needsSync =
    payment.providerPaymentId &&
    (payment.status === "PENDING" || (payment.status === "SUCCEEDED" && !payment.fulfilledAt))
  if (needsSync) {
    try {
      await reconcileYookassaPayment(payment.providerPaymentId!)
    } catch (err) {
      // Не отдаём ошибку наружу: страница просто спросит ещё раз, вебхук тоже доретраит
      console.error("[guest/order] reconcile failed", err)
    }
  }

  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } })

  let status: OrderStatus
  switch (fresh.status) {
    case "SUCCEEDED":
      status = fresh.fulfilledAt ? "succeeded" : "processing"
      break
    case "PENDING":
      status = "pending"
      break
    case "CANCELED":
      status = "canceled"
      break
    case "REFUNDED":
      status = "refunded"
      break
    default:
      status = "failed"
  }

  let subscription = null
  if (status === "succeeded" && fresh.remnawaveUserId) {
    try {
      subscription = toPublicSubscription(await getRemnawaveUser(fresh.remnawaveUserId))
    } catch (err) {
      console.error("[guest/order] remnawave lookup failed", err)
    }
  }

  return NextResponse.json({
    kind: fresh.kind === "GUEST_RENEW" ? "renew" : "new",
    status,
    plan: { name: fresh.plan.name },
    amountRub: fresh.amountRub,
    subscription,
  })
})
