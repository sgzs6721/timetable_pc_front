import { Button, Form, Input, InputNumber, Popconfirm, Space, Switch, message } from 'antd'
import { delJson, postJson, putJson } from '../api/biz'
import { money, tell } from './kit'
import type { Student } from './students-model'

export function FeeItems(props: { student: Student; items: Array<Record<string, unknown>>; onChanged: () => Promise<void> }) {
  const [form] = Form.useForm()
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Form
        form={form}
        layout="inline"
        onFinish={async (values: { name: string; amount: number; hours?: number; courseType?: string }) => {
          const name = String(values.name || '').trim()
          const amount = Number(values.amount)
          if (!name || !(amount > 0)) {
            message.warning('请填写名称和金额')
            return
          }
          const studentCardId = Number(props.student.cards?.[0]?.id || 0) || undefined
          try {
            await postJson(`/parent-admin/students/${props.student.id}/fee-items`, {
              name,
              amount,
              charge: {
                type: 'new',
                hours: Number(values.hours || 0),
                courseType: String(values.courseType || '').trim(),
                paymentMethod: 2,
                studentCardId,
              },
            })
            message.success('已添加可缴项目')
            form.resetFields()
            await props.onChanged()
          } catch (error) {
            message.error(tell(error, '添加失败'))
          }
        }}
      >
        <Form.Item name="name"><Input placeholder="项目名称" /></Form.Item>
        <Form.Item name="amount"><InputNumber placeholder="金额" min={0} /></Form.Item>
        <Form.Item name="hours"><InputNumber placeholder="课时" /></Form.Item>
        <Form.Item name="courseType"><Input placeholder="课程" /></Form.Item>
        <Button htmlType="submit">保存项目</Button>
      </Form>
      {props.items.map((item) => (
        <Space key={String(item.id)}>
          <span>{String(item.name || '')} · {money(item.amount)}</span>
          <Switch
            checked={Boolean(item.enabled)}
            onChange={async (enabled) => {
              try {
                await putJson(`/parent-admin/fee-items/${item.id}/enabled`, { enabled })
                await props.onChanged()
              } catch (error) {
                message.error(tell(error, '更新失败'))
              }
            }}
          />
          <Popconfirm title="删除这个可缴项目？" onConfirm={async () => {
            try {
              await delJson(`/parent-admin/fee-items/${item.id}`)
              await props.onChanged()
            } catch (error) {
              message.error(tell(error, '删除失败'))
            }
          }}>
            <Button type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ))}
      {!props.items.length ? <p>还没有家长可缴项目。</p> : null}
    </Space>
  )
}
