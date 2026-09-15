import { prisma } from "@/lib/prisma"
import { fetchYookassaPayment, fetchYookassaRefund } from "@/lib/yookassa"
import { ensureRemnawaveUser, extendRemnawaveSubscription, reduceRemnawaveSubscription } from "@/lib/remnawave"

/**
 * Общая логика подтверждения оплаты — используется и вебхуком ЮKassa, и
 * ручной сверкой при возврате пользователя на /dashboard.html (см.
 * /api/payments/sync). ЮKassa не подписывает вебхуки, поэтому телу запроса
 * не доверяем — реальный статус всегда берём отдельным запросом к их API.
 *
 * Идемпотентна: Payment.status меняется на SUCCEEDED только один раз,
 * Payment.fulfilledAt отдельно защищает от повторной выдачи VPN в Remnawave.
 */
export async function reconcileYookassaPayment(providerPaymentId: string) {
  const verified = await fetchYookassaPayment(providerPaymentId)

  const payment = await prisma.payment.findUnique({
    where: { providerPaymentId: verified.id },
    include: { plan: true },
  })
  if (!payment) return null

  if (verified.status !== "succeeded") {
    if (verified.status === "canceled" && payment.status === "PENDING") {
      return prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELED" } })
    }
    return payment
  }

  if (payment.status !== "SUCCEEDED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", rawPayload: verified as unknown as object },
    })
  }

  if (!payment.fulfilledAt) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: payment.userId } })
    let remnawaveUuid = user.remnawaveUuid
    if (!remnawaveUuid) {
      const created = await ensureRemnawaveUser({ externalId: user.id, phone: user.phone })
      remnawaveUuid = created.id
      await prisma.user.update({ where: { id: user.id }, data: { remnawaveUuid } })
    }
    await extendRemnawaveSubscription(remnawaveUuid, { months: payment.plan.months, days: payment.plan.days })
    await prisma.payment.update({ where: { id: payment.id }, data: { fulfilledAt: new Date() } })
  }

  return prisma.payment.findUnique({ where: { id: payment.id } })
}

/**
 * Возврат средств за конкретный платёж — урезает подписку ровно на
 * plan.months этого платежа, не больше (даже если платежей у пользователя
 * было несколько). Идемпотентна через Payment.refundedAt, как и выдача.
 */
export async function reconcileYookassaRefund(refundId: string) {
  const refund = await fetchYookassaRefund(refundId)
  if (refund.status !== "succeeded") return null

  const payment = await prisma.payment.findUnique({
    where: { providerPaymentId: refund.payment_id },
    include: { plan: true },
  })
  if (!payment || payment.refundedAt) return payment

  // Урезаем VPN только если по этому платежу его вообще выдавали —
  // иначе просто фиксируем статус, вычитать нечего.
  if (payment.fulfilledAt) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: payment.userId } })
    if (user.remnawaveUuid) {
      await reduceRemnawaveSubscription(user.remnawaveUuid, { months: payment.plan.months, days: payment.plan.days })
    }
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED", refundedAt: new Date() },
  })
}
