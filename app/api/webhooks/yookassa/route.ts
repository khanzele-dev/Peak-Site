import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { reconcileYookassaPayment, reconcileYookassaRefund } from "@/lib/paymentFulfillment"
import { withErrorHandling } from "@/lib/apiHandler"
import { clientIp } from "@/lib/http"
import { isYookassaWebhookIp } from "@/lib/yookassaWebhookIp"

// Id платежей и возвратов ЮKassa — 36 символов вида 3224b411-000f-5001-8000-1a0b04b7d454
const YOOKASSA_OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ЮKassa не подписывает вебхуки, поэтому:
 *  1) принимаем их только с официальных IP ЮKassa (lib/yookassaWebhookIp.ts);
 *  2) телу запроса не доверяем — оно только говорит "сходи проверь платёж/
 *     возврат X". Сама сверка — в lib/paymentFulfillment.ts (переиспользуется
 *     и при ручной сверке на /api/payments/sync).
 *
 * `event` различает тип уведомления: "refund.succeeded" — возврат (тогда
 * object.id — id возврата, а не платежа), всё остальное — событие по
 * платежу. Не забудьте включить уведомления о возвратах в настройках
 * вебхуков ЮKassa — по умолчанию включены только события по платежам.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ip = clientIp(req)
  if (!isYookassaWebhookIp(ip)) {
    console.warn("[webhooks/yookassa] rejected request from non-YooKassa IP", ip)
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const event: string | undefined = typeof body?.event === "string" ? body.event.slice(0, 64) : undefined
  const objectId: string | undefined = body?.object?.id

  if (typeof objectId !== "string" || !YOOKASSA_OBJECT_ID.test(objectId)) {
    return NextResponse.json({ ok: true }) // не наш формат — тихо игнорируем, 200 чтобы не ретраилось
  }

  const isRefund = event === "refund.succeeded"

  await prisma.webhookEvent
    .create({ data: { provider: "YOOKASSA", externalId: `${event ?? "payment"}:${objectId}` } })
    .catch(() => {
      // уже видели этот event id — это нормально, ЮKassa ретраит доставку
    })

  try {
    const result = isRefund
      ? await reconcileYookassaRefund(objectId)
      : await reconcileYookassaPayment(objectId)

    if (!result) {
      console.error("[webhooks/yookassa] unknown", isRefund ? "refund" : "payment", objectId)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[webhooks/yookassa] reconcile failed, will retry on next delivery", err)
    // 500 → ЮKassa повторит доставку вебхука, а значит и попытку обработки
    return NextResponse.json({ error: "reconcile failed" }, { status: 500 })
  }
})
