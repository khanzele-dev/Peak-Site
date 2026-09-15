import { isYookassaConfigured } from "@/lib/yookassa"

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3 last:border-none">
      <div>
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-[#a0a0a0]">{hint}</p>
      </div>
      <span
        className={
          "rounded-full px-3 py-1 text-xs font-medium " +
          (ok ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-[#a0a0a0]")
        }
      >
        {ok ? "Подключено" : "Не настроено"}
      </span>
    </div>
  )
}

export default function AdminSettingsPage() {
  const remnawaveConfigured = Boolean(process.env.REMNAWAVE_API_URL && process.env.REMNAWAVE_API_TOKEN)

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Настройки</h1>
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#080808] px-5">
        <StatusRow
          label="Remnawave"
          ok={remnawaveConfigured}
          hint="REMNAWAVE_API_URL / REMNAWAVE_API_TOKEN в .env.local"
        />
        <StatusRow
          label="ЮKassa"
          ok={isYookassaConfigured()}
          hint="YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY в .env.local"
        />
      </div>
      <p className="mt-4 text-xs text-[#a0a0a0]">
        Все ключи меняются только в .env.local на сервере — здесь их нельзя увидеть или отредактировать намеренно.
      </p>
    </div>
  )
}
