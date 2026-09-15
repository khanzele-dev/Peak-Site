/**
 * Клиент Remnawave API. Все секреты и вызовы — только на сервере,
 * фронтенд никогда не видит REMNAWAVE_API_TOKEN.
 *
 * Схема подтверждена вручную против реальной панели (panel.peak-tech.online,
 * 2026-09-15) — не полагаемся на типовую документацию Remnawave, там были
 * расхождения. Ключевые нюансы:
 *  - Все ответы обёрнуты в `{ "response": ... }`.
 *  - У пользователя нет поля `uuid` — он адресуется числовым `id`
 *    (GET /api/users/{id}); старые панели с uuid этим клиентом не поддерживаются.
 *  - Отдельного эндпоинта подписки нет — все данные (status/expireAt/
 *    трафик/subscriptionUrl) лежат прямо на объекте пользователя.
 *  - Создание пользователя требует expireAt/trafficLimitBytes/
 *    trafficLimitStrategy и явного назначения squad (иначе доступа к
 *    серверам не будет вообще — "пользователь есть, VPN не работает").
 *  - Продление — PATCH /api/users, `id` передаётся в теле, не в пути.
 *  - Ненайденный пользователь — 404 (errorCode A063).
 *
 * В БД сайта id панели хранится строкой в User.remnawaveUuid (имя поля
 * историческое, схему не трогаем).
 */

const BASE_URL = process.env.REMNAWAVE_API_URL
const API_TOKEN = process.env.REMNAWAVE_API_TOKEN
// UUID squad'а, в который попадают все платные пользователи сайта.
// Посмотреть/сменить: GET /api/internal-squads в панели.
const SQUAD_UUID = process.env.REMNAWAVE_SQUAD_UUID

// Стандартный пакет для платных тарифов сайта (200 GiB, сброс раз в месяц).
const DEFAULT_TRAFFIC_LIMIT_BYTES = 200 * 1024 * 1024 * 1024
const DEFAULT_TRAFFIC_STRATEGY = "MONTH"

function assertConfigured() {
  if (!BASE_URL || !API_TOKEN) {
    throw new Error("Remnawave is not configured (REMNAWAVE_API_URL / REMNAWAVE_API_TOKEN)")
  }
}

class RemnawaveNotFoundError extends Error {}

async function rw<T>(path: string, init?: RequestInit): Promise<T> {
  assertConfigured()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    const message = `Remnawave API ${path} -> ${res.status}: ${body}`
    throw res.status === 404 ? new RemnawaveNotFoundError(message) : new Error(message)
  }
  const json = await res.json()
  return json.response as T
}

type RemnawaveUser = {
  id: number
  username: string
  status: "ACTIVE" | "DISABLED" | "LIMITED" | "EXPIRED"
  expireAt: string
  trafficLimitBytes: number
  subscriptionUrl: string
  userTraffic?: { usedTrafficBytes: number } | null
}

export type RemnawaveSubscription = {
  status: "ACTIVE" | "DISABLED" | "LIMITED" | "EXPIRED"
  expireAt: string
  trafficLimitBytes: number
  trafficUsedBytes: number
  subscriptionUrl: string
}

export type RemnawaveNode = {
  host: string
  countryCode: string
  status: "online" | "offline"
}

function toSubscription(user: RemnawaveUser): RemnawaveSubscription {
  return {
    status: user.status,
    expireAt: user.expireAt,
    trafficLimitBytes: user.trafficLimitBytes,
    trafficUsedBytes: user.userTraffic?.usedTrafficBytes ?? 0,
    subscriptionUrl: user.subscriptionUrl,
  }
}

/** id панели хранится строкой — приводим к числу и падаем с понятной причиной,
 *  если в БД осталась ссылка старого формата (uuid от прежней панели). */
function toPanelId(storedId: string): number {
  const id = Number(storedId)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Remnawave: некорректный id пользователя панели "${storedId}" (ожидается число)`)
  }
  return id
}

// Remnawave принимает в username только [A-Za-z0-9_-]. Префикс "site_" —
// чтобы в общем списке панели было сразу видно источник, а по цифрам телефона
// пользователя можно было найти поиском (телефон нормализован как +7XXXXXXXXXX,
// см. lib/phone.ts).
function buildRemnawaveUsername(phone: string): string {
  return `site_${phone.replace(/\D/g, "")}`
}

/**
 * Находит пользователя панели по username (site_<телефон>), либо создаёт нового.
 * Поиск нужен для идемпотентности: если прошлая попытка выдачи создала
 * пользователя, но упала до сохранения id в БД, повторная не должна
 * упереться в занятый username.
 */
export async function ensureRemnawaveUser(params: {
  externalId: string
  phone: string
}): Promise<{ id: string }> {
  if (!SQUAD_UUID) {
    throw new Error("Remnawave squad is not configured (REMNAWAVE_SQUAD_UUID)")
  }
  const username = buildRemnawaveUsername(params.phone)

  try {
    const existing = await rw<RemnawaveUser>(`/api/users/by-username/${encodeURIComponent(username)}`)
    return { id: String(existing.id) }
  } catch (err) {
    if (!(err instanceof RemnawaveNotFoundError)) throw err
  }

  const created = await rw<RemnawaveUser>("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      // Новый пользователь стартует "истёкшим" — extendRemnawaveSubscription
      // сразу после этого вызова продлевает его на купленный срок.
      expireAt: new Date().toISOString(),
      trafficLimitBytes: DEFAULT_TRAFFIC_LIMIT_BYTES,
      trafficLimitStrategy: DEFAULT_TRAFFIC_STRATEGY,
      activeInternalSquads: [SQUAD_UUID],
      // externalId (id пользователя в БД сайта) оставляем в описании — если
      // username когда-нибудь разъедется с телефоном (смена номера и т.п.),
      // по этому id всё равно можно найти запись в БД сайта для саппорта.
      description: `PEAK (сайт) · ${params.phone} · site_id:${params.externalId}`,
    }),
  })
  return { id: String(created.id) }
}

export async function getRemnawaveSubscription(storedId: string): Promise<RemnawaveSubscription> {
  const user = await rw<RemnawaveUser>(`/api/users/${toPanelId(storedId)}`)
  return toSubscription(user)
}

export type SubscriptionDuration = { months: number; days: number }

/** Месяцы/дни могут прийти NaN из повреждённого ответа Remnawave или из
 *  рассинхронизированного Prisma Client (запущенный dev-процесс со старой
 *  схемой) — лучше упасть здесь с понятной причиной, чем внутри toISOString(). */
function assertValidDate(date: Date, context: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Remnawave: получена невалидная дата (${context})`)
  }
}

/** Продлевает подписку пользователя на N месяцев + N дней (используется и для первой активации). */
export async function extendRemnawaveSubscription(storedId: string, duration: SubscriptionDuration): Promise<void> {
  const id = toPanelId(storedId)
  const current = await rw<RemnawaveUser>(`/api/users/${id}`)
  const currentExpireAt = new Date(current.expireAt)
  assertValidDate(currentExpireAt, `user.expireAt="${current.expireAt}"`)
  const base = currentExpireAt > new Date() ? currentExpireAt : new Date()
  const nextExpireAt = new Date(base)
  nextExpireAt.setMonth(nextExpireAt.getMonth() + duration.months)
  nextExpireAt.setDate(nextExpireAt.getDate() + duration.days)
  assertValidDate(nextExpireAt, `months=${duration.months} days=${duration.days}`)

  await rw("/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id, expireAt: nextExpireAt.toISOString() }),
  })
}

/** Возврат средств за оплату — урезает подписку ровно на длительность этого
 *  конкретного платежа, не больше. Если expireAt уходит в прошлое — это
 *  нормально, Remnawave просто отдаст статус EXPIRED. */
export async function reduceRemnawaveSubscription(storedId: string, duration: SubscriptionDuration): Promise<void> {
  const id = toPanelId(storedId)
  const current = await rw<RemnawaveUser>(`/api/users/${id}`)
  const nextExpireAt = new Date(current.expireAt)
  assertValidDate(nextExpireAt, `user.expireAt="${current.expireAt}"`)
  nextExpireAt.setMonth(nextExpireAt.getMonth() - duration.months)
  nextExpireAt.setDate(nextExpireAt.getDate() - duration.days)
  assertValidDate(nextExpireAt, `months=${duration.months} days=${duration.days}`)

  await rw("/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id, expireAt: nextExpireAt.toISOString() }),
  })
}

export async function listRemnawaveNodes(): Promise<RemnawaveNode[]> {
  const nodes = await rw<
    Array<{ address: string; countryCode: string; isConnected: boolean; isDisabled: boolean }>
  >("/api/nodes")
  return nodes.map((n) => ({
    host: n.address,
    countryCode: n.countryCode,
    status: n.isConnected && !n.isDisabled ? "online" : "offline",
  }))
}
