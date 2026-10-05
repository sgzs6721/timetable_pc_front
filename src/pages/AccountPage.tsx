import { BankOutlined, CheckCircleFilled, LockOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Space, Tabs, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateWebPassword } from '../api/auth'
import { getJson, postJson } from '../api/biz'
import { setCampusId, setOrgId } from '../session'
import { PageHead, tell, useShell } from './kit'
import { OrganizationCreateModal, type OrganizationCreateValues } from './organization-create-modal'

interface Affiliation {
  id: number
  name: string
  ownerId?: number
  organizationRole?: string
  campuses?: Array<{ id: number; name?: string; displayName?: string; positionName?: string }>
}

export function AccountPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const user = shell.user
  const [mine, setMine] = useState<Affiliation[]>([])
  const [links, setLinks] = useState<Affiliation[]>([])
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [accountTab, setAccountTab] = useState('security')

  const loadOrganizations = useCallback(async () => {
    const [ownedRows, linkedRows] = await Promise.all([
      getJson<Affiliation[]>('/organizations/list').catch(() => []),
      getJson<Affiliation[]>('/organizations/affiliations').catch(() => []),
    ])
    setMine(ownedRows)
    setLinks(linkedRows)
  }, [])

  useEffect(() => {
    void loadOrganizations()
  }, [loadOrganizations])

  const organizations = useMemo(() => {
    const rows = new Map<number, Affiliation>()
    mine.forEach((item) => rows.set(item.id, item))
    links.forEach((item) => rows.set(item.id, { ...rows.get(item.id), ...item }))
    return Array.from(rows.values()).sort((left, right) => {
      const leftOwned = isOwnedOrganization(left, user?.id)
      const rightOwned = isOwnedOrganization(right, user?.id)
      if (leftOwned !== rightOwned) return leftOwned ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }, [links, mine, user?.id])

  async function createOrganization(values: OrganizationCreateValues) {
    const phone = String(user?.phone || '').trim()
    if (!phone) throw new Error('当前账号尚未绑定手机号，不能创建机构')
    const created = await postJson<{ id?: number }>('/organizations', {
      name: String(values.name || '').trim(),
      phone,
      description: String(values.description || '').trim(),
      campusAdminManageSalary: values.campusAdminManageSalary ? 1 : 0,
    })
    if (!created?.id) throw new Error('机构创建成功，但未返回机构编号，请刷新后重试')

    // 创建接口会将新机构设为当前机构，同步本地会话以便后续添加协同管理员。
    setOrgId(created.id)
    setCampusId(null)
    let collaboratorError = ''
    try {
      for (const item of values.collaborators || []) {
        await postJson('/org-members/collaborators', item)
      }
    } catch (reason) {
      collaboratorError = reason instanceof Error ? reason.message : '部分协同管理员添加失败'
    }
    setCreatingOrg(false)
    if (collaboratorError) message.warning(`机构已创建；${collaboratorError}`)
    else message.success('机构已创建')
    await loadOrganizations()
    shell.reload()
  }

  return (
    <section className="account-page">
      <PageHead title="账号设置" extra="管理 Web 登录安全与机构权限。" />

      <section className="work-card account-management-card">
        <Tabs
          className="account-management-tabs"
          activeKey={accountTab}
          onChange={setAccountTab}
          tabBarExtraContent={accountTab === 'organizations' ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingOrg(true)}>创建机构</Button>
          ) : null}
          items={[
            {
              key: 'security',
              label: <span className="account-tab-label"><SafetyCertificateOutlined />账户与安全</span>,
              children: (
                <div className="account-tab-panel">
                  <header className="account-card-heading">
                    <span className="account-card-icon is-green"><SafetyCertificateOutlined /></span>
                    <div className="account-card-heading-copy">
                      <h2>Web 登录安全</h2>
                      <p>集中管理 Web 端登录密码与找回流程</p>
                    </div>
                    <span className={`account-password-state${user?.webPasswordSet ? ' is-set' : ''}`}>
                      {user?.webPasswordSet ? <CheckCircleFilled /> : <LockOutlined />}
                      {user?.webPasswordSet ? '密码已设置' : '密码未设置'}
                    </span>
                  </header>

                  <div className="account-security-layout">
                    <aside className="account-login-summary">
                      <span className="account-login-summary-icon"><UserOutlined /></span>
                      <small>Web 端登录账号</small>
                      <strong>{user?.phone || '尚未绑定手机号'}</strong>
                      <p>手机号作为登录账号使用。如需修改绑定手机号，请在微信小程序内完成。</p>
                    </aside>
                    <div className="account-password-panel">
                      <PasswordForm phone={user?.phone} alreadySet={!!user?.webPasswordSet} onSaved={shell.reload} />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'organizations',
              label: <span className="account-tab-label"><BankOutlined />机构与权限 <em>{organizations.length}</em></span>,
              children: (
                <div className="account-tab-panel">
                  {organizations.length ? (
                    <div className="account-org-list" role="list">
                      {organizations.map((row) => {
                        const owned = isOwnedOrganization(row, user?.id)
                        const campuses = row.campuses || []
                        return (
                          <article key={row.id} className="account-org-item" role="listitem">
                            <header className="account-org-item-head">
                              <span className="account-org-mark"><BankOutlined /></span>
                              <div className="account-org-identity">
                                <strong>{row.name || '未命名机构'}</strong>
                                <div className="account-org-badges">
                                  <span className={owned ? 'is-owned' : 'is-linked'}>{owned ? '我的机构' : '关联机构'}</span>
                                </div>
                              </div>
                            </header>
                            <div className="account-org-details">
                              <div>
                                <small>我的身份</small>
                                <strong>{row.organizationRole || (owned ? '机构负责人' : '机构成员')}</strong>
                              </div>
                              <div>
                                <small>可访问校区</small>
                                {campuses.length ? (
                                  <div className="account-campus-tags">
                                    {campuses.map((item) => (
                                      <span key={item.id}>
                                        {item.displayName || item.name || '未命名校区'}
                                        {item.positionName ? <small>{item.positionName}</small> : null}
                                      </span>
                                    ))}
                                  </div>
                                ) : <span className="account-empty-value">暂未分配校区</span>}
                              </div>
                            </div>
                            <footer className="account-org-item-summary">
                              {campuses.length ? `可访问 ${campuses.length} 个校区` : '暂无可访问校区'}
                            </footer>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="account-org-empty">
                      <span><BankOutlined /></span>
                      <h3>暂时还没有关联机构</h3>
                      <p>创建机构后，你可以继续添加校区和协同管理员。</p>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingOrg(true)}>创建第一个机构</Button>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>

      <OrganizationCreateModal
        open={creatingOrg}
        phone={user?.phone}
        onClose={() => setCreatingOrg(false)}
        onSubmit={createOrganization}
        onMembership={() => navigate('/membership')}
      />
    </section>
  )
}

function isOwnedOrganization(row: Affiliation, userId?: number): boolean {
  return Number(userId || 0) > 0 && Number(row.ownerId || 0) === Number(userId)
}

function PasswordForm(props: { phone?: string; alreadySet: boolean; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [resetting, setResetting] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <>
      <div className="account-password-panel-title">
        <h3>{resetting ? '重置 Web 端密码' : props.alreadySet ? '修改 Web 端密码' : '设置 Web 端密码'}</h3>
        <p>建议定期更新密码，并避免与其他平台使用相同密码。</p>
      </div>
      {!props.phone ? (
        <div className="account-password-unavailable">请先在微信小程序内绑定手机号，再设置 Web 端登录密码。</div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          className="account-password-form"
          onFinish={async (values: { oldPassword?: string; newPassword?: string; confirm?: string }) => {
            const next = String(values.newPassword || '').trim()
            if (next.length < 8 || next.length > 32 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
              message.warning('密码需为8到32位，并包含字母和数字')
              return
            }
            if (next !== String(values.confirm || '').trim()) {
              message.warning('两次输入的密码不一致')
              return
            }
            if (next === props.phone?.trim()) {
              message.warning('密码不能与手机号相同')
              return
            }
            if (props.alreadySet && !resetting && !String(values.oldPassword || '').trim()) {
              message.warning('请输入原密码')
              return
            }
            try {
              setSaving(true)
              await updateWebPassword({
                oldPassword: props.alreadySet && !resetting ? values.oldPassword : undefined,
                newPassword: next,
                reset: resetting,
              })
              message.success(resetting ? 'Web 端密码已重置' : 'Web 端密码已保存')
              setResetting(false)
              form.resetFields()
              props.onSaved()
            } catch (error) {
              message.error(tell(error, '密码保存失败'))
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="account-security-note"><LockOutlined /><span>密码需为 8–32 位，并同时包含字母和数字。</span></div>
          {props.alreadySet && !resetting ? (
            <Form.Item
              className="is-wide"
              name="oldPassword"
              label={(
                <span className="account-password-label-row">
                  <span>原密码</span>
                  <Button
                    type="link"
                    htmlType="button"
                    disabled={saving}
                    onClick={() => {
                      Modal.confirm({
                        title: '重置 Web 端登录密码',
                        content: '你已登录，可以直接设置新密码。原密码会立即失效。',
                        okText: '继续重置',
                        cancelText: '取消',
                        onOk: () => {
                          form.resetFields()
                          setResetting(true)
                        },
                      })
                    }}
                  >忘记原密码</Button>
                </span>
              )}
            >
              <Input.Password placeholder="请输入原密码" />
            </Form.Item>
          ) : null}
          {resetting ? <p className="account-reset-note">已进入重置模式。设置新密码后，原密码会立即失效。</p> : null}
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}><Input.Password /></Form.Item>
          <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入新密码' }]}><Input.Password /></Form.Item>
          <Space className="account-security-actions">
            <Button type="primary" htmlType="submit" loading={saving}>{saving ? '保存中' : resetting ? '重置密码' : props.alreadySet ? '修改密码' : '设置密码'}</Button>
            {resetting ? <Button htmlType="button" disabled={saving} onClick={() => { form.resetFields(); setResetting(false) }}>返回修改密码</Button> : null}
          </Space>
        </Form>
      )}
    </>
  )
}
