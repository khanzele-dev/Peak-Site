import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { jsonError, TOO_MANY_REQUESTS } from "@/lib/http"
import { withErrorHandling } from "@/lib/apiHandler"
import { isRateLimited } from "@/lib/rateLimit"

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser()
  if (!user) return jsonError("Не авторизован", 401)

  if (await isRateLimited(`payments:user:${user.id}`, 30, 60 * 1000)) {
    return jsonError(TOO_MANY_REQUESTS, 429)
  }

  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { plan: { select: { name: true } } },
  })

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      date: p.createdAt,
      description: `Подписка — ${p.plan.name}`,
      amount: p.amountRub,
      currency: "₽",
      status:
        p.status === "SUCCEEDED"
          ? "paid"
          : p.status === "PENDING"
            ? "pending"
            : p.status === "REFUNDED"
              ? "refunded"
              : "failed",
    })),
  })
})
