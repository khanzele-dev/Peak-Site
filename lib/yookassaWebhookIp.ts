/**
 * ЮKassa не подписывает вебхуки, поэтому принимаем их только с официальных
 * адресов (https://yookassa.ru/developers/using-api/webhooks#ip). Иначе любой
 * мог бы слать поддельные уведомления и заставлять сайт дёргать API ЮKassa
 * и писать в БД на каждый запрос.
 *
 * Для локальной отладки через туннель (ngrok и т.п.) проверку можно выключить:
 * YOOKASSA_WEBHOOK_IP_CHECK="off". На проде не выключать.
 */

const IPV4_RANGES: Array<[string, number]> = [
  ["185.71.76.0", 27],
  ["185.71.77.0", 27],
  ["77.75.153.0", 25],
  ["77.75.156.11", 32],
  ["77.75.156.35", 32],
  ["77.75.154.128", 25],
]
// 2a02:5180::/32 — первые две группы адреса
const IPV6_PREFIX = "2a02:5180:"

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function inIpv4Range(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)
  if (baseInt === null) return false
  const size = 2 ** (32 - bits)
  const start = baseInt - (baseInt % size)
  return ip >= start && ip < start + size
}

export function isYookassaWebhookIp(ip: string): boolean {
  if (process.env.YOOKASSA_WEBHOOK_IP_CHECK === "off") return true

  const v4 = ipv4ToInt(ip)
  if (v4 !== null) return IPV4_RANGES.some(([base, bits]) => inIpv4Range(v4, base, bits))

  return ip.toLowerCase().startsWith(IPV6_PREFIX)
}
