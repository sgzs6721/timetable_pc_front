import { Button, Form, Input, Modal, Space, message } from 'antd'
import { BankOutlined, CameraOutlined, CheckCircleFilled, LockOutlined, SafetyCertificateOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateUserInfo, updateWebPassword, uploadAvatar } from '../api/auth'
import { getJson, postJson } from '../api/biz'
import { setCurrentOrganization } from '../api/home'
import { PageHead, tell, useShell } from './kit'
import { setCampusId, setOrgId } from '../session'
import { OrganizationCreateModal, type OrganizationCreateValues } from './organization-create-modal'
import './AccountPage.css'

interface Affiliation {
  id: number
  name: string
  ownerId?: number
  organizationRole?: string
  isCurrent?: number
  campuses?: Array<{ id: number; name: string }>
}

export function AccountPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const user = shell.user
  const [mine, setMine] = useState<Affiliation[]>([])
  const [links, setLinks] = useState<Affiliation[]>([])
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [switchingOrgId, setSwitchingOrgId] = useState<number | null>(null)

  useEffect(() => {
    getJson<Affiliation[]>('/organizations/list').then(setMine).catch(() => setMine([]))
    getJson<Affiliation[]>('/organizations/affiliations').then(setLinks).catch(() => setLinks([]))
  }, [shell.currentOrgId])

  const name = user?.realName || user?.nickname || user?.nickName || '未命名'
  const organizations = useMemo(() => {
    const rows = new Map<number, Affiliation>()
    mine.forEach((item) => rows.set(item.id, item))
    links.forEach((item) => rows.set(item.id, { ...rows.get(item.id), ...item }))
    return Array.from(rows.values()).sort((left, right) => {
      const leftCurrent = Number(left.id) === Number(shell.currentOrgId)
      const rightCurrent = Number(right.id) === Number(shell.currentOrgId)
      if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }, [links, mine, shell.currentOrgId])

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
    await setCurrentOrganization(created.id)
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
    else message.success('机构已创建，已切换到新机构')
    shell.reload()
    navigate('/home')
  }

  return (
    <section className="account-page">
      <PageHead title="个人中心" extra="昵称、头像、当前职位，以及我的机构和关联机构。">
        <Button type="primary" onClick={() => setCreatingOrg(true)}>创建新机构</Button>
      </PageHead>
      <div className="account-primary-grid">
      <section className="work-card account-profile-card">
        <header className="account-card-heading">
          <span className="account-card-icon"><UserOutlined /></span>
          <div><h2>个人资料</h2><p>维护你的公开名称与头像</p></div>
        </header>
        <div className="profile-hero">
          <ProfileAvatar url={user?.avatarUrl} name={name} />
          <div>
            <h2>{name}</h2>
            <p>{user?.phone || '未绑定手机号'}</p>
            <span className="account-position">{[user?.positionCampusName, user?.positionName].filter(Boolean).join(' · ') || '暂无职位信息'}</span>
          </div>
        </div>
        <SpaceProfile user={user} onSaved={shell.reload} />
        <Button className="account-membership-button" onClick={() => navigate('/membership')}>会员续费与升级</Button>
      </section>
      <section className="work-card account-security-card">
        <header className="account-card-heading">
          <span className="account-card-icon is-green"><SafetyCertificateOutlined /></span>
          <div><h2>账户安全</h2><p>设置网页登录密码，保护账户安全</p></div>
        </header>
        <PasswordForm phone={user?.phone} alreadySet={!!user?.webPasswordSet} onSaved={shell.reload} />
      </section>
      </div>
      <div className="account-organizations-heading">
        <div><h2>机构与权限</h2><p>机构、身份与可访问校区统一展示，避免重复</p></div>
      </div>
      <section className="work-card account-org-card account-org-card-unified">
        <header className="account-card-heading is-compact">
          <span className="account-card-icon"><BankOutlined /></span>
          <div><h2>可访问机构 <em>{organizations.length}</em></h2><p>切换后，工作台和校区数据会同步更新</p></div>
        </header>
        <div className="account-org-list">
          {organizations.map((row) => {
            const current = Number(row.id) === Number(shell.currentOrgId)
            const owned = isOwnedOrganization(row, user?.id)
            const campuses = row.campuses || []
            return (
              <article key={row.id} className={`account-org-item${current ? ' is-current' : ''}`}>
                <header className="account-org-item-head">
                  <span className="account-org-mark"><BankOutlined /></span>
                  <div className="account-org-identity">
                    <strong>{row.name || '未命名机构'}</strong>
                    <div className="account-org-badges">
                      <span className={owned ? 'is-owned' : 'is-linked'}>{owned ? '我的机构' : '关联机构'}</span>
                      {current ? <span className="is-current"><CheckCircleFilled /> 当前机构</span> : null}
                    </div>
                  </div>
                </header>
                <div className="account-org-details">
                  <div><small>我的身份</small><strong>{row.organizationRole || (owned ? '机构负责人' : '机构成员')}</strong></div>
                  <div>
                    <small>可访问校区</small>
                    {campuses.length ? <div className="account-campus-tags">{campuses.map((item) => <span key={item.id}>{item.name}</span>)}</div> : <span className="account-empty-value">暂未分配校区</span>}
                  </div>
                </div>
                <footer className="account-org-item-actions">
                  <span>{campuses.length ? `可访问 ${campuses.length} 个校区` : '暂无可访问校区'}</span>
                  {current ? (
                    <Button icon={<CheckCircleFilled />} disabled>正在使用</Button>
                  ) : (
                    <Button
                      type="primary"
                      ghost
                      icon={<SwapOutlined />}
                      loading={switchingOrgId === row.id}
                      disabled={switchingOrgId != null}
                      onClick={async () => {
                        setSwitchingOrgId(row.id)
                        try {
                          await switchOrg(row.id, shell.reload, navigate)
                        } finally {
                          setSwitchingOrgId(null)
                        }
                      }}
                    >切换到此机构</Button>
                  )}
                </footer>
              </article>
            )
          })}
        </div>
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

function ProfileAvatar(props: { url?: string; name: string }) {
  const [broken, setBroken] = useState(false)
  if (!props.url || broken) return <span className="avatar-fallback">{props.name.slice(0, 1) || '我'}</span>
  return <img className="avatar-photo" src={props.url} alt="" onError={() => setBroken(true)} />
}

function SpaceProfile(props: { user: ReturnType<typeof useShell>['user']; onSaved: () => void }) {
  return (
    <div className="account-profile-editor">
      <Form
        layout="vertical"
        className="account-nickname-form"
        initialValues={{ nickname: props.user?.nickname || props.user?.nickName || props.user?.realName }}
        onFinish={async (values: { nickname: string }) => {
          try {
            await updateUserInfo({ nickname: values.nickname, nickName: values.nickname })
            message.success('资料已保存')
            props.onSaved()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          }
        }}
      >
        <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input prefix={<UserOutlined />} placeholder="请输入昵称" /></Form.Item>
        <Button type="primary" htmlType="submit">保存资料</Button>
      </Form>
      <label className="account-avatar-upload">
        <span><CameraOutlined /> 更换头像</span>
        <small>支持常用图片格式</small>
        <input
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            try {
              await uploadAvatar(file)
              message.success('头像已更新')
              props.onSaved()
            } catch (error) {
              message.error(tell(error, '头像上传失败'))
            }
          }}
        />
      </label>
    </div>
  )
}

function PasswordForm(props: { phone?: string; alreadySet: boolean; onSaved: () => void }) {
  const [resetting, setResetting] = useState(false)
  if (!props.phone) return <p>请先绑定手机号后再设置网页登录密码。</p>
  return (
    <Form
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
          await updateWebPassword({
            oldPassword: props.alreadySet && !resetting ? values.oldPassword : undefined,
            newPassword: next,
            reset: resetting || undefined,
          })
          message.success(resetting ? '网页登录密码已重置' : '网页登录密码已保存')
          setResetting(false)
          props.onSaved()
        } catch (error) {
          message.error(tell(error, '密码保存失败'))
        }
      }}
    >
      <div className="account-security-note"><LockOutlined /><span>密码需为 8–32 位，并同时包含字母和数字。</span></div>
      {props.alreadySet && !resetting ? <Form.Item className="is-wide" name="oldPassword" label="原密码"><Input.Password /></Form.Item> : null}
      {resetting ? <p className="account-reset-note">你已登录，可以直接设置新密码。保存后原密码会立即失效。</p> : null}
      <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}><Input.Password /></Form.Item>
      <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入新密码' }]}><Input.Password /></Form.Item>
      <Space className="account-security-actions">
        <Button type="primary" htmlType="submit">{props.alreadySet ? '修改密码' : '设置密码'}</Button>
        {props.alreadySet && !resetting ? (
          <Button
            htmlType="button"
            onClick={() => {
              Modal.confirm({
                title: '重置网页登录密码',
                content: '你已登录，可以直接设置新密码。原密码会立即失效。',
                okText: '继续重置',
                cancelText: '取消',
                onOk: () => setResetting(true),
              })
            }}
          >忘记原密码</Button>
        ) : null}
        {resetting ? <Button htmlType="button" onClick={() => setResetting(false)}>取消重置</Button> : null}
      </Space>
    </Form>
  )
}

async function switchOrg(orgId: number, reload: () => void, navigate: (path: string) => void) {
  try {
    await setCurrentOrganization(orgId)
    setOrgId(orgId)
    setCampusId(null)
    message.success('已切换机构')
    reload()
    navigate('/home')
  } catch (error) {
    message.error(tell(error, '切换失败'))
  }
}
