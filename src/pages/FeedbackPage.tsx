import { Button, Form, Input, Select, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { PageHead, tell } from './kit'

interface Feedback {
  id: number
  categoryText?: string
  title?: string
  content?: string
  statusText?: string
  replyContent?: string
  createTime?: string
}

export function FeedbackPage() {
  const [rows, setRows] = useState<Feedback[]>([])
  const [tab, setTab] = useState('submit')

  async function load() {
    setRows(await getJson<Feedback[]>('/feedback/my', { source: 'org', limit: 50 }))
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '反馈加载失败')))
  }, [])

  return (
    <section>
      <PageHead title="问题反馈" extra="提交后可以在这里查看处理状态和回复。" />
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'submit', label: '提交反馈', children: (
      <section className="work-card">
        <Form
          layout="vertical"
          onFinish={async (values: { category: string; title: string; content: string; contact?: string }) => {
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
            try {
              await postJson('/feedback', { category: values.category, title: title.slice(0, 30), content: Array.from(content).slice(0, 500).join(''), contact, source: 'org' })
              message.success('反馈已提交')
              setTab('records')
              await load()
            } catch (error) {
              message.error(tell(error, '提交失败'))
            }
          }}
        >
          <Form.Item name="category" label="类别" initialValue="bug" rules={[{ required: true }]}>
            <Select options={[{ value: 'bug', label: '异常问题' }, { value: 'feature', label: '功能建议' }, { value: 'ui', label: '界面体验' }, { value: 'other', label: '其他反馈' }]} />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写反馈标题' }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="content" label="描述" rules={[{ required: true, message: '请描述具体问题' }]}><Input.TextArea rows={4} maxLength={500} showCount placeholder="请写清页面、时间和复现步骤，至少 10 个字" /></Form.Item>
          <Form.Item name="contact" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}><Input maxLength={11} /></Form.Item>
          <Button type="primary" htmlType="submit">提交</Button>
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
          columns={[
            { title: '时间', dataIndex: 'createTime' },
            { title: '类别', dataIndex: 'categoryText' },
            { title: '标题', dataIndex: 'title' },
            { title: '内容', dataIndex: 'content' },
            { title: '状态', dataIndex: 'statusText' },
            { title: '回复', dataIndex: 'replyContent' },
          ]}
        />
      </section>
        ) },
      ]} />
    </section>
  )
}
