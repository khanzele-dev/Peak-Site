import { config as loadEnv } from "dotenv"
import { defineConfig, env } from "prisma/config"

// Next.js читает .env.local, Prisma CLI по умолчанию — .env. Держим один файл
// (.env.local) источником правды для обоих, чтобы не дублировать переменные.
loadEnv({ path: ".env.local", quiet: true })

// `prisma generate` к БД не подключается, но конфиг требует URL. На Vercel он
// запускается в postinstall, где DATABASE_URL может быть ещё не задан, — для
// этой команды подставляем заглушку. Остальные команды (migrate/studio/seed)
// по-прежнему падают с понятной ошибкой, если переменной нет.
const isGenerate = process.argv.includes("generate")
const PLACEHOLDER_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder"

// Используется только CLI-командами (migrate/studio/generate).
// Рантайм-подключение (PrismaClient) настроено отдельно в lib/prisma.ts через driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || (isGenerate ? PLACEHOLDER_URL : env("DATABASE_URL")),
  },
  migrations: {
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
})
