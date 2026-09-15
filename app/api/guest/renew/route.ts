import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { clientIp, jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"
import { findRemnawaveUserByShortUuid } from "@/lib/remnawave"
import { parseSubscriptionKey } from "@/lib/guest"
import { checkoutErrorResponse, findActivePlan, startCheckout } from "@/lib/checkout"

const bodySchema = z.object({ key: z.string().max(2048), planId: z.string().max(64) })

/** Продление без регистрации: платёж сразу привязан к пользователю панели из ссылки. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  if (await isRateLimited(`guest-renew:ip:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError("Некорректные данные", 400)

  const key = parseSubscriptionKey(parsed.data.key)
  if (!key) return jsonError("Не удалось распознать ссылку. Вставьте ссылку на подписку целиком.", 400)

  const plan = await findActivePlan(parsed.data.planId)
  if (!plan) return jsonError("Тариф не найден", 404)

  let panelUser
  try {
    panelUser = await findRemnawaveUserByShortUuid(key)
  } catch (err) {
    console.error("[guest/renew] remnawave lookup failed", err)
    return jsonError("Сервис подписок временно недоступен. Попробуйте позже.", 502)
  }
  if (!panelUser) return jsonError("Подписка не найдена. Проверьте ссылку.", 404)
  if (panelUser.status === "DISABLED") {
    return jsonError("Подписка отключена — продление недоступно. Напишите в поддержку.", 409)
  }

  try {
    const { confirmationUrl } = await startCheckout({
      kind: "GUEST_RENEW",
      plan,
      remnawaveUserId: String(panelUser.id),
    })
    return NextResponse.json({ confirmationUrl })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
})
