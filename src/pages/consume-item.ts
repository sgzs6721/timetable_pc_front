export interface ConsumeItemReference {
  consumeItemType?: string | null
  consumeItemId?: number | null
  courseType?: string | null
  serviceRecord?: boolean | number | string | null
  isServiceConsumption?: boolean | number | string | null
  serviceConsumption?: boolean | number | string | null
  service?: boolean | number | string | null
}

export interface ConsumeItemReferenceFields {
  consumeItemType?: 'STUDENT_GROUP' | 'CAMPUS_SERVICE' | 'ONE_TO_ONE' | 'LEGACY'
  consumeItemId?: number
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

export function isCampusServiceConsumeItem(item?: ConsumeItemReference | null): boolean {
  const type = String(item?.consumeItemType || '').trim().toUpperCase()
  const id = Number(item?.consumeItemId || 0)
  if (type === 'CAMPUS_SERVICE' && id > 0) return true
  if (type === 'STUDENT_GROUP' && id > 0) return false
  if ((type === 'ONE_TO_ONE' || type === 'LEGACY') && id <= 0) return false
  if (truthyFlag(item?.serviceRecord)
    || truthyFlag(item?.isServiceConsumption)
    || truthyFlag(item?.serviceConsumption)
    || truthyFlag(item?.service)) return true
  return String(item?.courseType || '').trim().toLowerCase().startsWith('service:')
}

export function resolveConsumeItemReferenceFields(courseType?: string | null): ConsumeItemReferenceFields {
  const normalized = String(courseType || '').trim()
  if (!normalized) return {}
  const service = normalized.match(/^service:(\d+)$/i)
  if (service) {
    const id = Number(service[1])
    return Number.isSafeInteger(id) && id > 0 ? { consumeItemType: 'CAMPUS_SERVICE', consumeItemId: id } : {}
  }
  if (/^\d+$/.test(normalized)) {
    const id = Number(normalized)
    return Number.isSafeInteger(id) && id > 0 ? { consumeItemType: 'STUDENT_GROUP', consumeItemId: id } : {}
  }
  if (/^one_to_one$/i.test(normalized) || normalized === '一对一') return { consumeItemType: 'ONE_TO_ONE' }
  return { consumeItemType: 'LEGACY' }
}

export function consumeItemReferenceKey(item?: ConsumeItemReference | null): string {
  const type = String(item?.consumeItemType || '').trim().toUpperCase()
  const id = Number(item?.consumeItemId || 0)
  if (type === 'STUDENT_GROUP' && id > 0) return String(id)
  if (type === 'CAMPUS_SERVICE' && id > 0) return `service:${id}`
  if (type === 'ONE_TO_ONE' && id <= 0) return 'one_to_one'
  return String(item?.courseType || '').trim()
}
