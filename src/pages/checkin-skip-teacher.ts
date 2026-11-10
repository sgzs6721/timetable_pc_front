/** Build course check-in coach fields when "不记录老师课时" is toggled. */
export function checkInCoachSubmitPayload(
  skipTeacherHours: boolean,
  selectedCoachIds: number[],
  coachNames: string[],
): { coachId?: number; coachIds: number[]; coachName?: string } {
  if (skipTeacherHours) {
    return { coachIds: [] }
  }
  const coachIds = Array.from(new Set(selectedCoachIds.map(Number).filter((id) => id > 0)))
  return {
    coachId: coachIds[0],
    coachIds,
    coachName: coachNames.filter(Boolean).join('、') || undefined,
  }
}

export function checkInCoachSelectionError(
  skipTeacherHours: boolean,
  selectedCoachIds: number[],
  maxCount: number,
): string {
  if (skipTeacherHours) return ''
  const coachIds = Array.from(new Set(selectedCoachIds.map(Number).filter((id) => id > 0)))
  if (!coachIds.length) return '请至少选择一位老师'
  if (maxCount > 0 && coachIds.length > maxCount) return `本次打卡最多可选择 ${maxCount} 位老师`
  return ''
}
