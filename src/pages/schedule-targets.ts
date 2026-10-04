import { getJson } from '../api/biz'
import { todayIso } from './kit'
import type { CardChoice, TargetOption, PricingChoice, CourseMember } from './schedule-model'

export function targetTypeOrder(type?: string): number {
  if (type === 'student') return 1
  if (type === 'course') return 2
  if (type === 'preset') return 3
  return 99
}

export function cardTypeOrder(option: TargetOption): number {
  if (option.targetType !== 'student') return 0
  const order: Record<string, number> = { 课时卡: 0, 储值卡: 1, 年卡: 2, 半年卡: 3, 季卡: 4, 月卡: 5, 周卡: 6, 时段卡: 7 }
  const labels = (option.cardTypeLabels || []).map((item) => String(item || '').trim()).filter(Boolean)
  if (!labels.length) return 99
  return labels.reduce((min, label) => Math.min(min, order[label] ?? 99), 99)
}

export function optionBlocked(option: TargetOption): boolean {
  if (option.targetType === 'course') return !!courseTargetWarning(option) || !!option.selectionBlockedReason
  if (option.targetType === 'student') return !!option.selectionBlockedReason
  return false
}

export function sortTargetOptions(options: TargetOption[]): TargetOption[] {
  return [...options].sort((left, right) => {
    const blocked = Number(optionBlocked(left)) - Number(optionBlocked(right))
    if (blocked) return blocked
    const type = targetTypeOrder(left.targetType) - targetTypeOrder(right.targetType)
    if (type) return type
    if (left.targetType === 'student' && right.targetType === 'student') {
      const card = cardTypeOrder(left) - cardTypeOrder(right)
      if (card) return card
      if (cardTypeOrder(left) === 0) {
        const hours = Number(right.remainingHours || 0) - Number(left.remainingHours || 0)
        if (hours) return hours
      }
    }
    return String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || ''), 'zh-Hans-CN')
  })
}

export function courseTargetWarning(option?: Pick<TargetOption, 'targetType' | 'oneToOne' | 'studentCount'> | null): string {
  if (!option || option.targetType !== 'course') return ''
  if (option.oneToOne === true) return '班级仅支持选择非一对一课程'
  const count = Number(option.studentCount)
  if (!Number.isFinite(count) || count <= 0) return '0学员班级不可选，请先添加学员'
  return ''
}

export function minOpenWarning(attending: number, minOpenCount: number, maxOpenCount = 0): string {
  if (maxOpenCount >= 2 && attending > maxOpenCount) return `当前上课人数超过课程人数上限（最多${maxOpenCount}人）`
  if (minOpenCount < 2 || attending >= minOpenCount) return ''
  return `当前上课人数不够（当前${attending}人，至少需要${minOpenCount}人）`
}

export function resolveMinOpen(group?: { oneToOne?: boolean | null; minOpenCount?: number | null } | null): number {
  if (!group || group.oneToOne === true) return 0
  const count = Number(group.minOpenCount)
  if (!Number.isFinite(count) || count < 2) return 0
  return Math.floor(count)
}

export function resolveMaxOpen(group?: { oneToOne?: boolean | null; maxOpenCount?: number | null } | null): number {
  if (!group || group.oneToOne === true) return 0
  const count = Number(group.maxOpenCount)
  return Number.isInteger(count) && count >= 2 && count <= 99 ? count : 0
}

export function amountLabel(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return String(numeric)
  return numeric.toFixed(2).replace(/\.?0+$/, '')
}

export function hoursAmount(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return String(numeric)
  return numeric.toFixed(1).replace(/\.0$/, '')
}

export function isHoursCard(card: CardChoice): boolean {
  return String(card.cardCategory || '').toUpperCase() === 'HOURS' || String(card.cardTypeLabel || '').trim() === '课时卡'
}

export function scheduleHoursLabel(option: TargetOption): string {
  const cards = option.cardOptions || []
  const hoursCards = cards.filter(isHoursCard)
  const selectableHours = hoursCards.filter((card) => card.available !== false && !(Number.isFinite(Number(card.remainingHours)) && Number(card.remainingHours) <= 0))
  const otherSelectable = cards.some((card) => !isHoursCard(card) && card.available !== false)
  if (hoursCards.length > 0) {
    if (!selectableHours.length) {
      if (otherSelectable) return ''
    } else if (selectableHours.some((card) => Number.isFinite(Number(card.remainingHours)))) {
      const remaining = selectableHours.reduce((sum, card) => sum + Math.max(Number(card.remainingHours) || 0, 0), 0)
      const total = selectableHours.reduce((sum, card) => sum + Math.max(Number(card.totalHours) || 0, 0), 0)
      return `${hoursAmount(remaining)}/${hoursAmount(total)}`
    }
  }
  const labels = (option.cardTypeLabels || []).map((item) => String(item || '').trim()).filter(Boolean)
  if (labels.length > 0 && !labels.includes('课时卡') && String(option.cardCategory || '').toUpperCase() !== 'HOURS') return ''
  if (option.remainingHours == null && option.totalHours == null) return ''
  return `${hoursAmount(option.remainingHours)}/${hoursAmount(option.totalHours)}`
}

export interface RosterStudent {
  id: number
  name?: string
  gender?: number
  cards?: Array<{
    id?: number
    status?: number
    studentGroupId?: number
    courseCategory?: boolean
    cardCategory?: string
    periodType?: string
    remainingHours?: number | null
    remainingAmount?: number | null
    validStartDate?: string
    validEndDate?: string
    cardTypeLabel?: string
  }>
}

export function scheduleCardLabel(category?: string, periodType?: string, label?: string): string {
  const given = String(label || '').trim()
  if (given) return given
  const normalized = String(category || '').toUpperCase()
  if (normalized === 'STORED_VALUE') return '储值卡'
  if (normalized === 'HOURS') return '课时卡'
  if (normalized === 'PERIOD') {
    return ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' } as Record<string, string>)[String(periodType || '').toUpperCase()] || '时段卡'
  }
  return ''
}

export function scheduleCardOrder(label: string): number {
  const order: Record<string, number> = { 课时卡: 0, 储值卡: 1, 年卡: 2, 半年卡: 3, 季卡: 4, 月卡: 5, 周卡: 6, 时段卡: 7 }
  return order[label] ?? 99
}

export function scheduleCardChoices(cards: RosterStudent['cards'], groupId: number, unitPrice: number): CardChoice[] {
  const today = todayIso()
  const minimum = unitPrice > 0 ? Math.round(unitPrice * 50) / 100 : 0
  return (cards || [])
    .filter((card) => Number(card.status ?? 1) === 1 && Number(card.studentGroupId || 0) === groupId && card.courseCategory !== false)
    .map((card) => {
      const category = String(card.cardCategory || '').toUpperCase()
      const choice: CardChoice = {
        id: card.id,
        studentGroupId: card.studentGroupId,
        cardTypeLabel: scheduleCardLabel(category, card.periodType, card.cardTypeLabel),
        cardCategory: category,
        periodType: card.periodType,
        courseCategory: card.courseCategory,
        remainingHours: card.remainingHours == null ? undefined : Number(card.remainingHours),
        remainingAmount: card.remainingAmount == null ? undefined : Number(card.remainingAmount),
        validEndDate: card.validEndDate,
      }
      if (category === 'HOURS') {
        choice.available = Number(card.remainingHours || 0) > 0
        if (!choice.available) choice.unavailableReason = '余额不足'
      } else if (category === 'STORED_VALUE') {
        const remain = Number(card.remainingAmount || 0)
        if (minimum <= 0) {
          choice.available = false
          choice.unavailableReason = '请先配置课程单价'
        } else if (remain < minimum) {
          choice.available = false
          choice.unavailableReason = '余额不足'
        } else choice.available = true
      } else if (category === 'PERIOD') {
        const start = String(card.validStartDate || '').slice(0, 10)
        const end = String(card.validEndDate || '').slice(0, 10)
        if (start && today < start) {
          choice.available = false
          choice.unavailableReason = '未到有效期'
        } else if (end && today > end) {
          choice.available = false
          choice.unavailableReason = '已过期'
        } else if (!start && !end) {
          choice.available = false
          choice.unavailableReason = '未设置有效期'
        } else choice.available = true
      } else {
        choice.available = false
        choice.unavailableReason = '不支持的卡类型'
      }
      return choice
    })
    .filter((card) => !!card.cardTypeLabel)
    .sort((left, right) => scheduleCardOrder(String(left.cardTypeLabel || '')) - scheduleCardOrder(String(right.cardTypeLabel || '')) || Number(left.id || 0) - Number(right.id || 0))
}

export async function fallbackCourseMembers(groupId: number, campusId: number, coachIds: number[], unitPrice: number, studentIds: number[], studentNames: string[]): Promise<CourseMember[]> {
  let ids = studentIds.filter((id) => id > 0)
  let names = studentNames
  let coaches = coachIds.filter((id) => id > 0)
  let price = unitPrice
  if (!ids.length && campusId) {
    const list = await getJson<Array<{ id: number; studentIds?: number[]; studentNames?: string[]; coachIds?: number[]; unitPrice?: number }>>('/student-groups/list', {
      campusId,
      includeInternal: true,
    }).catch(() => [])
    const row = (list || []).find((item) => item.id === groupId)
    ids = (row?.studentIds || []).map(Number).filter((id) => id > 0)
    names = row?.studentNames || []
    if (!coaches.length) coaches = (row?.coachIds || []).map(Number).filter((id) => id > 0)
    if (!(price > 0)) price = Number(row?.unitPrice || 0)
  }
  if (!ids.length) return []
  const found = new Map<number, RosterStudent>()
  if (campusId && coaches.length) {
    const packs = await getJson<Array<{ students?: RosterStudent[] }>>('/students/by-coaches', {
      coachMemberIds: coaches.join(','),
      campusId,
    }).catch(() => [])
    ;(packs || []).forEach((pack) => {
      ;(pack.students || []).forEach((student) => {
        if (ids.includes(Number(student.id))) found.set(Number(student.id), student)
      })
    })
  }
  return ids.map((id, index) => {
    const student = found.get(id)
    const cardOptions = scheduleCardChoices(student?.cards, groupId, price)
    const defaultCard = cardOptions.find((card) => card.available !== false)
    return {
      studentId: id,
      studentName: student?.name || names[index] || `学员${id}`,
      gender: student?.gender,
      defaultStudentCardId: defaultCard?.id,
      cardOptions,
      cardCategory: defaultCard?.cardCategory,
      remainingHours: defaultCard?.remainingHours,
    }
  })
}

export function cardSummary(card: CardChoice | undefined, member: CourseMember): { text: string; low: boolean } {
  if (!card) return { text: '无可扣费卡', low: true }
  const category = String(card.cardCategory || member.cardCategory || '').toUpperCase()
  if (category === 'HOURS' || card.cardTypeLabel === '课时卡') {
    const hours = Number(card.remainingHours ?? member.remainingHours)
    return {
      text: `课时卡 · 剩余 ${hoursAmount(hours)} 课时`,
      low: card.available === false || (Number.isFinite(hours) && hours < 5),
    }
  }
  if (category === 'STORED_VALUE') return { text: `储值卡 · 余额 ¥${amountLabel(card.remainingAmount)}`, low: false }
  const label = card.cardTypeLabel || '时段卡'
  const end = String(card.validEndDate || '').slice(0, 10)
  return { text: end ? `${label} · 有效至 ${end}` : label, low: false }
}

export function courseMembersWarning(members: CourseMember[], excluded: number[]): string {
  const participating = members.filter((member) => !excluded.includes(member.studentId))
  if (!participating.length) return '请移除无可扣费学员，并至少保留1名参与学员'
  const blocked = participating.some((student) => {
    const cards = student.cardOptions || []
    if (cards.length > 0) return !cards.some((card) => card.available !== false && Number(card.id || 0) > 0)
    const category = String(student.cardCategory || '').toUpperCase()
    if (category === 'PERIOD' || category === 'STORED_VALUE') return false
    const hours = Number(student.remainingHours)
    return !Number.isNaN(hours) && hours <= 0
  })
  return blocked ? '请移除无可扣费学员，并至少保留1名参与学员' : ''
}

export const CARD_MARKER = '#card:'

export function pricingCardDetail(card: CardChoice): string {
  const category = String(card.cardCategory || '').toUpperCase()
  if (category === 'HOURS' || card.cardTypeLabel === '课时卡') {
    return `剩余 ${hoursAmount(card.remainingHours)} 课时`
  }
  if (category === 'STORED_VALUE') return `余额 ¥${amountLabel(card.remainingAmount)}`
  const end = String(card.validEndDate || '').slice(0, 10)
  return end ? `有效至 ${end}` : ''
}

export function pricingUnavailable(card: CardChoice): string {
  if (card.available !== false) return ''
  return String(card.unavailableReason || '').trim() || '不可用'
}

export function pricingChoices(option: TargetOption): PricingChoice[] {
  if (option.targetType !== 'student') return []
  const cards = (option.cardOptions || []).filter((card) => Number(card.id || 0) > 0)
  const source = cards.length ? cards : [{ id: 0, cardTypeLabel: '', cardCategory: option.cardCategory, courseCategory: option.courseCategory }]
  const choices: PricingChoice[] = []
  for (const card of source) {
    const before = choices.length
    const cardId = Number(card.id || 0)
    const prefix = card.cardTypeLabel || ''
    const category = String(card.cardCategory || option.cardCategory || '').toUpperCase()
    const courseCategory = card.courseCategory ?? option.courseCategory
    const withCard = (base: string) => cardId > 0 ? `${base}${CARD_MARKER}${cardId}` : base
    if (courseCategory !== false) {
      const configured = Number(card.studentGroupId || 0)
      for (const course of (option.courseOptions || []).filter((item) => !configured || Number(item.id) === configured)) {
        const base = String(course.courseType || course.id || '')
        if (!base || !course.name) continue
        choices.push({
          key: withCard(base),
          label: [prefix, course.name, pricingCardDetail(card), pricingUnavailable(card)].filter(Boolean).join(' · '),
          pricingStudentGroupId: Number(course.id || 0) || undefined,
          pricingCourseType: withCard(base),
          service: false,
          disabled: card.available === false,
        })
      }
    }
    for (const service of option.serviceOptions || []) {
      const allowed = (service.studentCardIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
      if (cardId > 0 && allowed.length && !allowed.includes(cardId)) continue
      const base = String(service.courseType || '')
      if (!base || !service.name) continue
      choices.push({
        key: withCard(base),
        label: [prefix, service.name, pricingCardDetail(card), pricingUnavailable(card)].filter(Boolean).join(' · '),
        pricingCourseType: withCard(base),
        service: true,
        disabled: card.available === false,
      })
    }
    if (cardId > 0 && choices.length === before && category !== 'STORED_VALUE') {
      choices.push({
        key: withCard('card'),
        label: [prefix, card.studentGroupName || '课时卡', pricingCardDetail(card), pricingUnavailable(card)].filter(Boolean).join(' · '),
        pricingCourseType: withCard('card'),
        service: false,
        disabled: card.available === false,
      })
    }
  }
  return choices
}

export function cardIdFromPricing(value?: string): number | undefined {
  const marker = String(value || '').lastIndexOf(CARD_MARKER)
  if (marker < 0) return undefined
  const id = Number(value?.slice(marker + CARD_MARKER.length))
  return id > 0 ? id : undefined
}
