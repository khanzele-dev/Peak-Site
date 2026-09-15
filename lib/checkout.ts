import type { Plan } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createYookassaPayment, isYookassaConfigured } from "@/lib/yookassa"
import { generateGuestToken } from "@/lib/guest"
import { jsonError } from "@/lib/http"

/**
 * Единая точка создания платежа ЮKassa — для кабинета и для покупки/продления
 * без регистрации. Сумма всегда берётся из тарифа в БД, не из запроса.
 */

export class CheckoutUnavailableError extends Error {}
export class CheckoutFailedError extends Error {}

export type CheckoutParams =
  | { kind: "ACCOUNT"; plan: Plan; userId: string }
  | { kind: "GUEST_NEW"; plan: Plan }
  | { kind: "GUEST_RENEW"; plan: Plan; remnawaveUserId: string }

function resolveAppUrl(): string | null {
  const configured = process.env.APP_URL?.replace(/\/+$/, "")
  if (configured) return configured
  // Без APP_URL на проде ЮKassa вернула бы пользователя на localhost
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000"
}

export async function findActivePlan(planId: string): Promise<Plan | null> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  return plan && plan.isActive ? plan : null
}

export async function startCheckout(params: CheckoutParams): Promise<{ confirmationUrl: string }> {
  const appUrl = resolveAppUrl()
  if (!appUrl) console.error("[checkout] APP_URL не задан — оплата отключена")
  if (!appUrl || !isYookassaConfigured()) throw new CheckoutUnavailableError()

  const { plan, kind } = params
  const guest = kind === "ACCOUNT" ? null : generateGuestToken()

  const payment = await prisma.payment.create({
    data: {
      kind,
      userId: kind === "ACCOUNT" ? params.userId : null,
      remnawaveUserId: kind === "GUEST_RENEW" ? params.remnawaveUserId : null,
      guestTokenHash: guest?.hash ?? null,
      planId: plan.id,
      amountRub: plan.priceRub,
      status: "PENDING",
    },
  })

  const returnUrl =
    kind === "ACCOUNT"
      ? `${appUrl}/dashboard.html?payment=pending`
      : `${appUrl}/${kind === "GUEST_RENEW" ? "renew" : "buy"}.html?order=${guest!.token}`

  try {
    const ykPayment = await createYookassaPayment({
      idempotenceKey: payment.id,
      amountRub: plan.priceRub,
      description: kind === "GUEST_RENEW" ? `PEAK — продление «${plan.name}»` : `PEAK — тариф «${plan.name}»`,
      returnUrl,
      metadata: {
        paymentId: payment.id,
        planId: plan.id,
        kind,
        ...(kind === "ACCOUNT" ? { userId: params.userId } : {}),
      },
    })

    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId: ykPayment.id },
    })

    const confirmationUrl = ykPayment.confirmation?.confirmation_url
    if (!confirmationUrl) throw new Error("YooKassa returned no confirmation_url")
    return { confirmationUrl }
  } catch (err) {
    console.error("[checkout]", err)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } })
    throw new CheckoutFailedError()
  }
}

/** Ответ API для ошибок startCheckout; прочие исключения пробрасывает дальше. */
export function checkoutErrorResponse(err: unknown) {
  if (err instanceof CheckoutUnavailableError) {
    return jsonError("Оплата временно недоступна, попробуйте позже.", 503)
  }
  if (err instanceof CheckoutFailedError) {
    return jsonError("Не удалось создать платёж. Попробуйте позже.", 502)
  }
  throw err
}
