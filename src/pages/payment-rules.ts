export interface PeriodValidityRule {
  days: number
  label: string
}

const PERIOD_VALIDITY_RULES: Record<string, PeriodValidityRule> = {
  WEEK: { days: 7, label: '周卡' },
  MONTH: { days: 31, label: '月卡' },
  QUARTER: { days: 93, label: '季卡' },
  HALF_YEAR: { days: 180, label: '半年卡' },
  YEAR: { days: 365, label: '年卡' },
}

function parseDateText(dateText: string): Date | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function getPeriodValidityRule(periodType?: string | null): PeriodValidityRule | null {
  return PERIOD_VALIDITY_RULES[String(periodType || '').trim().toUpperCase()] || null
}

export function computePeriodValidityEndDate(startDate: string, periodType?: string | null): string {
  const start = parseDateText(startDate)
  const rule = getPeriodValidityRule(periodType)
  if (!start || !rule) return ''
  start.setDate(start.getDate() + rule.days - 1)
  return formatDate(start)
}

export function periodValidityError(category: string, type: string, start: string, end: string, periodType?: string | null): string {
  if (String(category || '').toUpperCase() !== 'PERIOD') return ''
  if (type !== 'new' && type !== 'renew' && type !== 'supplement') return ''
  if (!start || !end) return '请选择完整的有效期'
  if (end < start) return '有效期结束不能早于开始'
  const rule = getPeriodValidityRule(periodType)
  if (!rule) return '时段卡类型未设置，无法校验有效期'
  const expectedEndDate = computePeriodValidityEndDate(start, periodType)
  if (!expectedEndDate) return '有效期日期格式不正确'
  if (end !== expectedEndDate) return `${rule.label}有效期必须为${rule.days}天，结束日期应为${expectedEndDate}`
  return ''
}

export function paymentDateLabel(type: string, reason: string, category: string): string {
  const card = String(category || '').toUpperCase()
  if (type === 'refund') return '退费日期'
  if (type === 'supplement') return '补缴日期'
  if (type === 'adjustment') {
    if (reason === 'activity_gift') return '赠课日期'
    if (reason === 'clear_hours' || reason === 'clear_amount') return '清空日期'
    if (reason === 'transfer') return card === 'PERIOD' || card === 'STORED_VALUE' ? '转让日期' : '转课日期'
    if (reason === 'manual_add_amount' || reason === 'change_validity') return '调整日期'
    if (reason === 'manual_deduct_amount') return '扣减日期'
    return '扣课日期'
  }
  return type === 'renew' ? '续费日期' : '缴费日期'
}

function inclusiveDayCount(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.round((end.getTime() - start.getTime()) / dayMs) + 1
}

function roundHalfUp(value: number, scale: number): number {
  const factor = 10 ** scale
  const shifted = value * factor
  const rounded = Math.sign(shifted) * Math.floor(Math.abs(shifted) + 0.5 + 1e-8)
  return rounded / factor
}

/** 时段卡可转金额：实收 × 剩余天数 / 总有效天数。转让日早于开始日按整段计算。 */
export function proratePeriodTransferAmount(paidAmount: number, validStartDate: string, validEndDate: string, transferDate: string): number {
  const start = parseDateText(validStartDate)
  const end = parseDateText(validEndDate)
  const transfer = parseDateText(transferDate)
  const safeAmount = Number(paidAmount)
  if (!start || !end || !transfer || !Number.isFinite(safeAmount) || safeAmount <= 0) return 0
  const totalDays = inclusiveDayCount(start, end)
  if (totalDays <= 0) return 0
  const remainingStart = transfer.getTime() > start.getTime() ? transfer : start
  const remainingDays = remainingStart.getTime() > end.getTime() ? 0 : inclusiveDayCount(remainingStart, end)
  if (remainingDays <= 0) return 0
  if (remainingDays >= totalDays) return roundHalfUp(safeAmount, 2)
  const dailyAmount = roundHalfUp(safeAmount / totalDays, 6)
  return roundHalfUp(dailyAmount * remainingDays, 2)
}

export function transferTargetLabel(category: string): string {
  const card = String(category || '').toUpperCase()
  return card === 'PERIOD' || card === 'STORED_VALUE' ? '转让对象' : '转课对象'
}
