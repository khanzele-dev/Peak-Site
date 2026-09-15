const isDev = process.env.NODE_ENV !== "production"

/**
 * Content-Security-Policy. 'unsafe-inline' в script-src нужен App Router'у
 * админки (инлайн-скрипты гидратации без nonce); статические страницы
 * инлайн-скриптов не содержат. Внешние источники — только то, что реально
 * используется: Google Fonts и jsDelivr (qrcode.js, twemoji и его SVG-флаги).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.jsdelivr.net",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Запрет встраивания в чужие сайты (кликджекинг на входе/в кабинете)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS только на проде: браузер запоминает "только HTTPS" на 2 года
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Ответы API содержат данные пользователя — никаких кешей по пути
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Корень отдаёт статический лендинг из /public/index.html
        { source: "/", destination: "/index.html" },
      ],
    }
  },
}

export default nextConfig
