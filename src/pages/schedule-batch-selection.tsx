import type { Schedule } from './schedule-model'
import { clockText, fromMinutes, toMinutes } from './schedule-board-helpers'
import { batchKey, blankSegments, parseBatchKey, rangeFrame } from './schedule-board-fields'

type Range = { start: string; end: string }
type SelectionOption = Range & { kind: 'full' | 'half' | 'span' | 'partial'; hitEnd: string }

export function batchSelectionOptions(slots: Range[], lessons: Schedule[]): SelectionOption[] {
  return slots.flatMap((slot): SelectionOption[] => {
    const occupied = lessons.some((lesson) => clockText(lesson.startTime) < slot.end && clockText(lesson.endTime) > slot.start)
    if (occupied) return blankSegments(slot, lessons).map((range) => ({ ...range, kind: toMinutes(range.end) - toMinutes(range.start) <= 30 ? 'partial' : 'full', hitEnd: range.end }))
    const minutes = toMinutes(slot.end) - toMinutes(slot.start)
    const half = fromMinutes(toMinutes(slot.start) + Math.floor(minutes / 2))
    const options: SelectionOption[] = [
      { ...slot, kind: 'full', hitEnd: slot.end },
      { start: slot.start, end: half, kind: 'half', hitEnd: half },
      { start: half, end: slot.end, kind: 'half', hitEnd: slot.end },
    ]
    const spanEnd = fromMinutes(toMinutes(half) + 60)
    if (spanEnd <= slots[slots.length - 1].end && !lessons.some((lesson) => clockText(lesson.startTime) < spanEnd && clockText(lesson.endTime) > half)) {
      options.push({ start: half, end: spanEnd, kind: 'span', hitEnd: slot.end })
    }
    return options
  })
}

export function BatchSelectionLayer(props: {
  date: string
  slots: Range[]
  lessons: Schedule[]
  batch: string[]
  onToggle: (start: string, end: string) => void
}) {
  const { date, slots, lessons, batch, onToggle } = props
  const options = batchSelectionOptions(slots, lessons)
  const selected = batch.map(parseBatchKey).filter((range) => range.date === date)
  const interval = slots.length ? toMinutes(slots[0].end) - toMinutes(slots[0].start) : 60
  const half = Math.max(Math.floor(interval / 2), 1)
  const merged = selected.filter((range) => {
    const start = toMinutes(range.start)
    const duration = toMinutes(range.end) - start
    return duration !== half && !(duration === interval && (start % interval === 0 || start % interval === half))
  })
  return <>
    {options.map((option) => {
      const key = batchKey(date, option.start, option.end)
      const picked = batch.includes(key)
      // 长选区内的入口交给整段选框处理，边界之外的半小时仍能继续延伸。
      const covered = merged.some((range) => option.start >= range.start && option.start < range.end)
      const frame = rangeFrame(option.start, option.hitEnd, slots)
      return <button
        key={key}
        type="button"
        className={`tt-batch-option is-${option.kind}${picked ? ' is-picked' : ''}`}
        style={{ top: frame.top, height: frame.height }}
        aria-label={`${option.start}-${option.end}`}
        title={`${option.start}-${option.end}`}
        aria-pressed={picked}
        disabled={covered}
        onClick={(event) => { event.stopPropagation(); onToggle(option.start, option.end) }}
      />
    })}
    {selected.map((range) => {
      const key = batchKey(date, range.start, range.end)
      const frame = rangeFrame(range.start, range.end, slots)
      if (!merged.includes(range)) return <div key={key} className="tt-batch-outline" style={frame} />
      return <button
        key={key}
        type="button"
        className="tt-batch-outline is-merged"
        style={frame}
        aria-label={`${range.start}-${range.end}`}
        title={`取消选择 ${range.start}-${range.end}`}
        aria-pressed
        onClick={(event) => { event.stopPropagation(); onToggle(range.start, range.end) }}
      />
    })}
  </>
}
