import { CalendarOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReadOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, Modal, Popconfirm, Tag, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { useParentContext, memberKey } from './ParentLayout'
import type { ParentChild } from './parent-model'

export function ParentChildrenPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { home, reload } = useParentContext()
  const [editing, setEditing] = useState<ParentChild | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  useEffect(() => {
    if (params.get('create') === '1') {
      setEditing(null)
      form.resetFields()
      setParams({}, { replace: true })
    }
  }, [params])

  function openEditor(member?: ParentChild) {
    setEditing(member || null)
    form.setFieldsValue({ name: member?.name || '' })
  }

  async function save() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (!editing) await parentApi.createChild({ name: values.name.trim() })
      else if (editing.source === 'PRIVATE') await parentApi.updateChild(editing.childId!, values.name.trim())
      else await parentApi.updateStudentName(editing.studentId!, values.name.trim())
      message.success(editing ? '成员名称已更新' : '成员已创建')
      setEditing(undefined)
      await reload()
    } catch (reason) {
      if (reason instanceof Error) message.error(reason.message)
    } finally { setSaving(false) }
  }

  async function remove(member: ParentChild) {
    await parentApi.deleteChild(member.childId!)
    message.success('自建成员已删除')
    await reload()
  }

  const canCreate = !home.limitApplies || Number(home.privateChildCount || 0) < Number(home.privateTimetableLimit || 0)
  return (
    <div>
      <div className="parent-page-head"><div><h2>成员列表</h2><p>统一管理自建成员与机构关联学员，数据来源清晰可辨。</p></div><Button type="primary" icon={<PlusOutlined />} disabled={!canCreate} onClick={() => openEditor()}>新建成员</Button></div>
      {home.limitApplies ? <div className="parent-quota-note"><TeamOutlined /> 自建成员 {home.privateChildCount || 0}/{home.privateTimetableLimit || 0}</div> : null}
      <div className="parent-member-grid">
        {(home.children || []).map((member) => (
          <article className="parent-member-card parent-card" key={memberKey(member)}>
            <div className={member.source === 'PRIVATE' ? 'parent-member-avatar private' : 'parent-member-avatar'}>{member.name?.slice(0, 1) || '学'}</div>
            <div className="parent-member-copy"><div><h3>{member.name}</h3><Tag color={member.source === 'PRIVATE' ? 'geekblue' : 'cyan'}>{member.source === 'PRIVATE' ? '自建成员' : '机构关联'}</Tag></div><p>{member.source === 'PRIVATE' ? (member.timetableConfigured ? '课表已配置' : '待配置课表') : [member.orgName, member.campusName].filter(Boolean).join(' · ')}</p></div>
            <div className="parent-member-actions">
              <Button icon={<ReadOutlined />} onClick={() => navigate(`/parent/records?member=${memberKey(member)}`)}>记录</Button>
              <Button icon={<CalendarOutlined />} onClick={() => navigate(`/parent/timetable?member=${memberKey(member)}`)}>课表</Button>
              <Button icon={<EditOutlined />} onClick={() => openEditor(member)}>编辑</Button>
              {member.source === 'PRIVATE' ? <Popconfirm title="删除这名成员？" description="课表与自建课程会一并处理，请谨慎确认。" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => remove(member)}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null}
            </div>
          </article>
        ))}
      </div>
      {!home.children?.length ? <div className="parent-card parent-empty"><Empty description="还没有成员，先新建一位成员吧" /></div> : null}
      <Modal open={editing !== undefined} title={editing ? (editing.source === 'INSTITUTION' ? '修改学员端显示名' : '编辑成员') : '新建成员'} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setEditing(undefined)}>
        <p className="parent-modal-intro">{editing?.source === 'INSTITUTION' ? `机构正式姓名仍是“${editing.officialName || editing.name}”，这里只改你在学员端看到的名字。` : '姓名用于课表、课程和记录归属，创建后仍可修改。'}</p>
        <Form form={form} layout="vertical"><Form.Item name="name" label="成员姓名" rules={[{ required: true, whitespace: true, message: '请输入成员姓名' }, { max: 20, message: '最多20个字' }]}><Input autoFocus placeholder="请输入成员姓名" /></Form.Item></Form>
      </Modal>
    </div>
  )
}
