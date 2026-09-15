import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { clientIp, jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"
import { checkoutErrorResponse, findActivePlan, startCheckout } from "@/lib/checkout"

const bodySchema = z.object({ planId: z.string().max(64) })

/** Покупка VPN без регистрации: создаёт платёж, пользователь панели появится после оплаты. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  if (await isRateLimited(`guest-buy:ip:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError("Некорректные данные", 400)

  const plan = await findActivePlan(parsed.data.planId)
  if (!plan) return jsonError("Тариф не найден", 404)

  try {
    const { confirmationUrl } = await startCheckout({ kind: "GUEST_NEW", plan })
    return NextResponse.json({ confirmationUrl })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
})
