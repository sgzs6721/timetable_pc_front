import type { Card, PayRecord } from './students-model'

export function isTransferredPeriodCard(card?: Card): boolean {
  return String(card?.cardCategory || '').toUpperCase() === 'PERIOD' && card?.fullyTransferred === true
}

// 与小程序一致：时段卡转移的是缴费批次的完整有效期，金额为零不代表没有权益。
export function resolvePeriodEntitlement(records: PayRecord[] = []) {
  const flat: PayRecord[] = []
  const seen = new Set<string | PayRecord>()
  const visit = (record: PayRecord, parent?: PayRecord) => {
    if (!record || Number(record.deleted || 0) === 1) return
    const key = record.id == null ? record : String(record.id)
    if (seen.has(key)) return
    seen.add(key)
    flat.push({
      ...record,
      studentCardId: record.studentCardId ?? parent?.studentCardId,
      mainRecordId: record.mainRecordId ?? parent?.id,
    })
    ;(record.supplements || []).forEach((child) => visit(child, record))
  }
  records.forEach((record) => visit(record))
  const outgoing = flat.filter((record) => record.type === 'adjustment'
    && record.adjustmentReason === 'transfer' && record.transferDirection === 'out')
  const ownedRecords = flat.filter((record) => {
    const funding = !record.type || ['new', 'renew', 'supplement'].includes(record.type)
      || (record.type === 'adjustment' && record.adjustmentReason === 'transfer' && record.transferDirection === 'in')
    if (!funding) return false
    return !outgoing.some((out) => {
      if (out.mainRecordId) return String(out.mainRecordId) === String(record.mainRecordId || record.id)
      if (String(out.studentCardId || '') !== String(record.studentCardId || '')) return false
      return out.validStartDate && out.validEndDate
        && out.validStartDate === record.validStartDate && out.validEndDate === record.validEndDate
        && (!out.id || !record.id || Number(record.id) < Number(out.id))
    })
  })
  const transferOutDate = outgoing.map((record) => String(record.paymentDate || '').slice(0, 10)).sort().pop() || ''
  const fullyTransferred = outgoing.length > 0
    && !ownedRecords.some((record) => record.validEndDate && (!transferOutDate || record.validEndDate >= transferOutDate))
  return { ownedRecords, fullyTransferred, transferOutDate }
}

export function hasOnlyTransferredRights(cards: Card[]): boolean {
  const active = cards.filter((card) => Number(card.deleted || 0) !== 1 && (card.status == null || Number(card.status) === 1))
  const otherRights = active.some((card) => !isTransferredPeriodCard(card) && (
    String(card.cardCategory || '').toUpperCase() === 'PERIOD'
      ? !!card.validEndDate
      : String(card.cardCategory || '').toUpperCase() === 'STORED_VALUE'
        ? Number(card.remainingAmount || 0) > 0 : Number(card.remainingHours || 0) > 0
  ))
  return active.some(isTransferredPeriodCard) && !otherRights
}
