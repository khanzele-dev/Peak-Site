import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { clientIp, jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"
import { findRemnawaveUserByShortUuid } from "@/lib/remnawave"
import { parseSubscriptionKey, toPublicSubscription } from "@/lib/guest"

const bodySchema = z.object({ key: z.string().max(2048) })

/** Находит подписку по ссылке (ключу) и отдаёт её статус без персональных данных. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  // Лимит по IP — вместе с энтропией ключа делает перебор бессмысленным
  if (await isRateLimited(`guest-lookup:ip:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError("Некорректные данные", 400)

  const key = parseSubscriptionKey(parsed.data.key)
  if (!key) return jsonError("Не удалось распознать ссылку. Вставьте ссылку на подписку целиком.", 400)

  let panelUser
  try {
    panelUser = await findRemnawaveUserByShortUuid(key)
  } catch (err) {
    console.error("[guest/lookup] remnawave lookup failed", err)
    return jsonError("Сервис подписок временно недоступен. Попробуйте позже.", 502)
  }
  if (!panelUser) return jsonError("Подписка не найдена. Проверьте ссылку.", 404)

  return NextResponse.json({
    subscription: toPublicSubscription(panelUser),
    canRenew: panelUser.status !== "DISABLED",
  })
})
