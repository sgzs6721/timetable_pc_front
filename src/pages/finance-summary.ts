export function allCampusSummary(rows: Array<{ overview?: Record<string, unknown> | null }>, expectedCount = rows.length) {
  const available = rows.length === expectedCount && rows.every((row) => row.overview != null)
  const sum = (key: string) => rows.reduce((total, row) => total + Math.round(Number(row.overview?.[key] || 0) * 100), 0)
  const income = sum('income')
  const paid = sum('paidExpense')
  const pending = sum('pendingExpense')
  return { available, income: income / 100, paid: paid / 100, pending: pending / 100, expense: (paid + pending) / 100 }
}

export function editableFinanceRecord(row: Record<string, unknown>): boolean {
  return Number(row.id) > 0 && ['manual_income', 'manual_expense', 'recurring_expense_payment'].includes(String(row.sourceType || ''))
}

export function financeRecordKey(row: Record<string, unknown>, index: number): string {
  return `${row.sourceType || row.detailType || 'record'}:${row.direction || ''}:${row.id || `${row.staffId || row.studentId || row.title}:${row.bizDate}:${index}`}`
}
