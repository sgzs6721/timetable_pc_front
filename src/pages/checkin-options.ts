export interface CheckInRight {
  serviceItemId?: number
  id?: number
  courseType?: string
  courseTypeLabel?: string
  serviceName?: string
  name?: string
  discount?: number
  unitPrice?: number
  originalPrice?: number
  price?: number
  discountedPrice?: number
}

export interface CheckInRecord {
  id?: number
  type?: string
  typeText?: string
  hours?: number
  giftHours?: number
  totalHours?: number
  remainingHours?: number
  courseType?: string
  courseTypeLabel?: string
  paymentDate?: string
  date?: string
  createTime?: string
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
  studentCardId?: number
  mainRecordId?: number
  supplements?: CheckInRecord[]
  serviceRights?: CheckInRight[]
  storedValueRights?: CheckInRight[]
  displayMode?: string
}

export interface CheckInPaymentOption {
  id: number
  courseType: string
  label: string
  courseLabel: string
  remainText: string
  validityText: string
  totalHours: number
  totalHoursText: string
  typeText: string
  remainingHours: number
  paymentDate: string
  validStartDate: string
  validEndDate: string
  consumeDeadline: string
  recordIds: number[]
  isMerged: boolean
  isSelectable: boolean
  disabled: boolean
  disabledReason: string
  cardTypeLabel?: string
  hoursRatioText?: string
  configuredFromStudent?: boolean
}

export interface CheckInServiceOption {
  id: number
  key: string
  name: string
  discountedPrice: number
}

interface CheckInCard {
  id?: number
  cardCategory?: string
  periodType?: string
  courseCategory?: boolean
  studentGroupId?: number
  studentGroupName?: string
  remainingHours?: number
  serviceItemIds?: number[]
  serviceItemNames?: string[]
  serviceRights?: CheckInRight[]
}

interface CourseGroup {
  id: number
  name?: string
}

interface CampusService {
  id: number
  name?: string
  serviceName?: string
  unitPrice?: number
  price?: number
}

function formatHoursValue(value: unknown): string {
  const numeric = Number(value || 0)
  if (Number.isNaN(numeric)) return '0'
  if (Math.abs(numeric - Math.round(numeric)) < 0.000001) return String(Math.round(numeric))
  return String(Number(numeric.toFixed(2)))
}

function normalizeDate(value: unknown): string {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function isPaymentRecordAvailableForCheckInDate(record: CheckInRecord | undefined, checkInDate: string): boolean {
  const dateText = normalizeDate(checkInDate)
  if (!dateText) return true
  const validStartDate = normalizeDate(record?.validStartDate)
  const validEndDate = normalizeDate(record?.validEndDate)
  const consumeDeadline = normalizeDate(record?.consumeDeadline)
  if (validStartDate && dateText < validStartDate) return false
  if (validEndDate && dateText > validEndDate) return false
  if (consumeDeadline && dateText > consumeDeadline) return false
  return true
}

function resolvePaymentRecordUnavailableReason(record: CheckInRecord | undefined, checkInDate: string): string {
  const dateText = normalizeDate(checkInDate)
  if (!dateText) return ''
  const validStartDate = normalizeDate(record?.validStartDate)
  const validEndDate = normalizeDate(record?.validEndDate)
  const consumeDeadline = normalizeDate(record?.consumeDeadline)
  if (validStartDate && dateText < validStartDate) return '未生效'
  if (validEndDate && dateText > validEndDate) return '已过期'
  if (consumeDeadline && dateText > consumeDeadline) return '已过期'
  return ''
}

function isCheckInDateWithinTimedValidity(record: CheckInRecord | undefined, checkInDate: string): boolean {
  const dateText = normalizeDate(checkInDate)
  const validStartDate = normalizeDate(record?.validStartDate)
  const validEndDate = normalizeDate(record?.validEndDate)
  return !!dateText && !!validStartDate && !!validEndDate && dateText >= validStartDate && dateText <= validEndDate
}

function isNewerValidityDefinition(candidate: CheckInRecord, current: CheckInRecord): boolean {
  const candidateDate = normalizeDate(candidate.paymentDate || candidate.date || candidate.createTime)
  const currentDate = normalizeDate(current.paymentDate || current.date || current.createTime)
  if (candidateDate !== currentDate) {
    if (!candidateDate) return false
    if (!currentDate) return true
    return candidateDate > currentDate
  }
  return Number(candidate.id || 0) >= Number(current.id || 0)
}

function resolveEffectiveEndDate(record: CheckInRecord | undefined): string {
  const validEndDate = normalizeDate(record?.validEndDate)
  const consumeDeadline = normalizeDate(record?.consumeDeadline)
  if (validEndDate && consumeDeadline) return validEndDate < consumeDeadline ? validEndDate : consumeDeadline
  return validEndDate || consumeDeadline
}

function applySupplementDefinedValidity(record: CheckInRecord, allRecords: CheckInRecord[]): CheckInRecord {
  const recordId = Number(record.id || 0)
  const supplements: CheckInRecord[] = []
  ;(record.supplements || []).forEach((item) => {
    if (item?.type === 'supplement') supplements.push(item)
  })
  allRecords.forEach((item) => {
    if (!item || item === record || item.type !== 'supplement') return
    if (Number(item.mainRecordId || 0) !== recordId) return
    supplements.push(item)
  })
  const winner = supplements.reduce<CheckInRecord | null>((current, item) => {
    if (!resolveEffectiveEndDate(item)) return current
    if (!current || isNewerValidityDefinition(item, current)) return item
    return current
  }, null)
  if (!winner) return record
  return {
    ...record,
    validStartDate: winner.validStartDate || '',
    validEndDate: winner.validEndDate || '',
    consumeDeadline: winner.consumeDeadline || '',
  }
}

function comparePaymentRecordsForCheckIn(left: CheckInRecord, right: CheckInRecord, checkInDate: string): number {
  const leftAvailable = isPaymentRecordAvailableForCheckInDate(left, checkInDate)
  const rightAvailable = isPaymentRecordAvailableForCheckInDate(right, checkInDate)
  if (leftAvailable !== rightAvailable) return leftAvailable ? -1 : 1
  const leftTimed = isCheckInDateWithinTimedValidity(left, checkInDate)
  const rightTimed = isCheckInDateWithinTimedValidity(right, checkInDate)
  if (leftTimed !== rightTimed) return leftTimed ? -1 : 1
  const leftPaymentDate = normalizeDate(left.paymentDate || left.date || left.createTime)
  const rightPaymentDate = normalizeDate(right.paymentDate || right.date || right.createTime)
  if (leftPaymentDate !== rightPaymentDate) {
    if (!leftPaymentDate) return 1
    if (!rightPaymentDate) return -1
    return leftPaymentDate < rightPaymentDate ? -1 : 1
  }
  const leftCreateTime = String(left.createTime || '')
  const rightCreateTime = String(right.createTime || '')
  if (leftCreateTime !== rightCreateTime) {
    if (!leftCreateTime) return 1
    if (!rightCreateTime) return -1
    return leftCreateTime < rightCreateTime ? -1 : 1
  }
  return Number(left.id || 0) - Number(right.id || 0)
}

function buildCheckInValidityText(record: CheckInRecord): string {
  const validStartDate = normalizeDate(record.validStartDate)
  const effectiveEndDate = resolveEffectiveEndDate(record)
  if (validStartDate && effectiveEndDate) return `有效期：${validStartDate} 至 ${effectiveEndDate}`
  if (effectiveEndDate) return `有效期至：${effectiveEndDate}`
  if (validStartDate) return `有效期自：${validStartDate}`
  return ''
}

function resolveRecordTotalHours(record: CheckInRecord): number {
  const explicitTotal = Number(record.totalHours)
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal
  const hours = Number(record.hours || 0)
  const giftHours = Number(record.giftHours || 0)
  const total = (Number.isFinite(hours) ? hours : 0) + (Number.isFinite(giftHours) ? giftHours : 0)
  return total > 0 ? total : 0
}

function resolveCourseLabel(record: CheckInRecord, groupMap: Map<string, string>): string {
  const courseType = String(record.courseType || '').trim()
  const rawCourseLabel = String(record.courseTypeLabel || '').trim()
  const rawMappedCourseLabel = String(groupMap.get(courseType) || '').trim()
  const mappedCourseLabel = rawMappedCourseLabel && rawMappedCourseLabel !== courseType ? rawMappedCourseLabel : ''
  return (rawCourseLabel && rawCourseLabel !== courseType ? rawCourseLabel : mappedCourseLabel) || '未命名课程'
}

export function buildCheckInPaymentRecordOptions(
  records: CheckInRecord[] = [],
  options: {
    includeRecordIds?: number[]
    remainingHoursCap?: number
    allowZeroRemainingHours?: boolean
    groupMap?: Map<string, string>
    checkInDate?: string
  } = {},
): CheckInPaymentOption[] {
  const includeRecordIdSet = new Set((options.includeRecordIds || []).map((item) => Number(item || 0)).filter((item) => item > 0))
  const remainingHoursCap = Number(options.remainingHoursCap == null ? NaN : options.remainingHoursCap)
  const groupMap = options.groupMap || new Map<string, string>()
  const sourceRecords = records || []
  return sourceRecords
    .filter((record) => {
      const recordId = Number(record?.id || 0)
      if (!recordId) return false
      const mainRecordId = Number(record?.mainRecordId || 0)
      if (mainRecordId && !includeRecordIdSet.has(recordId)) return false
      return true
    })
    .map((record) => applySupplementDefinedValidity(record, sourceRecords))
    .sort((left, right) => comparePaymentRecordsForCheckIn(left, right, options.checkInDate || ''))
    .map((record) => {
      const id = Number(record.id || 0)
      const courseType = String(record.courseType || '').trim()
      if (!id || !courseType) return null
      const rawRemainingHours = Number(record.remainingHours || 0)
      if (rawRemainingHours <= 0 && !includeRecordIdSet.has(id) && !options.allowZeroRemainingHours) return null
      const remainingHours = Number.isFinite(remainingHoursCap) ? Math.min(rawRemainingHours, Math.max(0, remainingHoursCap)) : rawRemainingHours
      const courseLabel = resolveCourseLabel(record, groupMap)
      const remainText = `剩余${formatHoursValue(remainingHours)}课时`
      const totalHours = resolveRecordTotalHours(record)
      const paymentDate = normalizeDate(record.paymentDate || record.date || record.createTime)
      const isSelectable = isPaymentRecordAvailableForCheckInDate(record, options.checkInDate || '')
      const unavailableReason = isSelectable ? '' : resolvePaymentRecordUnavailableReason(record, options.checkInDate || '')
      return {
        id,
        courseType,
        label: [courseLabel, remainText, unavailableReason ? `（${unavailableReason}）` : ''].filter(Boolean).join(' · '),
        courseLabel,
        remainText,
        validityText: buildCheckInValidityText(record),
        totalHours,
        totalHoursText: totalHours > 0 ? `总课时 ${formatHoursValue(totalHours)}课时` : '',
        typeText: String(record.typeText || '缴费').trim(),
        remainingHours,
        paymentDate,
        validStartDate: normalizeDate(record.validStartDate),
        validEndDate: normalizeDate(record.validEndDate),
        consumeDeadline: normalizeDate(record.consumeDeadline),
        recordIds: [id],
        isMerged: false,
        isSelectable,
        disabled: !isSelectable,
        disabledReason: unavailableReason,
      }
    })
    .filter((item): item is CheckInPaymentOption => !!item)
}

function hideRemainingHoursFromCheckInOptions(options: CheckInPaymentOption[], cardTypeLabel: string): CheckInPaymentOption[] {
  const cardTypeText = String(cardTypeLabel || '').trim()
  options.forEach((item) => {
    item.cardTypeLabel = cardTypeText
    item.remainText = ''
    item.label = [cardTypeText, item.courseLabel || item.label || '', item.disabledReason ? `（${item.disabledReason}）` : ''].filter(Boolean).join(' · ')
  })
  return options
}

function showHoursCardRemainingOptions(
  options: CheckInPaymentOption[],
  cardTypeLabel: string,
  configuredCourse: { courseType?: string; courseLabel?: string },
): CheckInPaymentOption[] {
  const cardTypeText = String(cardTypeLabel || '').trim()
  const configuredCourseType = String(configuredCourse.courseType || '').trim()
  const configuredCourseLabel = String(configuredCourse.courseLabel || '').trim()
  const hasConfiguredCourse = !!configuredCourseType && configuredCourseType !== '0' && !!configuredCourseLabel
  options.forEach((item) => {
    if (hasConfiguredCourse && item.configuredFromStudent !== true) {
      item.courseType = configuredCourseType
      item.courseLabel = configuredCourseLabel
    }
    item.cardTypeLabel = cardTypeText
    const hours = Number(item.remainingHours || 0)
    const hoursText = Number.isFinite(hours) ? `${formatHoursValue(Math.max(0, hours))}课时` : ''
    item.remainText = item.configuredFromStudent === true && hours <= 0 ? '' : hoursText
    const totalHours = Number(item.totalHours || 0)
    item.hoursRatioText = item.remainText && totalHours > 0 ? `${formatHoursValue(Math.max(0, hours))}/${formatHoursValue(totalHours)}` : ''
    item.label = [cardTypeText, item.courseLabel || '', item.remainText, item.disabledReason ? `（${item.disabledReason}）` : ''].filter(Boolean).join(' · ')
  })
  return options
}

function showPeriodTypeInCheckInOptions(options: CheckInPaymentOption[], periodTypeLabel = '时段卡'): CheckInPaymentOption[] {
  const cardTypeText = String(periodTypeLabel || '').trim() || '时段卡'
  options.forEach((item) => {
    item.cardTypeLabel = cardTypeText
    item.remainText = cardTypeText
    item.label = [cardTypeText, item.courseLabel || item.label || '', item.disabledReason ? `（${item.disabledReason}）` : ''].filter(Boolean).join(' · ')
  })
  return options
}

function flattenPaymentRecords(records: CheckInRecord[] = []): CheckInRecord[] {
  return records.flatMap((record) => [record, ...(Array.isArray(record.supplements) ? flattenPaymentRecords(record.supplements) : [])])
}

function isServiceRecord(record: CheckInRecord | undefined): boolean {
  const courseType = String(record?.courseType || '').trim()
  if (courseType.startsWith('service:')) return true
  if (courseType) return false
  return (Array.isArray(record?.serviceRights) && record.serviceRights.length > 0)
    || (Array.isArray(record?.storedValueRights) && record.storedValueRights.some((right) => String(right?.courseType || '').trim().startsWith('service:')))
    || String(record?.displayMode || '').trim() === 'stored_service'
}

function cardTypeLabel(category?: string): string {
  const text = String(category || '').trim().toUpperCase()
  if (text === 'PERIOD') return '时段卡'
  if (text === 'STORED_VALUE') return '储值卡'
  return '课时卡'
}

function periodTypeLabel(periodType: unknown): string {
  const labels: Record<string, string> = { WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' }
  return labels[String(periodType || '').trim().toUpperCase()] || '时段卡'
}

function isValidCourseLabel(value: unknown, courseType: unknown = ''): boolean {
  const label = String(value || '').trim()
  const type = String(courseType || '').trim()
  if (!label || label === type) return false
  return !/^\d+$/.test(label)
}

function courseMapLabel(courseNameMap: Map<string, string> | undefined, courseType: unknown): string {
  if (!courseNameMap) return ''
  const rawType = String(courseType || '').trim()
  const candidates = [rawType]
  if (rawType.startsWith('group:')) candidates.push(rawType.slice('group:'.length))
  const numericType = Number(rawType)
  if (Number.isFinite(numericType) && numericType > 0) candidates.push(String(numericType), `group:${numericType}`)
  for (const candidate of candidates) {
    const label = String(courseNameMap.get(candidate) || '').trim()
    if (isValidCourseLabel(label, rawType)) return label
  }
  return ''
}

function resolveNamedCourseLabel(values: unknown[] = [], courseType: unknown = '', courseNameMap?: Map<string, string>): string {
  for (const value of values) {
    if (isValidCourseLabel(value, courseType)) return String(value).trim()
  }
  return courseMapLabel(courseNameMap, courseType)
}

function courseNameMapFromGroups(groups: CourseGroup[] = []): Map<string, string> {
  const courseNameMap = new Map<string, string>()
  groups.forEach((group) => {
    const id = Number(group.id || 0)
    const name = String(group.name || '').trim()
    if (id > 0 && isValidCourseLabel(name, String(id))) {
      courseNameMap.set(String(id), name)
      courseNameMap.set(`group:${id}`, name)
    }
  })
  return courseNameMap
}

export function buildQuickCheckInPaymentOptions(input: {
  records: CheckInRecord[]
  card?: CheckInCard
  groups?: CourseGroup[]
  checkInDate?: string
  singleCard?: boolean
}): CheckInPaymentOption[] {
  const card = input.card
  const category = String(card?.cardCategory || '').trim().toUpperCase()
  const cardId = Number(card?.id || 0)
  const allowUnscoped = !!input.singleCard
  const courseNameMap = courseNameMapFromGroups(input.groups || [])
  const courseRecords = flattenPaymentRecords(input.records || []).filter((record) => {
    if (!record || isServiceRecord(record)) return false
    const recordCardId = Number(record.studentCardId || 0)
    if (cardId > 0) return recordCardId === cardId || (allowUnscoped && recordCardId <= 0)
    return recordCardId <= 0
  })
  const configuredCourseType = String(card?.studentGroupId || '').trim()
  const configuredCourseLabel = configuredCourseType && configuredCourseType !== '0'
    ? (resolveNamedCourseLabel([
      card?.studentGroupName,
      ...courseRecords.map((record) => record.courseTypeLabel),
    ], configuredCourseType, courseNameMap) || '未命名课程')
    : ''
  const checkInDate = input.checkInDate || ''
  if (category === 'HOURS') {
    const hoursPaymentOptions = buildCheckInPaymentRecordOptions(courseRecords, {
      checkInDate,
      remainingHoursCap: card?.remainingHours,
      allowZeroRemainingHours: false,
      groupMap: courseNameMap,
    })
    showHoursCardRemainingOptions(hoursPaymentOptions, cardTypeLabel(category), {
      courseType: configuredCourseType,
      courseLabel: configuredCourseLabel,
    })
    if (hoursPaymentOptions.length > 0) return hoursPaymentOptions
  }
  if (configuredCourseType && configuredCourseType !== '0') {
    return [{
      id: 0,
      courseType: configuredCourseType,
      label: `${cardTypeLabel(category)} · ${configuredCourseLabel}`,
      courseLabel: configuredCourseLabel,
      remainText: '',
      validityText: '',
      totalHours: 0,
      totalHoursText: '',
      typeText: '',
      remainingHours: Number(card?.remainingHours || 0),
      paymentDate: '',
      validStartDate: '',
      validEndDate: '',
      consumeDeadline: '',
      recordIds: [],
      isMerged: false,
      isSelectable: true,
      disabled: false,
      disabledReason: '',
      configuredFromStudent: true,
    }]
  }
  const paymentOptions = buildCheckInPaymentRecordOptions(courseRecords, {
    checkInDate,
    remainingHoursCap: category === 'PERIOD' || category === 'STORED_VALUE' ? undefined : card?.remainingHours,
    allowZeroRemainingHours: category === 'PERIOD' || category === 'STORED_VALUE',
    groupMap: courseNameMap,
  })
  if (category === 'STORED_VALUE') hideRemainingHoursFromCheckInOptions(paymentOptions, cardTypeLabel(category))
  else if (category === 'PERIOD') showPeriodTypeInCheckInOptions(paymentOptions, periodTypeLabel(card?.periodType))
  else hideRemainingHoursFromCheckInOptions(paymentOptions, cardTypeLabel(category))
  return paymentOptions
}

function rightId(right: CheckInRight | undefined): number {
  return Number(right?.serviceItemId || right?.id || String(right?.courseType || '').replace(/^service:/, ''))
}

export function buildQuickCheckInServiceOptions(input: {
  records: CheckInRecord[]
  services?: CampusService[]
  card?: CheckInCard
  singleCard?: boolean
}): CheckInServiceOption[] {
  const card = input.card
  const cardId = Number(card?.id || 0)
  const allowUnscoped = !!input.singleCard
  const configuredIds = new Set((card?.serviceItemIds || []).map((id) => Number(id)).filter(Boolean))
  const rights = flattenPaymentRecords(input.records || [])
    .filter((record) => {
      const recordCardId = Number(record?.studentCardId || 0)
      if (cardId > 0) return recordCardId === cardId || (allowUnscoped && recordCardId <= 0)
      return recordCardId <= 0
    })
    .flatMap((record) => [...(record.serviceRights || []), ...(record.storedValueRights || [])])
  const rightMap = new Map<number, CheckInRight>()
  ;(card?.serviceRights || []).forEach((right) => {
    const id = rightId(right)
    if (id > 0 && !rightMap.has(id)) rightMap.set(id, right)
  })
  rights.forEach((right) => {
    const id = rightId(right)
    if (id > 0 && !rightMap.has(id)) rightMap.set(id, right)
  })
  const campusServiceMap = new Map<number, CampusService>()
  ;(input.services || []).forEach((service) => {
    const id = Number(service.id || 0)
    if (id > 0 && !campusServiceMap.has(id)) campusServiceMap.set(id, service)
  })
  const serviceIds = configuredIds.size > 0 ? Array.from(configuredIds) : Array.from(rightMap.keys())
  const serviceNames = card?.serviceItemNames || []
  const period = String(card?.cardCategory || '').trim().toUpperCase() === 'PERIOD'
  return serviceIds.map((id, index) => {
    const right = rightMap.get(id) || {}
    const service = campusServiceMap.get(id)
    const originalPrice = Number(service?.price ?? service?.unitPrice ?? right.originalPrice ?? right.unitPrice ?? 0)
    const discount = Number(right.discount ?? 0)
    const discountedPrice = period ? 0 : Number(right.discountedPrice ?? right.unitPrice ?? (
      originalPrice > 0 && discount > 0 ? ((originalPrice * Math.min(discount, 100)) / 100).toFixed(2) : originalPrice
    ))
    return {
      id,
      key: `service:${id}`,
      name: String(service?.serviceName || service?.name || right.serviceName || right.courseTypeLabel || serviceNames[index] || `服务${id}`).trim(),
      discountedPrice: Number.isFinite(discountedPrice) ? discountedPrice : 0,
    }
  })
}

export function checkInCourseSelectWarning(option?: Pick<CheckInPaymentOption, 'isSelectable' | 'disabledReason'> | null): string {
  if (option && option.isSelectable === false) return option.disabledReason || '该课程当前不可用于打卡'
  return ''
}

export function checkInCourseSubmitWarning(option?: Pick<CheckInPaymentOption, 'isSelectable' | 'disabledReason'> | null): string {
  if (!option || option.isSelectable === false) return option?.disabledReason || '请选择课程'
  return ''
}
