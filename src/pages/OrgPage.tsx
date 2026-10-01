import { Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tabs, message } from 'antd'
import { BankOutlined, CrownOutlined, FileTextOutlined, PhoneOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { setCampusId, setOrgId } from '../session'
import { EmptyState, PageHead, PhoneCopyButton, copyPlainText, tell, useShell } from './kit'
import './OrgPage.css'

interface Org {
  id: number
  name: string
  phone?: string
  description?: string
  campusAdminManageSalary?: number
}

interface Member {
  id: number
  phone?: string
  nickname?: string
  displayName?: string
}

function orgPhone(value?: string) {
  return String(value || '').replace(/\D+/g, '').slice(0, 11)
}

function orgProfileProblem(values: { name?: string; description?: string }, phone: string, org: Org | null) {
  const name = String(values.name || '').trim()
  const description = String(values.description || '').trim()
  if (!name) return '请输入机构名称'
  if (!phone) return '联系电话缺失'
  if (Array.from(name).length > 12) return '机构名称最多12字'
  if (Array.from(description).length > 50) return '机构描述最多50字'
  if (!/^1[3-9]\d{9}$/.test(phone)) return '请输入正确的手机号'
  if (org && name === String(org.name || '').trim() && description === String(org.description || '').trim() && phone === orgPhone(org.phone)) return 'unchanged'
  return ''
}

function OrgSaveButton(props: { org: Org | null; phone: string; saving: boolean }) {
  const name = Form.useWatch('name')
  const description = Form.useWatch('description')
  const blocked = orgProfileProblem({ name, description }, props.phone, props.org)
  return <Button type="primary" htmlType="submit" disabled={!!blocked || props.saving}>{props.saving ? '保存中...' : '保存机构'}</Button>
}

function collaboratorSame(values: { nickname?: string; phone?: string }, member: Member) {
  return String(values.nickname || '').trim() === String(member.displayName || member.nickname || '').trim()
    && orgPhone(values.phone) === orgPhone(member.phone)
}

function CollaboratorSubmitButton(props: {
  label: string
  savingLabel: string
  saving: boolean
  problem: (values: { nickname?: string; phone?: string }) => string
  original?: Member
}) {
  const nickname = Form.useWatch('nickname') as string | undefined
  const phone = Form.useWatch('phone') as string | undefined
  const values = { nickname, phone }
  const blocked = props.problem(values) || (props.original && collaboratorSame(values, props.original) ? 'unchanged' : '')
  return <Button type={props.original ? 'primary' : 'default'} htmlType="submit" disabled={!!blocked || props.saving}>{props.saving ? props.savingLabel : props.label}</Button>
}

export function OrgPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [collaborators, setCollaborators] = useState<Member[]>([])
  const [memberEdit, setMemberEdit] = useState<Member | null>(null)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [dissolveName, setDissolveName] = useState('')
  const [permissionSaving, setPermissionSaving] = useState(false)
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [addForm] = Form.useForm()
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

  async function copyPhone(phone: string) {
    const text = String(phone || '').trim()
    if (!text) {
      message.warning('联系电话缺失')
      return
    }
    if (await copyPlainText(text)) message.success('已复制')
    else Modal.info({ title: '联系电话', content: text, okText: '知道了' })
  }

  async function load() {
    if (!shell.currentOrgId) return
    setOrg(await getJson<Org>(`/organizations/${shell.currentOrgId}`))
    setCollaborators(await getJson<Member[]>('/org-members/collaborators', { orgId: shell.currentOrgId }).catch(() => []))
  }

  async function saveSalaryPermission(checked: boolean) {
    if (!shell.currentOrgId || permissionSaving) return
    const previous = org?.campusAdminManageSalary === 1
    if (checked === previous) return
    setOrg((current) => current ? { ...current, campusAdminManageSalary: checked ? 1 : 0 } : current)
    setPermissionSaving(true)
    try {
      await putJson(`/organizations/${shell.currentOrgId}/permissions`, { campusAdminManageSalary: checked ? 1 : 0 })
      await load()
    } catch (error) {
      setOrg((current) => current ? { ...current, campusAdminManageSalary: previous ? 1 : 0 } : current)
      message.error(tell(error, '保存失败'))
    } finally {
      setPermissionSaving(false)
    }
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '机构加载失败')))
  }, [shell.currentOrgId])

  if (!shell.currentOrgId) {
    return <EmptyState title="还没有机构" text="请先在首页创建机构。" />
  }

  return (
    <section className="org-page">
      <PageHead title="机构管理" extra="维护机构资料、协同管理员和机构级权限。" />
      <Tabs
        className="org-settings-tabs"
        tabBarExtraContent={(
          <Button className="org-membership-entry" icon={<CrownOutlined />} onClick={() => navigate('/membership')}>
            会员续费与升级
          </Button>
        )}
        items={[
        { key: 'basic', label: '基本资料', children: (
      <section className="work-card org-profile-card">
        <div className="org-card-heading">
          <span className="org-card-heading-icon"><BankOutlined /></span>
          <div>
            <h2>机构基本资料</h2>
            <p>维护机构对外显示的名称、联系电话与简介</p>
          </div>
        </div>
        <Form
          className="org-basic-form"
          key={org?.id}
          layout="vertical"
          initialValues={org || undefined}
          onFinish={async (values: Partial<Org>) => {
            if (savingOrg) return
            const phone = accountPhone
            const problem = orgProfileProblem(values, phone, org)
            if (problem === 'unchanged') return
            if (problem) {
              message.warning(problem)
              return
            }
            const name = String(values.name || '').trim()
            const description = String(values.description || '').trim()
            setSavingOrg(true)
            try {
              await putJson(`/organizations/${shell.currentOrgId}`, { name, phone, description })
              message.success('保存成功')
              shell.reload()
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            } finally {
              setSavingOrg(false)
            }
          }}
        >
          <div className="org-profile-grid">
            <Form.Item name="name" label="机构名称" rules={[{ required: true, message: '请输入机构名称' }]}>
              <Input prefix={<BankOutlined />} maxLength={12} placeholder="请输入机构名称（12字内）" showCount />
            </Form.Item>
            <Form.Item label="联系电话" extra="使用当前登录账号的手机号，不支持修改。">
              <div className="org-phone-field">
                <Input prefix={<PhoneOutlined />} value={accountPhone || org?.phone} disabled />
                <PhoneCopyButton onClick={() => copyPhone(accountPhone || org?.phone || '')} />
              </div>
            </Form.Item>
            <Form.Item className="org-description-field" name="description" label="机构描述">
              <Input.TextArea rows={4} maxLength={50} placeholder="请输入机构描述（选填，50字内）" showCount />
            </Form.Item>
          </div>
          <div className="org-form-actions">
            <span><FileTextOutlined /> 修改后将同步展示到机构相关页面</span>
            <OrgSaveButton org={org} phone={accountPhone} saving={savingOrg} />
          </div>
        </Form>
      </section>
        ) },
        { key: 'permission', label: '权限设置', children: (
      <section className="work-card org-permission-card">
        <div className="org-card-heading">
          <span className="org-card-heading-icon"><BankOutlined /></span>
          <div>
            <h2>机构权限</h2>
            <p>控制校区管理员可以使用的机构级能力</p>
          </div>
        </div>
        <div className="org-permission-row">
          <div>
            <strong>校区管理员工资权限</strong>
            <span>允许校区管理员设置并查看本校区员工工资</span>
          </div>
          <Switch
            checked={org?.campusAdminManageSalary === 1}
            loading={permissionSaving}
            disabled={!org || permissionSaving}
            onChange={(checked) => { void saveSalaryPermission(checked) }}
          />
        </div>
      </section>
        ) },
        { key: 'members', label: '协同管理员', children: (
      <section className="work-card">
        {owner ? (
          <Form
            form={addForm}
            layout="inline"
            onFinish={async (values: { phone: string; nickname?: string }) => {
              if (savingMember) return
              const error = collaboratorError(values)
              if (error) {
                message.warning(error)
                return
              }
              setSavingMember(true)
              try {
                await postJson('/org-members/collaborators', { nickname: String(values.nickname || '').trim(), phone: orgPhone(values.phone) })
                message.success('添加成功')
                addForm.resetFields()
                await load()
              } catch (error) {
                message.error(tell(error, '添加失败'))
              } finally {
                setSavingMember(false)
              }
            }}
          >
            <Form.Item name="phone" rules={[{ required: true, message: '请输入手机号' }]}><Input placeholder="手机号" maxLength={11} /></Form.Item>
            <Form.Item name="nickname"><Input placeholder="姓名" maxLength={6} /></Form.Item>
            <CollaboratorSubmitButton label="添加" savingLabel="添加中..." saving={savingMember} problem={collaboratorError} />
          </Form>
        ) : <p>协同管理员不能添加成员。</p>}
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          dataSource={collaborators}
          pagination={false}
          columns={[
            { title: '姓名', render: (_: unknown, row: Member) => row.displayName || row.nickname },
            { title: '手机号', render: (_: unknown, row: Member) => row.phone ? (
              <Space>
                <span>{row.phone}</span>
                <PhoneCopyButton onClick={() => copyPhone(row.phone || '')} />
              </Space>
            ) : '' },
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
        <Modal title="编辑协同管理员" open={!!memberEdit} onCancel={() => setMemberEdit(null)} footer={null} destroyOnHidden>
          {memberEdit ? (
            <Form
              layout="vertical"
              initialValues={{ nickname: memberEdit.displayName || memberEdit.nickname, phone: memberEdit.phone }}
              onFinish={async (values: { nickname: string; phone: string }) => {
                if (savingMember) return
                const error = collaboratorError(values, memberEdit.id)
                if (error) {
                  message.warning(error)
                  return
                }
                if (collaboratorSame(values, memberEdit)) return
                setSavingMember(true)
                try {
                  await putJson(`/org-members/collaborators/${memberEdit.id}`, { nickname: values.nickname.trim(), phone: orgPhone(values.phone) })
                  message.success('保存成功')
                  setMemberEdit(null)
                  await load()
                } catch (error) {
                  message.error(tell(error, '保存失败'))
                } finally {
                  setSavingMember(false)
                }
              }}
            >
              <Form.Item name="nickname" label="姓名" rules={[{ required: true, message: '请输入成员姓名' }]}><Input maxLength={6} /></Form.Item>
              <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}><Input maxLength={11} /></Form.Item>
              <CollaboratorSubmitButton label="保存" savingLabel="保存中..." saving={savingMember} problem={(values) => collaboratorError(values, memberEdit.id)} original={memberEdit} />
            </Form>
          ) : null}
        </Modal>
      </section>
        ) },
        ...(owner ? [{ key: 'danger', label: '解散机构', children: (
      <>
      {owner ? (
        <section className="work-card">
          <h2>解散机构</h2>
          <p>只有机构创建者可以解散。解散后当前机构不再可用，请输入机构名称确认。</p>
          <Button danger onClick={() => { setDissolveName(''); setDissolveOpen(true) }}>解散机构</Button>
          <Modal title="解散机构" open={dissolveOpen} onCancel={() => setDissolveOpen(false)} footer={null} destroyOnHidden>
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
      </>
        ) }] : []),
      ]} />
    </section>
  )
}
