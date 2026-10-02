import { CalendarOutlined } from '@ant-design/icons'
import { DatePicker } from 'antd'
import type { CSSProperties } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

const DATE_FORMAT = 'YYYY-MM-DD'
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm'

type PickerStatus = 'warning' | 'error'

export interface BusinessDatePickerProps {
  value?: string
  onChange?: (value: string) => void
  min?: string
  max?: string
  minDate?: string
  maxDate?: string
  disabled?: boolean
  allowClear?: boolean
  placeholder?: string
  className?: string
  style?: CSSProperties
  id?: string
  status?: PickerStatus
}

export interface BusinessDateRangePickerProps {
  value?: [string, string]
  onChange?: (value: [string, string]) => void
  minDate?: string
  maxDate?: string
  disabled?: boolean
  allowClear?: boolean
  placeholder?: [string, string]
  className?: string
  style?: CSSProperties
  id?: string
  status?: PickerStatus
}

export interface BusinessDateTimePickerProps extends Omit<BusinessDatePickerProps, 'min' | 'max' | 'minDate' | 'maxDate'> {
  minDate?: string
  maxDate?: string
}

export interface BusinessMultiDatePickerProps extends Omit<BusinessDatePickerProps, 'value' | 'onChange'> {
  value?: string[]
  onChange?: (value: string[]) => void
  usedValues?: string[]
}

function asDay(value?: string): Dayjs | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : undefined
}

function popupClassName(extra?: string): string {
  return ['business-calendar-popup', extra].filter(Boolean).join(' ')
}

export function BusinessDatePicker({
  value,
  onChange,
  min,
  max,
  minDate,
  maxDate,
  allowClear = true,
  placeholder = '请选择日期',
  className,
  style,
  ...rest
}: BusinessDatePickerProps) {
  return (
    <DatePicker
      {...rest}
      value={asDay(value)}
      minDate={asDay(minDate || min)}
      maxDate={asDay(maxDate || max)}
      format={DATE_FORMAT}
      allowClear={allowClear}
      placeholder={placeholder}
      className={['business-date-picker', className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: popupClassName() } }}
      suffixIcon={<CalendarOutlined />}
      style={{ width: '100%', ...style }}
      onChange={(_, dateString) => onChange?.(String(dateString || ''))}
    />
  )
}

export function BusinessDateRangePicker({
  value,
  onChange,
  minDate,
  maxDate,
  allowClear = true,
  placeholder = ['开始日期', '结束日期'],
  className,
  style,
  ...rest
}: BusinessDateRangePickerProps) {
  const range = value?.[0] || value?.[1]
    ? [asDay(value?.[0]) || null, asDay(value?.[1]) || null] as [Dayjs | null, Dayjs | null]
    : undefined
  return (
    <DatePicker.RangePicker
      {...rest}
      value={range}
      minDate={asDay(minDate)}
      maxDate={asDay(maxDate)}
      format={DATE_FORMAT}
      allowClear={allowClear}
      allowEmpty={[true, true]}
      placeholder={placeholder}
      className={['business-date-range-picker', className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: popupClassName('business-calendar-range-popup') } }}
      style={{ width: '100%', ...style }}
      presets={[
        { label: '今天', value: [dayjs().startOf('day'), dayjs().startOf('day')] },
        { label: '昨天', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').startOf('day')] },
        { label: '本周', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
        { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
      ]}
      onChange={(_, dateStrings) => onChange?.([String(dateStrings[0] || ''), String(dateStrings[1] || '')])}
    />
  )
}

export function BusinessMultiDatePicker({
  value = [],
  onChange,
  usedValues = [],
  min,
  max,
  minDate,
  maxDate,
  placeholder = '请选择日期（可多选）',
  className,
  style,
  ...rest
}: BusinessMultiDatePickerProps) {
  const used = new Set(usedValues)
  return (
    <DatePicker
      {...rest}
      multiple
      needConfirm
      value={value.map(asDay).filter((item): item is Dayjs => !!item)}
      minDate={asDay(minDate || min)}
      maxDate={asDay(maxDate || max)}
      format={DATE_FORMAT}
      placeholder={placeholder}
      className={['business-date-picker', 'business-multi-date-picker', className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: popupClassName('business-calendar-multiple-popup') } }}
      suffixIcon={<CalendarOutlined />}
      maxTagCount="responsive"
      style={{ width: '100%', ...style }}
      cellRender={(current, info) => dayjs.isDayjs(current) && used.has(current.format(DATE_FORMAT)) ? (
        <span className="business-calendar-cell-state is-used" title="该日期已有打卡记录">
          {info.originNode}<i />
        </span>
      ) : info.originNode}
      onChange={(dates) => onChange?.((Array.isArray(dates) ? dates : [])
        .filter((date): date is Dayjs => dayjs.isDayjs(date))
        .map((date) => date.format(DATE_FORMAT))
        .sort())}
    />
  )
}

export function BusinessDateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  allowClear = true,
  placeholder = '请选择日期和时间',
  className,
  style,
  ...rest
}: BusinessDateTimePickerProps) {
  return (
    <DatePicker
      {...rest}
      value={asDay(value)}
      minDate={asDay(minDate)}
      maxDate={asDay(maxDate)}
      format="YYYY-MM-DD HH:mm"
      showTime={{ format: 'HH:mm' }}
      allowClear={allowClear}
      placeholder={placeholder}
      className={['business-date-picker', 'business-date-time-picker', className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: popupClassName('business-calendar-time-popup') } }}
      suffixIcon={<CalendarOutlined />}
      style={{ width: '100%', ...style }}
      onChange={(date) => onChange?.(date ? date.format(DATE_TIME_FORMAT) : '')}
    />
  )
}
