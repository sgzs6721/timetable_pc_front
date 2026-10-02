import { ArrowLeftOutlined, CalendarOutlined, DeleteOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Skeleton, Tabs, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import type { ParentClassRecord, ParentCourseDetail, ParentPayment } from './parent-model'

type Editor = { kind: 'payment' | 'class'; record?: ParentPayment | ParentClassRecord } | null

export function ParentCoursePage() {
  const navigate = useNavigate()
  const { courseId } = useParams()
  const id = Number(courseId)
  const [detail, setDetail] = useState<ParentCourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('payment')
  const [editor, setEditor] = useState<Editor>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ amount?: number; date: string; remark?: string }>()

  function load() {
    setLoading(true)
    parentApi.course(id).then(setDetail).catch((reason) => message.error(reason.message)).finally(() => setLoading(false))
  }
  useEffect(load, [id])

  function openEditor(kind: 'payment' | 'class', record?: ParentPayment | ParentClassRecord) {
    setEditor({ kind, record })
    form.setFieldsValue({ amount: kind === 'payment' ? Number((record as ParentPayment)?.amount || 0) || undefined : undefined, date: kind === 'payment' ? ((record as ParentPayment)?.payDate || (record as ParentPayment)?.paymentDate || dayjs().format('YYYY-MM-DD')) : ((record as ParentClassRecord)?.classDate || dayjs().format('YYYY-MM-DD')), remark: record?.remark || '' })
  }

  async function save() {
    if (!editor) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editor.kind === 'payment') {
        const payload = { amount: Number(values.amount), payDate: values.date, remark: values.remark?.trim() }
        if (editor.record?.id) await parentApi.updatePayment(editor.record.id, payload)
        else await parentApi.addPayment(id, payload)
      } else {
        const payload = { classDate: values.date, remark: values.remark?.trim() }
        if (editor.record?.id) await parentApi.updateClassDate(editor.record.id, payload)
        else await parentApi.addClassDate(id, payload)
      }
      message.success(editor.record ? '记录已更新' : '记录已添加')
      setEditor(null)
      load()
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }

  async function remove(kind: 'payment' | 'class', recordId: number) {
    if (kind === 'payment') await parentApi.deletePayment(recordId)
    else await parentApi.deleteClassDate(recordId)
    message.success('记录已删除')
    load()
  }

  async function removeSlot(slotId: number) {
    await parentApi.deleteSlot(slotId)
    message.success('排课时段已删除')
    load()
  }

  if (loading) return <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 10 }} /></div>
  if (!detail) return <div className="parent-card parent-empty"><Empty description="课程不存在或无权查看" /></div>
  const course = detail.course
  return (
    <div>
      <div className="parent-page-head"><div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/parent/courses')}>返回课程</Button><h2>{course.name || '课程详情'}</h2><p>{[course.orgName, course.campusName].filter(Boolean).join(' · ') || '家长自建课程'} · 缴费和打卡只在家长端可见</p></div><Tag color="geekblue">自建课程</Tag></div>
      <section className="parent-card parent-course-slots">
        <div className="parent-card-head"><h3>排课时段</h3><Button type="link" onClick={() => navigate('/parent/timetable')}>去课表新增</Button></div>
        {(course.slots || []).length ? course.slots!.map((slot) => <div className="parent-slot-row" key={slot.id}><span><CalendarOutlined /></span><div><strong>{slot.repeatWeekly ? `每周${['', '一', '二', '三', '四', '五', '六', '日'][slot.dayOfWeek || 0]}` : slot.scheduleDate}</strong><small>{String(slot.startTime || '').slice(0, 5)}–{String(slot.endTime || '').slice(0, 5)}{slot.remark ? ` · ${slot.remark}` : ''}</small></div><Popconfirm title="删除这个排课时段？" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => removeSlot(slot.id)}><Button type="text" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></div>) : <div className="parent-course-empty">还没有排课时段，请到课表中点击新增安排。</div>}
      </section>
      <section className="parent-card parent-course-records">
        <Tabs activeKey={activeTab} onChange={setActiveTab} tabBarExtraContent={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(activeTab as 'payment' | 'class')}>{activeTab === 'payment' ? '记一笔缴费' : '记一次打卡'}</Button>} items={[
          { key: 'payment', label: `缴费记录 ${detail.payments?.length || 0}`, children: detail.payments?.length ? detail.payments.map((row) => <CourseRecordRow key={row.id} kind="payment" row={row} onEdit={() => openEditor('payment', row)} onDelete={() => remove('payment', row.id)} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无缴费记录" /> },
          { key: 'class', label: `打卡记录 ${detail.classDates?.length || 0}`, children: detail.classDates?.length ? detail.classDates.map((row) => <CourseRecordRow key={row.id} kind="class" row={row} onEdit={() => openEditor('class', row)} onDelete={() => remove('class', row.id)} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无打卡记录" /> },
        ]} />
      </section>
      <Modal open={Boolean(editor)} title={editor?.kind === 'payment' ? (editor.record ? '编辑缴费记录' : '新增缴费记录') : (editor?.record ? '编辑打卡记录' : '新增打卡记录')} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setEditor(null)}>
        <Form form={form} layout="vertical">
          {editor?.kind === 'payment' ? <Form.Item name="amount" label="缴费金额" rules={[{ required: true, message: '请输入金额' }]}><InputNumber min={0.01} precision={2} prefix="¥" style={{ width: '100%' }} /></Form.Item> : null}
          <Form.Item name="date" label={editor?.kind === 'payment' ? '缴费日期' : '打卡日期'} rules={[{ required: true, message: '请选择日期' }]}><BusinessDatePicker /></Form.Item>
          <Form.Item name="remark" label="备注（选填）"><Input.TextArea rows={3} maxLength={100} showCount /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function CourseRecordRow(props: { kind: 'payment' | 'class'; row: ParentPayment | ParentClassRecord; onEdit: () => void; onDelete: () => void }) {
  const payment = props.row as ParentPayment
  const classRow = props.row as ParentClassRecord
  return <div className="parent-course-record-row"><span className={props.kind}>{props.kind === 'payment' ? <WalletOutlined /> : <CalendarOutlined />}</span><div><strong>{props.kind === 'payment' ? `¥${Number(payment.amount || 0).toFixed(2)}` : classRow.classDate}</strong><small>{[props.kind === 'payment' ? (payment.payDate || payment.paymentDate) : (classRow.autoCheckIn ? '自动打卡' : '手动打卡'), props.row.remark].filter(Boolean).join(' · ')}</small></div><Button onClick={props.onEdit}>编辑</Button><Popconfirm title="删除这条记录？" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={props.onDelete}><Button danger>删除</Button></Popconfirm></div>
}
