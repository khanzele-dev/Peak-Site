import type { Payment, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fetchYookassaPayment, fetchYookassaRefund } from "@/lib/yookassa"
import {
  accountRemnawaveUsername,
  ensureRemnawaveUser,
  extendRemnawaveSubscription,
  guestRemnawaveUsername,
  reduceRemnawaveSubscription,
} from "@/lib/remnawave"

// Выдача VPN ходит в панель, поэтому транзакции нужен запас по времени.
const FULFILLMENT_TX = { maxWait: 30_000, timeout: 60_000 }

/**
 * Сериализует обработку одного платежа: вебхук ЮKassa и сверка со страницы
 * (кабинет или страница заказа без регистрации) могут прийти одновременно —
 * без блокировки оба увидели бы fulfilledAt = null и продлили бы подписку дважды.
 */
async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${paymentId}))`
}

/** Какому пользователю панели выдавать VPN по этому платежу (при необходимости — создаёт его). */
async function resolvePanelUserId(tx: Prisma.TransactionClient, payment: Payment): Promise<string> {
  // Продление без регистрации или повторная попытка выдачи
  if (payment.remnawaveUserId) return payment.remnawaveUserId

  if (payment.userId) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } })
    if (user.remnawaveUuid) return user.remnawaveUuid
    const created = await ensureRemnawaveUser({
      username: accountRemnawaveUsername(user.phone),
      // externalId (id пользователя в БД сайта) оставляем в описании — если
      // username когда-нибудь разъедется с телефоном, запись всё равно найдётся.
      description: `PEAK (сайт) · ${user.phone} · site_id:${user.id}`,
    })
    await tx.user.update({ where: { id: user.id }, data: { remnawaveUuid: created.id } })
    return created.id
  }

  // Покупка без регистрации: новый пользователь панели на этот заказ
  const created = await ensureRemnawaveUser({
    username: guestRemnawaveUsername(payment.id),
    description: `PEAK (без регистрации) · order:${payment.id}`,
  })
  return created.id
}

/**
 * Общая логика подтверждения оплаты — используется вебхуком ЮKassa, сверкой
 * при возврате в кабинет (/api/payments/sync) и страницей заказа без
 * регистрации (/api/guest/order). ЮKassa не подписывает вебхуки, поэтому
 * телу запроса не доверяем — реальный статус всегда берём из их API.
 *
 * Идемпотентна: Payment.status меняется на SUCCEEDED только один раз,
 * Payment.fulfilledAt под блокировкой защищает от повторной выдачи VPN.
 */
export async function reconcileYookassaPayment(providerPaymentId: string) {
  const verified = await fetchYookassaPayment(providerPaymentId)

  const payment = await prisma.payment.findUnique({ where: { providerPaymentId: verified.id } })
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
    await prisma.$transaction(async (tx) => {
      await lockPayment(tx, payment.id)
      const locked = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } })
      if (locked.fulfilledAt) return // уже выдал параллельный запрос

      const panelUserId = await resolvePanelUserId(tx, locked)
      // Сохраняем до продления: если выдача упадёт, повтор возьмёт того же пользователя панели
      if (locked.remnawaveUserId !== panelUserId) {
        await prisma.payment.update({ where: { id: locked.id }, data: { remnawaveUserId: panelUserId } })
      }
      await extendRemnawaveSubscription(panelUserId, { months: locked.plan.months, days: locked.plan.days })
      await tx.payment.update({
        where: { id: locked.id },
        data: { fulfilledAt: new Date(), remnawaveUserId: panelUserId },
      })
    }, FULFILLMENT_TX)
  }

  return prisma.payment.findUnique({ where: { id: payment.id } })
}

/**
 * Возврат средств за конкретный платёж — урезает подписку ровно на
 * длительность этого платежа, не больше (даже если платежей было несколько).
 * Идемпотентна через Payment.refundedAt, как и выдача.
 */
export async function reconcileYookassaRefund(refundId: string) {
  const refund = await fetchYookassaRefund(refundId)
  if (refund.status !== "succeeded") return null

  const payment = await prisma.payment.findUnique({ where: { providerPaymentId: refund.payment_id } })
  if (!payment || payment.refundedAt) return payment

  return prisma.$transaction(async (tx) => {
    await lockPayment(tx, payment.id)
    const locked = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } })
    if (locked.refundedAt) return locked

    // Урезаем VPN только если по этому платежу его вообще выдавали —
    // иначе просто фиксируем статус, вычитать нечего.
    if (locked.fulfilledAt) {
      let panelUserId = locked.remnawaveUserId
      if (!panelUserId && locked.userId) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: locked.userId } })
        panelUserId = user.remnawaveUuid
      }
      if (panelUserId) {
        await reduceRemnawaveSubscription(panelUserId, { months: locked.plan.months, days: locked.plan.days })
      }
    }

    return tx.payment.update({
      where: { id: locked.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    })
  }, FULFILLMENT_TX)
}
