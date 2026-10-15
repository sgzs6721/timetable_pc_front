import { Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, message } from 'antd'
import { BankOutlined, CrownOutlined, DollarOutlined, FileTextOutlined, PhoneOutlined, SafetyCertificateOutlined, TeamOutlined, WarningOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { setCampusId, setOrgId } from '../session'
import { EmptyState, PageHead, PhoneCopyButton, copyPlainText, tell, useShell } from './kit'

interface Org {
  id: number
  name: string
  ownerId?: number
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

interface OrganizationProfitSharing {
  orgId: number
  configured: boolean
  merchantIdMasked?: string
  merchantName?: string
  status: 'UNCONFIGURED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED'
  rate?: number
  enabled: boolean
  errorMessage?: string
  verifiedAt?: string
}

const PROFIT_SHARING_STATUS: Record<OrganizationProfitSharing['status'], string> = {
  UNCONFIGURED: '未配置',
  PENDING: '待平台验证',
  VERIFIED: '已验证',
  FAILED: '验证失败',
  DISABLED: '已停用',
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
  const [profitSharing, setProfitSharing] = useState<OrganizationProfitSharing | null>(null)
  const [profitSharingLoading, setProfitSharingLoading] = useState(false)
  const [profitSharingSaving, setProfitSharingSaving] = useState(false)
  const [profitSharingMerchantId, setProfitSharingMerchantId] = useState('')
  const [profitSharingMerchantName, setProfitSharingMerchantName] = useState('')
  const [profitSharingEnabled, setProfitSharingEnabled] = useState(true)
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [addForm] = Form.useForm()
  const currentOrgSummary = shell.organizations.find((item) => item.id === shell.currentOrgId)
  const currentUserId = Number(shell.user?.id || 0)
  const currentOwnerId = Number(org?.ownerId || currentOrgSummary?.ownerId || 0)
  const owner = currentOwnerId > 0
    ? currentUserId > 0 && currentUserId === currentOwnerId
    : (shell.user?.role || '').toLowerCase() === 'owner'
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
    setProfitSharingLoading(true)
    try {
      const sharing = await getJson<OrganizationProfitSharing>(`/organizations/${shell.currentOrgId}/profit-sharing`)
      setProfitSharing(sharing)
      setProfitSharingMerchantId('')
      setProfitSharingMerchantName(sharing.merchantName || '')
      setProfitSharingEnabled(sharing.configured ? sharing.enabled !== false : true)
    } catch (error) {
      setProfitSharing(null)
      message.error(tell(error, '分账配置加载失败'))
    } finally {
      setProfitSharingLoading(false)
    }
  }

  function profitSharingPayload() {
    const merchantId = profitSharingMerchantId.replace(/\D+/g, '').slice(0, 32)
    const merchantName = profitSharingMerchantName.trim()
    if (!profitSharing?.configured && !/^\d{8,32}$/.test(merchantId)) return { error: '请输入正确的微信支付商户号' }
    if (!merchantName) return { error: '请输入商户法定全称' }
    if (Array.from(merchantName).length > 100) return { error: '商户法定全称不能超过100个字' }
    return { payload: { merchantId: merchantId || undefined, merchantName, enabled: profitSharingEnabled } }
  }

  async function persistProfitSharing(successTitle: string) {
    if (!shell.currentOrgId || profitSharingSaving) return
    const result = profitSharingPayload()
    if ('error' in result) {
      message.warning(result.error)
      return
    }
    setProfitSharingSaving(true)
    try {
      const sharing = await putJson<OrganizationProfitSharing>(`/organizations/${shell.currentOrgId}/profit-sharing`, result.payload)
      message.success(sharing.status === 'VERIFIED' ? successTitle : '资料已保存，待验证')
      setProfitSharing(sharing)
      setProfitSharingMerchantId('')
      setProfitSharingMerchantName(sharing.merchantName || '')
      setProfitSharingEnabled(sharing.configured ? sharing.enabled !== false : true)
    } catch (error) {
      message.error(tell(error, '保存失败'))
    } finally {
      setProfitSharingSaving(false)
    }
  }

  async function disableProfitSharing() {
    if (!shell.currentOrgId || profitSharingSaving) return
    setProfitSharingSaving(true)
    try {
      const sharing = await putJson<OrganizationProfitSharing>(`/organizations/${shell.currentOrgId}/profit-sharing`, { enabled: false })
      setProfitSharing(sharing)
      setProfitSharingEnabled(false)
      message.success('已停用')
    } catch (error) {
      message.error(tell(error, '停用失败'))
    } finally {
      setProfitSharingSaving(false)
    }
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
      <div className="org-settings-grid">
      <div className="org-settings-column org-settings-column--left">
      <section className="work-card org-block-card org-profile-card">
        <div className="org-card-heading">
          <span className="org-card-heading-icon"><BankOutlined /></span>
          <div>
            <h2>机构基本资料</h2>
            <p>维护机构对外显示的名称、联系电话与简介</p>
          </div>
          <Button className="org-membership-entry" icon={<CrownOutlined />} onClick={() => navigate('/membership')}>
            会员续费与升级
          </Button>
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
            <Form.Item label="联系电话">
              <div className="org-phone-field">
                <Input prefix={<PhoneOutlined />} value={accountPhone || org?.phone} disabled />
                <PhoneCopyButton onClick={() => copyPhone(accountPhone || org?.phone || '')} />
              </div>
            </Form.Item>
            <Form.Item className="org-description-field" name="description" label="机构描述">
              <Input.TextArea rows={3} maxLength={50} placeholder="请输入机构描述（选填，50字内）" showCount />
            </Form.Item>
          </div>
          <div className="org-form-actions">
            <span><FileTextOutlined /> 修改后将同步展示到机构相关页面</span>
            <OrgSaveButton org={org} phone={accountPhone} saving={savingOrg} />
          </div>
        </Form>
      </section>
      </div>
      <div className="org-settings-column org-settings-column--right">
      <section className={`work-card org-block-card org-collaborators-card ${owner ? '' : 'org-collaborators-card--wide'}`}>
        <div className="org-card-heading">
          <span className="org-card-heading-icon org-card-heading-icon--green"><TeamOutlined /></span>
          <div>
            <h2>协同管理员</h2>
            <p>邀请成员共同维护机构资料与业务设置</p>
          </div>
          <span className="org-card-count">{collaborators.length} 人</span>
        </div>
        <div className="org-collaborators-body">
        {owner ? (
          <Form
            className="org-collaborator-form"
            form={addForm}
            layout="vertical"
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
            <div className="org-collaborator-submit">
              <CollaboratorSubmitButton label="添加" savingLabel="添加中..." saving={savingMember} problem={collaboratorError} />
            </div>
          </Form>
        ) : <p className="org-readonly-note">当前为协同管理员，仅可查看成员列表。</p>}
        <Table
          className="org-collaborator-table"
          size="middle"
          scroll={{ x: 520 }}
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
        </div>
      </section>
      </div>
      <section className="work-card org-block-card org-profit-sharing-card">
        <div className="org-card-heading">
          <span className="org-card-heading-icon org-card-heading-icon--green"><DollarOutlined /></span>
          <div>
            <h2>微信支付分账</h2>
            <p>机构资料选填，不配置不影响正常使用</p>
          </div>
          <span className={`org-profit-sharing-status is-${String(profitSharing?.status || 'UNCONFIGURED').toLowerCase()}`}>
            {profitSharingLoading ? '加载中' : PROFIT_SHARING_STATUS[profitSharing?.status || 'UNCONFIGURED']}
          </span>
        </div>
        <div className="org-profit-sharing-body">
          <p className="org-profit-sharing-notice">验证通过后，仅新产生的营销订单进入分账，历史订单不受影响。</p>
          {profitSharing?.errorMessage ? <p className="org-profit-sharing-error">{profitSharing.errorMessage}</p> : null}
          <div className="org-profit-sharing-fields">
            <label>
              <span>微信支付商户号 <em>选填</em></span>
              <Input
                value={profitSharingMerchantId}
                maxLength={32}
                inputMode="numeric"
                disabled={profitSharingLoading || profitSharingSaving}
                placeholder={profitSharing?.merchantIdMasked ? `当前 ${profitSharing.merchantIdMasked}，不修改可留空` : '请输入机构自己的微信支付商户号'}
                onChange={(event) => setProfitSharingMerchantId(event.target.value.replace(/\D+/g, '').slice(0, 32))}
              />
            </label>
            <label>
              <span>商户法定全称 <em>选填</em></span>
              <Input
                value={profitSharingMerchantName}
                maxLength={100}
                disabled={profitSharingLoading || profitSharingSaving}
                placeholder="必须与微信支付商户信息完全一致"
                onChange={(event) => setProfitSharingMerchantName(event.target.value)}
              />
            </label>
          </div>
          <div className="org-profit-sharing-setting">
            <div><strong>机构分账比例</strong><span>由平台管理员设置，机构端仅展示</span></div>
            <b>{Number(profitSharing?.rate || 30)}%</b>
          </div>
          <div className="org-profit-sharing-setting">
            <div><strong>验证后启用</strong><span>关闭后，新订单不再进入微信分账</span></div>
            <Switch checked={profitSharingEnabled} disabled={profitSharingLoading || profitSharingSaving} onChange={setProfitSharingEnabled} />
          </div>
          <div className="org-profit-sharing-actions">
            <Button disabled={profitSharingLoading} loading={profitSharingSaving} onClick={() => { void persistProfitSharing('商户资料检测通过') }}>检测商户资料</Button>
            {profitSharing?.configured ? <Popconfirm title="停用微信支付分账？" description="停用后，新订单不再进入微信分账。" onConfirm={() => void disableProfitSharing()}><Button danger disabled={profitSharingSaving}>停用分账</Button></Popconfirm> : null}
            <Button type="primary" disabled={profitSharingLoading} loading={profitSharingSaving} onClick={() => { void persistProfitSharing('分账设置已保存') }}>保存分账设置</Button>
          </div>
        </div>
      </section>
      <section className="work-card org-block-card org-permission-card">
        <div className="org-card-heading">
          <span className="org-card-heading-icon org-card-heading-icon--amber"><SafetyCertificateOutlined /></span>
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
      <section className="work-card org-block-card org-danger-card">
        <div className="org-card-heading org-card-heading--danger">
          <span className="org-card-heading-icon org-card-heading-icon--danger"><WarningOutlined /></span>
          <div>
            <h2>解散机构</h2>
            <p>不可恢复的机构级操作</p>
          </div>
        </div>
        <div className="org-danger-body">
          <p>{owner
            ? '解散后当前机构不再可用，请输入机构名称确认。'
            : '只有机构创建者可以解散；当前账号为协同管理员，不能执行此操作。'}</p>
          <Button danger disabled={!owner || !org} onClick={() => { setDissolveName(''); setDissolveOpen(true) }}>解散机构</Button>
        </div>
        <Modal title="解散机构" open={dissolveOpen} onCancel={() => setDissolveOpen(false)} footer={null} destroyOnHidden>
          <p>请输入「{org?.name || ''}」，必须与机构名称完全一致。</p>
          <Input value={dissolveName} onChange={(event) => setDissolveName(event.target.value)} placeholder="机构名称" />
          <Button
            danger
            style={{ marginTop: 12 }}
            disabled={!owner || dissolveName.trim() !== String(org?.name || '').trim() || !org?.name}
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
      </div>
    </section>
  )
}
