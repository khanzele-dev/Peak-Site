import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isYookassaConfigured, createYookassaPayment } from "@/lib/yookassa"
import { jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"

const bodySchema = z.object({ planId: z.string().max(64) })

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser()
  if (!user) return jsonError("Не авторизован", 401)

  // Каждый вызов создаёт платёж в ЮKassa и строку в БД — не даём это спамить.
  if (await isRateLimited(`pay-create:user:${user.id}`, 10, 10 * 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  if (!isYookassaConfigured()) {
    return jsonError("Оплата временно недоступна, попробуйте позже.", 503)
  }

  // Без APP_URL на проде ЮKassa вернула бы пользователя на localhost
  const appUrl = process.env.APP_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:3000")
  if (!appUrl) {
    console.error("[payments/create] APP_URL не задан — оплата отключена")
    return jsonError("Оплата временно недоступна, попробуйте позже.", 503)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError("Некорректные данные", 400)

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } })
  if (!plan || !plan.isActive) return jsonError("Тариф не найден", 404)

  const payment = await prisma.payment.create({
    data: { userId: user.id, planId: plan.id, amountRub: plan.priceRub, status: "PENDING" },
  })

  try {
    const ykPayment = await createYookassaPayment({
      idempotenceKey: payment.id,
      amountRub: plan.priceRub,
      description: `PEAK — тариф «${plan.name}»`,
      returnUrl: `${appUrl}/dashboard.html?payment=pending`,
      metadata: { paymentId: payment.id, userId: user.id, planId: plan.id },
    })

    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId: ykPayment.id },
    })

    return NextResponse.json({ confirmationUrl: ykPayment.confirmation?.confirmation_url })
  } catch (err) {
    console.error("[payments/create]", err)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } })
    return jsonError("Не удалось создать платёж. Попробуйте позже.", 502)
  }
})
