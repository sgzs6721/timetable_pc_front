import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { setCampusId, setOrgId } from '../session'
import { EmptyState, PageHead, tell, useShell } from './kit'

interface Org {
  id: number
  name: string
  phone?: string
  description?: string
  cycleStartDay?: number
  cycleEndDay?: number
  payDay?: number
  campusAdminManageSalary?: number
}

interface Member {
  id: number
  phone?: string
  nickname?: string
  displayName?: string
}

export function OrgPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [collaborators, setCollaborators] = useState<Member[]>([])
  const [memberEdit, setMemberEdit] = useState<Member | null>(null)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [dissolveName, setDissolveName] = useState('')
  const owner = (shell.user?.role || '').toLowerCase() === 'owner' || (shell.user?.id != null && shell.organizations.some((item) => item.id === shell.currentOrgId && item.ownerId === shell.user?.id))
  const accountPhone = String(shell.user?.phone || '').replace(/\D+/g, '').slice(0, 11)

  function collaboratorError(values: { nickname?: string; phone?: string }, currentId?: number) {
    const nickname = String(values.nickname || '').trim()
    const phone = String(values.phone || '').replace(/\D+/g, '').slice(0, 11)
    if (!nickname) return '请输入成员姓名'
    if (Array.from(nickname).length > 6) return '成员姓名最多6字'
    if (!phone) return '请输入手机号'
    if (!/^1[3-9]\d{9}$/.test(phone) && !/^0\d{2,3}-?\d{7,8}(-\d{1,6})?$/.test(phone)) return '请输入正确的手机号'
    if (accountPhone && phone === accountPhone) return '手机号不能与机构管理员重复'
    if (collaborators.some((item) => item.id !== currentId && String(item.phone || '').replace(/\D+/g, '') === phone)) return '该手机号已添加'
    return ''
  }

  async function load() {
    if (!shell.currentOrgId) return
    setOrg(await getJson<Org>(`/organizations/${shell.currentOrgId}`))
    setCollaborators(await getJson<Member[]>('/org-members/collaborators', { orgId: shell.currentOrgId }).catch(() => []))
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '机构加载失败')))
  }, [shell.currentOrgId])

  if (!shell.currentOrgId) {
    return <EmptyState title="还没有机构" text="请先在首页创建机构。" />
  }

  return (
    <section>
      <PageHead title="机构管理" extra="名称、电话、描述、权限和工资周期。">
        <Button onClick={() => navigate('/membership')}>会员续费与升级</Button>
      </PageHead>
      <section className="work-card">
        <Form
          key={org?.id}
          layout="vertical"
          initialValues={org || undefined}
          onFinish={async (values: Partial<Org>) => {
            const name = String(values.name || '').trim()
            const description = String(values.description || '').trim()
            const phone = accountPhone
            if (!name) {
              message.warning('请输入机构名称')
              return
            }
            if (!phone) {
              message.warning('联系电话缺失')
              return
            }
            if (Array.from(name).length > 12) {
              message.warning('机构名称最多12字')
              return
            }
            if (Array.from(description).length > 50) {
              message.warning('机构描述最多50字')
              return
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
              message.warning('请输入正确的手机号')
              return
            }
            try {
              await putJson(`/organizations/${shell.currentOrgId}`, { name, phone, description })
              message.success('保存成功')
              shell.reload()
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="name" label="机构名称" rules={[{ required: true, message: '请输入机构名称' }]}><Input maxLength={12} /></Form.Item>
          <Form.Item label="联系电话" extra="联系电话使用当前登录账号，不能修改。">
            <Input value={accountPhone || org?.phone} disabled />
          </Form.Item>
          <Form.Item name="description" label="机构描述"><Input.TextArea rows={3} maxLength={50} /></Form.Item>
          <Button type="primary" htmlType="submit">保存资料</Button>
        </Form>
      </section>
      <section className="work-card">
        <h2>机构权限</h2>
        <Form
          layout="inline"
          initialValues={{ campusAdminManageSalary: org?.campusAdminManageSalary === 1 }}
          onFinish={async (values: { campusAdminManageSalary: boolean }) => {
            try {
              await putJson(`/organizations/${shell.currentOrgId}/permissions`, { campusAdminManageSalary: values.campusAdminManageSalary ? 1 : 0 })
              message.success('保存成功')
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="campusAdminManageSalary" label="校区管理员可管理本校区工资" valuePropName="checked"><Switch /></Form.Item>
          <Button htmlType="submit">保存权限</Button>
        </Form>
      </section>
      <section className="work-card">
        <h2>机构工资设置</h2>
        <Form
          layout="inline"
          key={`${org?.id || 0}-${org?.cycleStartDay || 16}`}
          initialValues={{ cycleStartDay: org?.cycleStartDay || 16, cycleEndDay: org?.cycleEndDay || 15, payDay: org?.payDay || 5 }}
          onFinish={async (values: { cycleStartDay?: number; cycleEndDay?: number; payDay?: number }) => {
            const days = [values.cycleStartDay, values.cycleEndDay, values.payDay]
            if (days.some((day) => day == null || day < 1 || day > 31)) {
              message.warning('请填写1到31的天数')
              return
            }
            try {
              await putJson(`/organizations/${shell.currentOrgId}/salary-settings`, values)
              message.success('周期已保存')
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="cycleStartDay" label="周期开始日"><InputNumber min={1} max={31} /></Form.Item>
          <Form.Item name="cycleEndDay" label="周期结束日"><InputNumber min={1} max={31} /></Form.Item>
          <Form.Item name="payDay" label="发放日"><InputNumber min={1} max={31} /></Form.Item>
          <Button htmlType="submit">保存</Button>
        </Form>
      </section>
      <section className="work-card">
        <h2>协同管理员</h2>
        {owner ? (
          <Form
            layout="inline"
            onFinish={async (values: { phone: string; nickname?: string }) => {
              const error = collaboratorError(values)
              if (error) {
                message.warning(error)
                return
              }
              try {
                await postJson('/org-members/collaborators', { nickname: String(values.nickname || '').trim(), phone: String(values.phone || '').replace(/\D+/g, '').slice(0, 11) })
                message.success('添加成功')
                await load()
              } catch (error) {
                message.error(tell(error, '添加失败'))
              }
            }}
          >
            <Form.Item name="phone" rules={[{ required: true, message: '请输入手机号' }]}><Input placeholder="手机号" maxLength={11} /></Form.Item>
            <Form.Item name="nickname"><Input placeholder="姓名" maxLength={6} /></Form.Item>
            <Button htmlType="submit">添加</Button>
          </Form>
        ) : <p>协同管理员不能添加成员。</p>}
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          dataSource={collaborators}
          pagination={false}
          columns={[
            { title: '姓名', render: (_: unknown, row: Member) => row.displayName || row.nickname },
            { title: '手机号', dataIndex: 'phone' },
            {
              title: '操作',
              render: (_: unknown, row: Member) => owner ? (
                <Space>
                  <Button type="link" onClick={() => setMemberEdit(row)}>编辑</Button>
                  <Popconfirm title="确认移除" description="移除后该成员将无法继续协同管理当前机构，是否继续？" onConfirm={async () => {
                    try {
                      await delJson(`/org-members/collaborators/${row.id}`, { orgId: shell.currentOrgId })
                      message.success('已移除')
                      await load()
                    } catch (error) {
                      message.error(tell(error, '移除失败'))
                    }
                  }}>
                    <Button danger type="link">移除</Button>
                  </Popconfirm>
                </Space>
              ) : null,
            },
          ]}
        />
        <Modal title="编辑协同管理员" open={!!memberEdit} onCancel={() => setMemberEdit(null)} footer={null} destroyOnClose>
          {memberEdit ? (
            <Form
              layout="vertical"
              initialValues={{ nickname: memberEdit.displayName || memberEdit.nickname, phone: memberEdit.phone }}
              onFinish={async (values: { nickname: string; phone: string }) => {
                const error = collaboratorError(values, memberEdit.id)
                if (error) {
                  message.warning(error)
                  return
                }
                try {
                  await putJson(`/org-members/collaborators/${memberEdit.id}`, { nickname: values.nickname.trim(), phone: String(values.phone || '').replace(/\D+/g, '').slice(0, 11) })
                  message.success('保存成功')
                  setMemberEdit(null)
                  await load()
                } catch (error) {
                  message.error(tell(error, '保存失败'))
                }
              }}
            >
              <Form.Item name="nickname" label="姓名" rules={[{ required: true, message: '请输入成员姓名' }]}><Input maxLength={6} /></Form.Item>
              <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}><Input maxLength={11} /></Form.Item>
              <Button type="primary" htmlType="submit">保存</Button>
            </Form>
          ) : null}
        </Modal>
      </section>
      {owner ? (
        <section className="work-card">
          <h2>解散机构</h2>
          <p>只有机构创建者可以解散。解散后当前机构不再可用，请输入机构名称确认。</p>
          <Button danger onClick={() => { setDissolveName(''); setDissolveOpen(true) }}>解散机构</Button>
          <Modal title="解散机构" open={dissolveOpen} onCancel={() => setDissolveOpen(false)} footer={null} destroyOnClose>
            <p>请输入「{org?.name || ''}」，必须与机构名称完全一致。</p>
            <Input value={dissolveName} onChange={(event) => setDissolveName(event.target.value)} placeholder="机构名称" />
            <Button
              danger
              style={{ marginTop: 12 }}
              disabled={dissolveName.trim() !== String(org?.name || '').trim() || !org?.name}
              onClick={async () => {
                try {
                  await delJson(`/organizations/${shell.currentOrgId}`)
                  message.success('机构已解散')
                  setOrgId(null)
                  setCampusId(null)
                  setDissolveOpen(false)
                  shell.reload()
                  navigate('/home')
                } catch (error) {
                  message.error(tell(error, '解散失败'))
                }
              }}
            >确认解散</Button>
          </Modal>
        </section>
      ) : null}
    </section>
  )
}
