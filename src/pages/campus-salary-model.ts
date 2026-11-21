import type { Person } from './campus-model'

type SalaryRecord = Record<string, unknown>

export function salaryRoster(teachers: Person[], items: SalaryRecord[], amounts: SalaryRecord[]) {
  const rows = teachers.filter((person) => String(person.status) !== '0').map((person) => ({
    person, settings: new Map<string, number>(), fixedTotal: 0,
  }))
  const staffById = new Map(rows.map((row) => [row.person.id, row]))
  const itemById = new Map(items.map((item) => [String(item.id), item]))
  for (const entry of amounts) {
    const row = staffById.get(Number(entry.staffId))
    const key = String(entry.salaryItemId)
    const amount = Number(entry.amount)
    if (row && itemById.has(key) && entry.amount != null && String(entry.amount).trim() !== '' && Number.isFinite(amount)) row.settings.set(key, amount)
  }
  const columnTotals = new Map<string, number>()
  for (const row of rows) {
    for (const [key, amount] of row.settings) {
      if (itemById.get(key)?.itemType === 'unit') continue
      row.fixedTotal += amount
      columnTotals.set(key, (columnTotals.get(key) ?? 0) + amount)
    }
  }
  return { rows, columnTotals, configuredCount: rows.filter((row) => row.settings.size > 0).length, fixedGrandTotal: rows.reduce((total, row) => total + row.fixedTotal, 0) }
}

export function salaryEditPayload(staffId: number, items: SalaryRecord[], settings: Map<string, number>, editedId: unknown, value: number | null | undefined) {
  const salaries = items.flatMap((item) => {
    const key = String(item.id)
    const amount = key === String(editedId) ? value : settings.get(key)
    return amount == null ? [] : [{ staffId, salaryItemId: item.id, salaryItemName: item.itemName, amount }]
  })
  return { staffIds: [staffId], salaries }
}
