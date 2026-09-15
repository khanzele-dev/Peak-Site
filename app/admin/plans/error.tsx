"use client"

export default function AdminPlansError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Тарифы</h1>
      <div className="rounded-xl border border-[#d6a33a]/30 bg-[#d6a33a]/10 px-5 py-4">
        <p className="text-sm text-[#f5d98a]">{error.message || "Не удалось выполнить действие"}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md border border-[#d6a33a]/40 px-3 py-1.5 text-xs font-medium text-[#e8e8e8] transition hover:bg-[#d6a33a] hover:text-[#050505]"
        >
          Понятно, вернуться к тарифам
        </button>
      </div>
    </div>
  )
}
