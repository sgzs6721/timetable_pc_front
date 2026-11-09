import { Form, Input, InputNumber, Modal, Switch, message } from 'antd'
import { useState } from 'react'
import { putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { tell } from './kit'

export function expenseSettingMeta(remark: unknown): { isRecurring: boolean; cycleMonths: number; startDate: string } {
  try {
    const meta = JSON.parse(String(remark || '{}')).expenseSetting || {}
    return { isRecurring: !!meta.isRecurring, cycleMonths: Number(meta.cycleMonths || 0), startDate: String(meta.startDate || '') }
  } catch { return { isRecurring: false, cycleMonths: 0, startDate: '' } }
}

export function categoryRemark(original: unknown, values: { isRecurring?: boolean; cycleMonths?: number; startDate?: string }): string {
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(String(original || '{}')) || {} } catch { /* Legacy free-text remarks have no metadata. */ }
  return JSON.stringify({ ...meta, expenseSetting: { isRecurring: !!values.isRecurring, cycleMonths: values.isRecurring ? Number(values.cycleMonths) : 0, startDate: values.isRecurring ? values.startDate : '' } })
}

export function FinanceCategoryEditor(props: {
  current: Record<string, unknown>; campusId: number | null
  validate: (name: string) => string; onClose: () => void; onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const recurring = Form.useWatch('isRecurring', form)
  const expense = props.current.direction === 'expense'
  return <Modal title={expense ? '编辑支出项目' : '编辑收入项目'} open onCancel={() => { if (!saving) props.onClose() }} okText="保存" confirmLoading={saving} onOk={() => form.submit()}>
    <Form name="finance-category-edit" form={form} layout="vertical" initialValues={{ ...props.current, ...expenseSettingMeta(props.current.remark), enabled: Number(props.current.enabled) !== 0 }} onFinish={async (values) => {
      if (saving) return
      const name = String(values.name || '').trim()
      const error = props.validate(name)
      if (error) return void message.warning(error)
      setSaving(true)
      try {
        await putJson(`/finance/categories/${props.current.id}`, {
          name, campusId: props.campusId, direction: props.current.direction, sort: props.current.sort,
          enabled: values.enabled ? 1 : 0, remark: expense ? categoryRemark(props.current.remark, values) : props.current.remark,
        })
        message.success('项目已保存')
        props.onClose()
        await props.onSaved()
      } catch (error) { message.error(tell(error, '保存失败')) } finally { setSaving(false) }
    }}>
      <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}><Input maxLength={8} /></Form.Item>
      <Form.Item name="enabled" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
      {expense ? <Form.Item name="isRecurring" label="周期支出" valuePropName="checked"><Switch /></Form.Item> : null}
      {expense && recurring ? <>
        <Form.Item name="cycleMonths" label="周期月数" rules={[{ required: true, type: 'integer', min: 1, message: '请输入正整数月数' }]}><InputNumber min={1} precision={0} /></Form.Item>
        <Form.Item name="startDate" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}><BusinessDatePicker /></Form.Item>
      </> : null}
    </Form>
  </Modal>
}
