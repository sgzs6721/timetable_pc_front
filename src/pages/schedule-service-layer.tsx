import { Button, Modal, Space, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { getJson } from '../api/biz'
import { clockText } from './schedule-board-helpers'
import { rangeFrame } from './schedule-board-fields'
import type { Schedule, TargetOption } from './schedule-model'
import { groupServiceSchedules, serviceAccount, type ServiceGroup } from './schedule-service'
import type { CellDialogProps } from './schedule-cell-dialog'

export function ServiceScheduleLayer(props: {
  schedules: Schedule[]; slots: Array<{ start: string; end: string }>; date: string; day: number
  timetableId: number; templateMode: boolean; canEdit: boolean
  onOpen: (cell: NonNullable<CellDialogProps['cell']>) => void
}) {
  const [group, setGroup] = useState<ServiceGroup | null>(null)
  const [accounts, setAccounts] = useState<TargetOption[]>()
  useEffect(() => { setGroup(null) }, [props.timetableId, props.date, props.templateMode, props.schedules])
  useEffect(() => {
    if (!group) return
    let active = true
    setAccounts(undefined)
    getJson<TargetOption[]>('/schedules/cell-target-options', {
      campusId: group.campusId, timetableId: props.timetableId, targetType: 'student', scheduleDate: props.templateMode ? undefined : props.date,
    }).then((rows) => { if (active) setAccounts(rows || []) }).catch(() => { if (active) setAccounts([]) })
    return () => { active = false }
  }, [group, props.timetableId, props.date, props.templateMode])
  function open(schedule?: Schedule) {
    if (!group || !props.canEdit) return
    const initial = schedule || group.schedules[0]
    const start = clockText(initial.startTime)
    const slot = props.slots.find((item) => item.start <= start && item.end > start)
    props.onOpen({ day: props.day, date: props.templateMode ? '' : props.date, start, end: clockText(initial.endTime),
      slotStart: slot?.start || start, slotEnd: slot?.end || group.end, schedule })
    setGroup(null)
  }
  return <>
    {groupServiceSchedules(props.schedules).map((item) => {
      const frame = rangeFrame(item.start, item.end, props.slots)
      return <button type="button" key={`${item.campusId}:${item.start}:${item.end}`} className={`tt-service-group${item.count ? '' : ' is-leave'}`} style={{ top: frame.top, height: frame.height }} onClick={() => setGroup(item)}>
        <strong>{item.names.slice(0, 2).join('、')}{item.names.length > 2 ? ` 等${item.names.length}${item.standalone ? '项' : '人'}` : ''}</strong>
        <small>{item.start}–{item.end} · {item.count ? `${item.count}${item.standalone ? '项服务' : '人'}` : '已取消'}</small>
      </button>
    })}
    <Modal title={group?.standalone ? '服务安排' : '服务名单'} open={!!group} onCancel={() => setGroup(null)} width={820} footer={<Space><Button onClick={() => setGroup(null)}>关闭</Button>{props.canEdit ? <Button type="primary" onClick={() => open()}>添加服务或学员</Button> : null}</Space>}>
      <p>{group?.start}–{group?.end} · {props.templateMode ? '固定安排' : props.date}</p>
      <Table rowKey={(row) => String(row.id)} dataSource={group?.schedules || []} pagination={false} scroll={{ x: 650 }} columns={[
        { title: '服务 / 学员', render: (_: unknown, row: Schedule) => <strong>{row.displayName || row.courseName}</strong> },
        { title: '时间', render: (_: unknown, row: Schedule) => `${clockText(row.startTime)}–${clockText(row.endTime)}` },
        { title: '账户', render: (_: unknown, row: Schedule) => { const info = serviceAccount(row, accounts); return <div className="service-roster-account">{info.label ? <Tag>{info.label}</Tag> : null}<span>{info.primary}</span><small>{info.secondary}</small></div> } },
        { title: '状态', render: (_: unknown, row: Schedule) => Number(row.uiChangeStatus) === 3 ? (row.targetType === 'service' ? '已取消' : '已请假') : props.templateMode ? '固定安排' : Number(row.uiChangeStatus) === 2 ? '已调整' : '已安排' },
        { title: '操作', render: (_: unknown, row: Schedule) => props.canEdit ? <Button type="link" onClick={() => open(row)}>查看 / 编辑</Button> : '仅查看' },
      ]} />
    </Modal>
  </>
}
