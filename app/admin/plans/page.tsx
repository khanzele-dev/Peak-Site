import { prisma } from "@/lib/prisma"
import { togglePlanActive, createPlan, updatePlan, deletePlan } from "./actions"

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-[#d6a33a]"

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } })

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-white">Тарифы</h1>
      <p className="mb-4 text-xs text-[#a0a0a0]">
        Изменения здесь сразу видны на главной странице и в личном кабинете — они всегда берут список тарифов
        из /api/plans. Скрытый тариф пропадает с сайта, но остаётся в базе (историю платежей по нему не теряем).
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-[#a0a0a0]">
              <th className="px-3 py-3">Код</th>
              <th className="px-3 py-3">Название</th>
              <th className="px-3 py-3">Бейдж (опц.)</th>
              <th className="px-3 py-3">Мес.</th>
              <th className="px-3 py-3">Дн.</th>
              <th className="px-3 py-3">Цена, ₽</th>
              <th className="px-3 py-3">Сорт.</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const formId = `plan-form-${plan.id}`
              return (
                <tr key={plan.id} className="border-b border-white/5 align-top last:border-none">
                  <td className="px-3 py-3 text-[#a0a0a0]">
                    {plan.code}
                    {/* Форма без визуального тела — инпуты в других ячейках привязаны к ней через form={formId} */}
                    <form id={formId} action={updatePlan.bind(null, plan.id)} />
                  </td>
                  <td className="min-w-[140px] px-3 py-3">
                    <input form={formId} name="name" defaultValue={plan.name} required className={inputClass} />
                  </td>
                  <td className="min-w-[130px] px-3 py-3">
                    <input
                      form={formId}
                      name="badge"
                      defaultValue={plan.badge ?? ""}
                      placeholder="—"
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      form={formId}
                      name="months"
                      type="number"
                      min={0}
                      defaultValue={plan.months}
                      className={`${inputClass} w-16`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      form={formId}
                      name="days"
                      type="number"
                      min={0}
                      defaultValue={plan.days}
                      className={`${inputClass} w-16`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      form={formId}
                      name="priceRub"
                      type="number"
                      min={1}
                      required
                      defaultValue={plan.priceRub}
                      className={`${inputClass} w-24`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      form={formId}
                      name="sortOrder"
                      type="number"
                      defaultValue={plan.sortOrder}
                      className={`${inputClass} w-16`}
                    />
                  </td>
                  <td className="px-3 py-3 text-[#a0a0a0]">{plan.isActive ? "Активен" : "Скрыт"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="submit"
                        form={formId}
                        className="w-full rounded-md bg-[#d6a33a] px-3 py-1.5 text-xs font-semibold text-[#050505] transition hover:opacity-90"
                      >
                        Сохранить
                      </button>
                      <form action={togglePlanActive.bind(null, plan.id)} className="w-full">
                        <button
                          type="submit"
                          className="w-full rounded-md border border-[#d6a33a]/40 px-3 py-1.5 text-xs font-medium text-[#e8e8e8] transition hover:bg-[#d6a33a] hover:text-[#050505]"
                        >
                          {plan.isActive ? "Скрыть" : "Показать"}
                        </button>
                      </form>
                      <form action={deletePlan.bind(null, plan.id)} className="w-full">
                        <button
                          type="submit"
                          className="w-full rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition hover:border-red-500/40 hover:text-red-400"
                        >
                          Удалить
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              )
            })}
            {plans.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-[#a0a0a0]">Тарифов пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-widest text-[#a0a0a0]">Новый тариф</h2>
      <form
        action={createPlan}
        className="grid max-w-3xl grid-cols-2 gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#080808] p-5 sm:grid-cols-3"
      >
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-xs text-[#a0a0a0]">Код (уникальный)</span>
          <input name="code" required placeholder="test5d" className={inputClass} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-xs text-[#a0a0a0]">Название</span>
          <input name="name" required placeholder="Тест (+5 дней)" className={inputClass} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-xs text-[#a0a0a0]">Бейдж (необязательно)</span>
          <input name="badge" placeholder="Популярное" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[#a0a0a0]">Месяцев</span>
          <input name="months" type="number" min={0} defaultValue={0} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[#a0a0a0]">Дней</span>
          <input name="days" type="number" min={0} defaultValue={0} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[#a0a0a0]">Цена, ₽</span>
          <input name="priceRub" type="number" min={1} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[#a0a0a0]">Порядок сортировки</span>
          <input name="sortOrder" type="number" defaultValue={99} className={inputClass} />
        </label>
        <div className="col-span-2 flex items-end sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-[#d6a33a] px-4 py-2 text-sm font-semibold text-[#050505] transition hover:opacity-90"
          >
            Создать тариф
          </button>
        </div>
      </form>
      <p className="mt-4 text-xs text-[#a0a0a0]">
        Бейдж — необязательная метка на карточке тарифа (например «Популярное», «Выгода ≈5%»). Если заполнен,
        карточка на сайте выделяется. Если оставить пустым — тариф отображается обычной карточкой без метки.
      </p>
    </div>
  )
}
