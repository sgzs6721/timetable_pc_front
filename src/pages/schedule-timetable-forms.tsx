import { Button, Form, Input, Modal, Select, Switch, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson, postJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { tell } from './kit'
import type { Timetable } from './schedule-model'
import { clockText, duplicateTimetableName, editTimetableSignature } from './schedule-board-helpers'
import { TimetableKindSelect, WeekDaySelect, timetableBody, timetableFormError } from './schedule-board-fields'

export function WeekendFields(props: { disabled?: boolean }) {
  const split = Form.useWatch('splitWeekend')
  return (
    <>
      <Form.Item name="splitWeekend" label="周末单独时间" valuePropName="checked" getValueFromEvent={(checked) => checked ? 1 : 0} getValueProps={(value) => ({ checked: Number(value) === 1 })}>
        <Switch disabled={props.disabled} />
      </Form.Item>
      {Number(split) === 1 ? (
        <>
          <Form.Item name="weekendStartTime" label="周末开始"><Input type="time" min="06:00" max="23:00" step={1800} disabled={props.disabled} /></Form.Item>
          <Form.Item name="weekendEndTime" label="周末结束"><Input type="time" min="06:00" max="23:00" step={1800} disabled={props.disabled} /></Form.Item>
        </>
      ) : null}
    </>
  )
}

export function EditTimetableForm(props: { current: Timetable; locked: boolean; campusId: number; onSaved: () => Promise<void> }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const watched = Form.useWatch([], form)
  const dirty = watched != null && editTimetableSignature({ ...props.current, ...watched }, props.locked) !== editTimetableSignature(props.current, props.locked)
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={props.current}
      onFinish={async (values) => {
        if (!dirty || saving) return
        const problem = timetableFormError({ ...props.current, ...values }, props.locked)
        if (problem) {
          message.warning(problem)
          return
        }
        setSaving(true)
        try {
          await putJson(`/timetables/${props.current.id}`, timetableBody({ ...props.current, ...values }, props.campusId, props.locked))
          message.success('修改成功')
          await props.onSaved()
        } catch (error) {
          message.error(tell(error, '修改失败'))
        } finally {
          setSaving(false)
        }
      }}
    >
      <Form.Item name="name" label="课表名称" extra="最多12个字符" rules={[{ required: true, message: '请输入课表名称' }]}><Input maxLength={12} placeholder="如：秋季班课表" /></Form.Item>
      <Form.Item name="isWeekly" label="课表类型"><TimetableKindSelect disabled={props.locked} /></Form.Item>
      <TimetableDateFields disabled={props.locked} />
      {props.locked ? <p>已排课，不可修改</p> : null}
      <Form.Item name="startTime" label="开始时间"><Input type="time" min="06:00" max="23:00" step={1800} disabled={props.locked} /></Form.Item>
      <Form.Item name="endTime" label="结束时间"><Input type="time" min="06:00" max="23:00" step={1800} disabled={props.locked} /></Form.Item>
      <Form.Item name="weekDays" label="上课日"><WeekDaySelect disabled={props.locked} /></Form.Item>
      <WeekendFields disabled={props.locked} />
      <Button type="primary" htmlType="submit" disabled={!dirty || saving}>{saving ? '保存中...' : '保存修改'}</Button>
    </Form>
  )
}

export function CreateTimetableButton(props: { members: Array<{ id: number; activeCount: number }>; saving: boolean }) {
  const form = Form.useFormInstance()
  const values = Form.useWatch([], form) as Partial<Timetable> | undefined
  const problem = timetableFormError(values || {})
  const member = props.members.find((item) => item.id === Number(values?.createByMemberId || 0))
  const blocked = !!problem || (!!member && member.activeCount >= 2)
  return <Button type="primary" htmlType="submit" disabled={blocked || props.saving}>{props.saving ? '创建中...' : '创建课表'}</Button>
}

export function CreateTimetable(props: { open: boolean; campusId: number; manager: boolean; selfMemberId: number; source?: Timetable | null; onClose: () => void; onSaved: (id: number) => void }) {
  const [members, setMembers] = useState<Array<{ id: number; displayName?: string; nickname?: string; phone?: string; activeCount: number }>>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!props.open || !props.campusId) return
    Promise.all([
      getJson<Array<{ id: number; displayName?: string; nickname?: string; phone?: string }>>(`/campus-teacher/campus/${props.campusId}`, { onlySubstitute: true }),
      getJson<Timetable[]>('/timetables/list'),
    ]).then(([teachers, tables]) => {
      const counts = new Map<number, number>()
      ;(tables || []).forEach((item) => {
        if (Number(item.status ?? 1) === 2 || !item.createByMemberId) return
        counts.set(item.createByMemberId, (counts.get(item.createByMemberId) || 0) + 1)
      })
      const rows = (teachers || []).map((item) => ({ ...item, activeCount: counts.get(item.id) || 0 }))
      setMembers(props.manager ? rows : rows.filter((item) => item.id === props.selfMemberId))
    }).catch(() => setMembers([]))
  }, [props.open, props.campusId, props.manager, props.selfMemberId])
  return (
    <Modal title="创建课表" open={props.open} onCancel={props.onClose} footer={null} destroyOnHidden>
      <Form
        layout="vertical"
        initialValues={{
          name: props.source ? duplicateTimetableName(props.source.name) : undefined,
          isWeekly: props.source?.isWeekly ?? 1,
          startTime: clockText(props.source?.startTime) || '08:00',
          endTime: clockText(props.source?.endTime) || '21:00',
          weekDays: props.source?.weekDays || [1, 2, 3, 4, 5, 6, 7],
          startDate: props.source?.startDate,
          endDate: props.source?.endDate,
          createByMemberId: props.manager ? props.source?.createByMemberId : props.selfMemberId,
          splitWeekend: props.source?.splitWeekend || 0,
          weekendStartTime: props.source?.weekendStartTime,
          weekendEndTime: props.source?.weekendEndTime,
        }}
        onFinish={async (values) => {
          if (saving) return
          const problem = timetableFormError(values)
          if (problem) {
            message.warning(problem)
            return
          }
          const member = members.find((item) => item.id === values.createByMemberId)
          if (member && member.activeCount >= 2) {
            message.warning('每人最多保留2张非归档课表，请先归档后再新增')
            return
          }
          setSaving(true)
          try {
            const created = await postJson<Timetable>('/timetables', timetableBody(values, props.campusId))
            message.success('创建成功')
            props.onSaved(created.id)
          } catch (error) {
            message.error(tell(error, '创建失败'))
          } finally {
            setSaving(false)
          }
        }}
      >
        <Form.Item name="name" label="课表名称" extra="最多12个字符" rules={[{ required: true, message: '请输入课表名称' }]}><Input maxLength={12} placeholder="如：秋季班课表" /></Form.Item>
        <Form.Item name="createByMemberId" label="所属人员" rules={[{ required: true, message: '请选择所属人员' }]}>
          <Select
            disabled={!props.manager}
            options={members.map((item) => ({
              value: item.id,
              disabled: item.activeCount >= 2,
              label: `${item.displayName || item.nickname || item.phone}${item.activeCount >= 2 ? '（每人最多保留2张非归档课表，请先归档后再新增）' : ''}`,
            }))}
          />
        </Form.Item>
        {!members.length ? <p>当前校区暂无带课老师</p> : null}
        <Form.Item name="isWeekly" label="课表类型"><TimetableKindSelect /></Form.Item>
        <TimetableDateFields />
        <Form.Item name="weekDays" label="上课日"><WeekDaySelect /></Form.Item>
        <Form.Item name="startTime" label="开始时间"><Input type="time" min="06:00" max="23:00" step={1800} /></Form.Item>
        <Form.Item name="endTime" label="结束时间"><Input type="time" min="06:00" max="23:00" step={1800} /></Form.Item>
        <p>排课粒度固定为 1 小时。</p>
        <WeekendFields />
        <CreateTimetableButton members={members} saving={saving} />
      </Form>
    </Modal>
  )
}

export function TimetableDateFields(props: { disabled?: boolean }) {
  const weekly = Form.useWatch('isWeekly')
  if (Number(weekly ?? 1) === 1) return null
  return (
    <>
      <Form.Item name="startDate" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}><BusinessDatePicker disabled={props.disabled} /></Form.Item>
      <Form.Item name="endDate" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}><BusinessDatePicker disabled={props.disabled} /></Form.Item>
    </>
  )
}

export function schedulableCampuses(campuses: Array<{ id: number; name: string }>, ownerCampusIds?: number[]) {
  const available = campuses.filter((item) => item.id > 0)
  const ownerIds = (ownerCampusIds || []).map(Number).filter((id) => id > 0)
  if (!ownerIds.length) return available
  const allowed = new Set(ownerIds)
  return available.filter((item) => allowed.has(item.id))
}

export function slotContaining(time: string, slots: Array<{ start: string; end: string }>): { start: string; end: string } | undefined {
  return slots.find((slot) => time >= slot.start && time < slot.end)
}
