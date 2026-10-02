import { DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Switch, TimePicker, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { memberKey, useParentContext } from './ParentLayout'
import { BoardToolbar, ParentMemberTabs, ParentWeekBoard, useMemberSelection, useParentBoard } from './parent-kit'
import type { ParentLesson } from './parent-model'

interface EntryForm {
  entryType: 'COURSE' | 'SCHEDULE'
  courseId?: number
  content: string
  remark?: string
  repeatWeekly: boolean
  dayOfWeek?: number
  scheduleDate?: string
  startTime: Dayjs
  endTime: Dayjs
  autoCheckIn?: boolean
}

interface SetupForm {
  timetableType: 'CYCLE' | 'PERIOD'
  startDate?: string
  endDate?: string
  startTime: Dayjs
  endTime: Dayjs
  weekDays: number[]
  autoCheckIn: boolean
}

const weekdayOptions = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({ label, value: index + 1 }))
const atTime = (value = '08:00') => dayjs(`2000-01-01T${String(value).slice(0, 5)}:00`)

export function ParentTimetablePage() {
  const [params] = useSearchParams()
  const { home } = useParentContext()
  const selection = useMemberSelection(home.children || [])
  const boardState = useParentBoard(selection.selected)
  const [entry, setEntry] = useState<ParentLesson | null | undefined>(undefined)
  const [setupOpen, setSetupOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entryForm] = Form.useForm<EntryForm>()
  const [setupForm] = Form.useForm<SetupForm>()
  const repeating = Form.useWatch('repeatWeekly', entryForm)
  const entryType = Form.useWatch('entryType', entryForm)

  useEffect(() => {
    const requested = params.get('member')
    const member = home.children?.find((item) => memberKey(item) === requested)
    if (member) selection.select(member)
  }, [params, home.children])

  function openCreate() {
    setEntry(null)
    entryForm.setFieldsValue({ entryType: 'COURSE', courseId: boardState.board?.courses?.[0]?.id, content: boardState.board?.courses?.[0]?.name || '', repeatWeekly: true, dayOfWeek: 1, startTime: atTime('09:00'), endTime: atTime('10:00'), autoCheckIn: boardState.board?.autoCheckIn })
  }

  function openEntry(lesson: ParentLesson) {
    if (lesson.source === 'INSTITUTION') {
      Modal.info({ title: lesson.courseName || '机构课程', content: <div className="parent-lesson-detail"><p>{String(lesson.startTime || '').slice(0, 5)}–{String(lesson.endTime || '').slice(0, 5)}</p><p>{[lesson.campusName, lesson.coachName].filter(Boolean).join(' · ')}</p><p>机构同步课程由机构维护，家长端只读。</p></div> })
      return
    }
    setEntry(lesson)
    entryForm.setFieldsValue({ entryType: lesson.entryType || 'COURSE', courseId: lesson.courseId, content: lesson.courseName || '', remark: lesson.remark, repeatWeekly: lesson.repeatWeekly !== 0, dayOfWeek: lesson.dayOfWeek, scheduleDate: lesson.scheduleDate, startTime: atTime(lesson.startTime), endTime: atTime(lesson.endTime), autoCheckIn: lesson.autoCheckIn })
  }

  function openSetup() {
    const board = boardState.board
    setSetupOpen(true)
    setupForm.setFieldsValue({ timetableType: board?.timetableType || board?.requiredTimetableType || 'CYCLE', startDate: board?.timetableStartDate, endDate: board?.timetableEndDate, startTime: atTime(board?.boardStartTime || '07:00'), endTime: atTime(board?.boardEndTime || '22:00'), weekDays: board?.weekDays?.length ? board.weekDays : [1, 2, 3, 4, 5, 6, 7], autoCheckIn: Boolean(board?.autoCheckIn) })
  }

  async function saveEntry() {
    const values = await entryForm.validateFields()
    if (!boardState.board?.timetableId) return message.warning('请先配置课表')
    const course = boardState.board.courses?.find((item) => item.id === values.courseId)
    const payload = { timetableId: boardState.board.timetableId, courseId: values.entryType === 'COURSE' ? values.courseId : undefined, entryType: values.entryType, content: values.entryType === 'COURSE' ? (course?.name || values.content) : values.content.trim(), remark: values.remark?.trim(), autoCheckIn: Boolean(values.autoCheckIn), repeatWeekly: values.repeatWeekly, dayOfWeek: values.repeatWeekly ? values.dayOfWeek : undefined, scheduleDate: values.repeatWeekly ? undefined : values.scheduleDate, startTime: values.startTime.format('HH:mm'), endTime: values.endTime.format('HH:mm') }
    setSaving(true)
    try {
      if (entry?.slotId) await parentApi.updateEntry(entry.slotId, payload)
      else await parentApi.createEntry(payload)
      message.success(entry ? '安排已更新' : '安排已创建')
      setEntry(undefined)
      await boardState.reload()
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }

  async function saveSetup() {
    const values = await setupForm.validateFields()
    const timetableId = boardState.board?.timetableId || selection.selected?.timetableId
    if (!timetableId) return message.error('没有可配置的课表')
    setSaving(true)
    try {
      await parentApi.setupTimetable(timetableId, { ...values, startTime: values.startTime.format('HH:mm'), endTime: values.endTime.format('HH:mm'), acknowledgeCoverage: true })
      message.success('课表设置已保存')
      setSetupOpen(false)
      await boardState.reload()
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }

  async function removeEntry() {
    if (!entry?.slotId) return
    await parentApi.deleteSlot(entry.slotId)
    message.success('安排已删除')
    setEntry(undefined)
    await boardState.reload()
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>成员课表</h2><p>按周查看机构课程与自建安排；不同来源使用一致的时间轴。</p></div><div className="parent-page-actions"><Button icon={<SettingOutlined />} disabled={!selection.selected} onClick={openSetup}>课表设置</Button><Button type="primary" icon={<PlusOutlined />} disabled={!boardState.board?.configured} onClick={openCreate}>新增安排</Button></div></div>
      <div className="parent-timetable-memberbar"><ParentMemberTabs members={home.children || []} value={selection.selectedKey} onChange={selection.select} />{boardState.board ? <span>{boardState.board.orgName ? `${boardState.board.orgName} · ` : ''}{boardState.board.timetableType === 'PERIOD' ? '时段课表' : '固定课表'}</span> : null}</div>
      <BoardToolbar start={boardState.start} setStart={boardState.setStart} member={selection.selected} />
      <ParentWeekBoard board={boardState.board} start={boardState.start} loading={boardState.loading} error={boardState.error} onLessonClick={openEntry} />
      <Modal open={entry !== undefined} title={entry ? '编辑课程安排' : '新增课程安排'} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void saveEntry()} onCancel={() => setEntry(undefined)} footer={(originNode) => <div className="parent-entry-footer">{entry?.slotId ? <Popconfirm title="删除这条安排？" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={removeEntry}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : <span />}<span>{originNode}</span></div>}>
        <Form form={entryForm} layout="vertical">
          <Form.Item name="entryType" label="安排类型" rules={[{ required: true }]}><Select options={[{ value: 'COURSE', label: '课程' }, { value: 'SCHEDULE', label: '随记安排' }]} /></Form.Item>
          {entryType === 'COURSE' ? <Form.Item name="courseId" label="课程" rules={[{ required: true, message: '请选择课程' }]}><Select options={(boardState.board?.courses || []).map((course) => ({ value: course.id, label: course.name }))} /></Form.Item> : <Form.Item name="content" label="安排内容" rules={[{ required: true, whitespace: true, message: '请输入安排内容' }]}><Input maxLength={40} /></Form.Item>}
          <Form.Item name="repeatWeekly" label="重复方式" valuePropName="checked"><Switch checkedChildren="每周重复" unCheckedChildren="仅一次" /></Form.Item>
          {repeating ? <Form.Item name="dayOfWeek" label="星期" rules={[{ required: true }]}><Select options={weekdayOptions} /></Form.Item> : <Form.Item name="scheduleDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}><BusinessDatePicker /></Form.Item>}
          <div className="parent-form-grid"><Form.Item name="startTime" label="开始时间" rules={[{ required: true }]}><TimePicker format="HH:mm" minuteStep={5} /></Form.Item><Form.Item name="endTime" label="结束时间" rules={[{ required: true }]}><TimePicker format="HH:mm" minuteStep={5} /></Form.Item></div>
          <Form.Item name="remark" label="备注（选填）"><Input.TextArea rows={3} maxLength={100} showCount /></Form.Item>
          <Form.Item name="autoCheckIn" valuePropName="checked"><Checkbox>按计划自动打卡</Checkbox></Form.Item>
        </Form>
      </Modal>
      <Modal open={setupOpen} title="课表设置" okText="保存设置" cancelText="取消" confirmLoading={saving} onOk={() => void saveSetup()} onCancel={() => setSetupOpen(false)} width={620}>
        <p className="parent-modal-intro">固定课表适合长期每周重复；时段课表适合有明确起止日期的学期或训练营。</p>
        <Form form={setupForm} layout="vertical">
          <Form.Item name="timetableType" label="课表类型" rules={[{ required: true }]}><Select disabled={Boolean(boardState.board?.requiredTimetableType)} options={[{ value: 'CYCLE', label: '固定循环课表' }, { value: 'PERIOD', label: '时段课表' }]} /></Form.Item>
          <div className="parent-form-grid"><Form.Item name="startDate" label="开始日期"><BusinessDatePicker /></Form.Item><Form.Item name="endDate" label="结束日期"><BusinessDatePicker /></Form.Item></div>
          <div className="parent-form-grid"><Form.Item name="startTime" label="每日开始时间" rules={[{ required: true }]}><TimePicker format="HH:mm" minuteStep={30} /></Form.Item><Form.Item name="endTime" label="每日结束时间" rules={[{ required: true }]}><TimePicker format="HH:mm" minuteStep={30} /></Form.Item></div>
          <Form.Item name="weekDays" label="显示星期" rules={[{ required: true, message: '至少选择一天' }]}><Checkbox.Group options={weekdayOptions} /></Form.Item>
          <Form.Item name="autoCheckIn" label="默认自动打卡" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
