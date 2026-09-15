import { createHash, randomBytes } from "node:crypto"
import type { RemnawaveStatus, RemnawaveUser } from "@/lib/remnawave"

/**
 * Покупка и продление без регистрации.
 *
 * Ключ доступа к подписке — её собственная ссылка (sub.../<shortUuid>): это
 * случайная строка панели (~95 бит), тот, у кого она есть, и так пользуется
 * VPN. Управление по ней не даёт ничего сверх этого: посмотреть срок/трафик
 * и оплатить продление. Перебор упирается в энтропию и rate limit по IP.
 *
 * Токен заказа — отдельный одноразовый секрет (256 бит) в return URL ЮKassa:
 * по нему покупатель видит результат оплаты и получает ссылку подписки.
 * В БД хранится только его sha256.
 */

// Результат заказа по токену доступен неделю — дальше подписка открывается
// по постоянной ссылке управления.
export const GUEST_ORDER_TTL_MS = 7 * 24 * 60 * 60 * 1000

const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateGuestToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashGuestToken(token) }
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function isGuestToken(value: unknown): value is string {
  return typeof value === "string" && GUEST_TOKEN_RE.test(value)
}

const SUBSCRIPTION_KEY_RE = /^[A-Za-z0-9_-]{10,64}$/

/**
 * Достаёт shortUuid из того, что вставил пользователь: ссылка подписки
 * (https://sub.example/XcxEtZGAAjXaF92y, в т.ч. с суффиксом вида /json),
 * ссылка управления (https://site/renew.html#XcxEtZGAAjXaF92y) или сам ключ.
 */
export function parseSubscriptionKey(input: unknown): string | null {
  if (typeof input !== "string") return null
  const raw = input.trim()
  if (!raw || raw.length > 2048) return null
  if (SUBSCRIPTION_KEY_RE.test(raw)) return raw

  let url: URL
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const candidates = [decodeURIComponent(url.hash.replace(/^#/, "")), ...url.pathname.split("/").reverse()]
  return candidates.find((part) => SUBSCRIPTION_KEY_RE.test(part)) ?? null
}

/** Данные подписки, которые безопасно отдавать по ключу: без username/description/id панели. */
export type PublicSubscription = {
  key: string
  status: RemnawaveStatus
  expireAt: string
  trafficUsedBytes: number
  trafficLimitBytes: number
  subscriptionUrl: string
}

export function toPublicSubscription(user: RemnawaveUser): PublicSubscription {
  return {
    key: user.shortUuid,
    status: user.status,
    expireAt: user.expireAt,
    trafficUsedBytes: user.userTraffic?.usedTrafficBytes ?? 0,
    trafficLimitBytes: user.trafficLimitBytes,
    subscriptionUrl: user.subscriptionUrl,
  }
}
