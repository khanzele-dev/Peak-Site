import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/**
 * Сколько доверенных прокси стоит перед приложением. Каждый прокси дописывает
 * адрес своего клиента в конец X-Forwarded-For, а всё, что левее, мог
 * подставить сам клиент. Поэтому берём N-ю запись справа.
 *  - Vercel или один nginx/Caddy перед `next start` → 1 (по умолчанию).
 *  - Cloudflare → nginx → Next → 2.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS) || 1))

function normalizeIp(ip: string): string {
  // IPv4, упакованный в IPv6 ("::ffff:1.2.3.4"), приводим к обычному виду
  return ip.trim().replace(/^::ffff:/i, "")
}

/**
 * IP клиента для rate limit и allowlist'ов. Не доверяем левым значениям
 * X-Forwarded-For — их может подделать клиент и так обойти лимиты по IP.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (forwarded.length > 0) {
    return normalizeIp(forwarded[Math.max(0, forwarded.length - TRUSTED_PROXY_HOPS)])
  }
  const realIp = req.headers.get("x-real-ip")
  return realIp ? normalizeIp(realIp) : "unknown"
}

/** Единая точка для ответов об ошибке — никогда не пробрасывает message исключения наружу. */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export const TOO_MANY_REQUESTS = "Слишком много запросов. Попробуйте позже."
