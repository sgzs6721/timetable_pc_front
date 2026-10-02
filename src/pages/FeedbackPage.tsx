import { Button, Form, Input, Select, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { PageHead, tell, useShell } from './kit'

interface Feedback {
  id: number
  categoryText?: string
  title?: string
  content?: string
  status?: number
  statusText?: string
  resolutionText?: string
  replyContent?: string
  replyTime?: string
  createTime?: string
}

function displayTime(value?: string) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

function feedbackStatusClass(value?: number) {
  if (Number(value) === 3) return 'status-pill is-ok'
  if (Number(value) === 4) return 'status-pill is-muted'
  if (Number(value) > 0) return 'status-pill is-warn'
  return 'status-pill'
}

export function FeedbackPage() {
  const shell = useShell()
  const [rows, setRows] = useState<Feedback[]>([])
  const [tab, setTab] = useState('submit')
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  async function load() {
    setRows(await getJson<Feedback[]>('/feedback/my', { source: 'org', limit: 50 }))
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '反馈加载失败')))
  }, [])

  useEffect(() => {
    if (!form.getFieldValue('contact') && shell.user?.phone) form.setFieldValue('contact', shell.user.phone)
  }, [form, shell.user?.phone])

  return (
    <section>
      <PageHead title="问题反馈" extra="提交后可以在这里查看处理状态和回复。" />
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'submit', label: '提交反馈', children: (
      <section className="work-card feedback-submit-card">
        <Form
          className="feedback-submit-form"
          form={form}
          layout="vertical"
          initialValues={{ category: 'bug', contact: shell.user?.phone }}
          onFinish={async (values: { category: string; title: string; content: string; contact?: string }) => {
            if (submitting) return
            const title = String(values.title || '').trim()
            const content = String(values.content || '').trim()
            const contact = String(values.contact || '').replace(/\D+/g, '').slice(0, 11)
            if (!title) {
              message.warning('请填写反馈标题')
              return
            }
            if (!content) {
              message.warning('请描述具体问题')
              return
            }
            if (Array.from(content).length < 10) {
              message.warning('问题描述至少 10 个字')
              return
            }
            if (!contact) {
              message.warning('请输入手机号')
              return
            }
            if (!/^1\d{10}$/.test(contact)) {
              message.warning('请输入正确的11位手机号')
              return
            }
            setSubmitting(true)
            try {
              await postJson('/feedback', { category: values.category, title: title.slice(0, 30), content: Array.from(content).slice(0, 500).join(''), contact, source: 'org' })
              message.success('反馈已提交')
              form.resetFields()
              form.setFieldsValue({ category: 'bug', contact: shell.user?.phone || contact })
              setTab('records')
              await load()
            } catch (error) {
              message.error(tell(error, '提交失败'))
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <Form.Item name="category" label="类别" rules={[{ required: true }]}>
            <Select options={[{ value: 'bug', label: '异常问题' }, { value: 'feature', label: '功能建议' }, { value: 'ui', label: '界面体验' }, { value: 'other', label: '其他反馈' }]} />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写反馈标题' }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="content" label="描述" rules={[{ required: true, message: '请描述具体问题' }]}><Input.TextArea rows={4} maxLength={500} showCount placeholder="请写清页面、时间和复现步骤，至少 10 个字" /></Form.Item>
          <Form.Item name="contact" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}><Input maxLength={11} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>提交反馈</Button>
        </Form>
      </section>
        ) },
        { key: 'records', label: '我的反馈', children: (
      <section className="work-card">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '还没有反馈' }}
          expandable={{
            rowExpandable: () => true,
            expandedRowRender: (row) => (
              <div className="record-detail">
                <p><strong>反馈内容</strong></p>
                <p>{row.content || '—'}</p>
                {row.resolutionText ? <><p><strong>处理结论</strong></p><p>{row.resolutionText}</p></> : null}
                {row.replyContent ? <><p><strong>运营回复</strong></p><p>{row.replyContent}</p>{row.replyTime ? <small>{displayTime(row.replyTime)}</small> : null}</> : <p>运营人员处理后，回复会展示在这里。</p>}
              </div>
            ),
          }}
          columns={[
            { title: '时间', dataIndex: 'createTime', width: 150, render: (value: string) => displayTime(value) },
            { title: '类别', dataIndex: 'categoryText' },
            { title: '标题', dataIndex: 'title' },
            { title: '状态', dataIndex: 'statusText', width: 110, render: (value: string, row: Feedback) => <span className={feedbackStatusClass(row.status)}>{value || '待处理'}</span> },
            { title: '处理进度', width: 120, render: (_: unknown, row: Feedback) => row.replyContent || row.resolutionText ? '已有回复' : '等待处理' },
          ]}
        />
      </section>
        ) },
      ]} />
    </section>
  )
}
