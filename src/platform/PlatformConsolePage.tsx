import { ArrowLeftOutlined, BarChartOutlined, BankOutlined, CommentOutlined, CrownOutlined, DollarOutlined, SettingOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, InputNumber, Modal, Pagination, Result, Segmented, Select, Skeleton, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformApi } from '../api/platform'
import type { PlatformCampus, PlatformFeedback, PlatformOrder, PlatformOrganization, PlatformOverview, PlatformPage, PlatformPlan, PlatformSettlement, PlatformUser } from './platform-model'
import './platform.css'

type DataTab = 'overview' | 'users' | 'organizations' | 'orders' | 'feedbacks' | 'settlements'
type Workspace = 'data' | 'plans' | 'features'
const money = (value: unknown) => `¥${Number(value || 0).toFixed(2)}`
const dateText = (value?: string) => value ? value.replace('T', ' ').slice(0, 16) : '—'

export function PlatformConsolePage() {
  const navigate = useNavigate()
  const [ticket, setTicket] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [authError, setAuthError] = useState('')
  const [workspace, setWorkspace] = useState<Workspace>('data')
  const [tab, setTab] = useState<DataTab>('overview')

  function authenticate() {
    setAuthError('')
    platformApi.ticket().then((result) => { setTicket(result.ticket); setExpiresAt(result.expiresAt) }).catch((reason) => setAuthError(reason.message || '当前账号没有平台运营权限'))
  }
  useEffect(authenticate, [])

  if (authError) return <div className="platform-auth-state"><Result status="403" title="无法进入平台运营中心" subTitle={authError} extra={<><Button type="primary" onClick={authenticate}>重新验证</Button><Button onClick={() => navigate('/home')}>返回工作台</Button></>} /></div>
  if (!ticket) return <div className="platform-auth-state"><Skeleton active paragraph={{ rows: 8 }} /></div>

  return (
    <div className="platform-page">
      <aside className="platform-sidebar">
        <div className="platform-brand"><span><BarChartOutlined /></span><div><strong>平台运营中心</strong><small>OPERATION CONSOLE</small></div></div>
        <Button className="platform-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/home')}>返回机构工作台</Button>
        <p>工作空间</p>
        <button type="button" className={workspace === 'data' ? 'active' : ''} onClick={() => setWorkspace('data')}><BarChartOutlined />运营数据</button>
        <button type="button" className={workspace === 'plans' ? 'active' : ''} onClick={() => setWorkspace('plans')}><CrownOutlined />套餐配置</button>
        <button type="button" className={workspace === 'features' ? 'active' : ''} onClick={() => setWorkspace('features')}><SettingOutlined />功能配置</button>
        <div className="platform-ticket-note">安全会话<br /><span>有效至 {dateText(expiresAt)}</span></div>
      </aside>
      <main className="platform-main">
        <header><div><span>PLATFORM ADMIN</span><h1>{workspace === 'data' ? '运营数据' : workspace === 'plans' ? '会员套餐配置' : '平台功能配置'}</h1></div></header>
        <div className="platform-content">
          {workspace === 'data' ? <DataWorkspace ticket={ticket} tab={tab} setTab={setTab} /> : null}
          {workspace === 'plans' ? <PlansWorkspace ticket={ticket} /> : null}
          {workspace === 'features' ? <FeaturesWorkspace ticket={ticket} /> : null}
        </div>
      </main>
    </div>
  )
}

function DataWorkspace(props: { ticket: string; tab: DataTab; setTab: (tab: DataTab) => void }) {
  const options = [
    { value: 'overview', label: '数据概览' }, { value: 'users', label: '用户列表' }, { value: 'organizations', label: '机构列表' },
    { value: 'orders', label: '订单列表' }, { value: 'feedbacks', label: '问题反馈' }, { value: 'settlements', label: '营销发放' },
  ]
  return <><Segmented className="platform-tabs" block value={props.tab} options={options} onChange={(value) => props.setTab(value as DataTab)} />{props.tab === 'overview' ? <OverviewPanel ticket={props.ticket} /> : null}{props.tab === 'users' ? <UsersPanel ticket={props.ticket} /> : null}{props.tab === 'organizations' ? <OrganizationsPanel ticket={props.ticket} /> : null}{props.tab === 'orders' ? <OrdersPanel ticket={props.ticket} /> : null}{props.tab === 'feedbacks' ? <FeedbackPanel ticket={props.ticket} /> : null}{props.tab === 'settlements' ? <SettlementsPanel ticket={props.ticket} /> : null}</>
}

function OverviewPanel({ ticket }: { ticket: string }) {
  const [data, setData] = useState<PlatformOverview | null>(null)
  useEffect(() => { platformApi.overview(ticket).then(setData) }, [ticket])
  if (!data) return <PanelLoading />
  const cards = [
    { icon: <UserOutlined />, label: '用户总数', value: data.totalUsers, note: `今日新增 ${data.todayNewUsers}`, tone: 'blue' },
    { icon: <TeamOutlined />, label: '机构负责人', value: data.organizationOwners, note: `试用中 ${data.trialUsers}`, tone: 'violet' },
    { icon: <BankOutlined />, label: '机构 / 校区', value: `${data.organizationCount} / ${data.campusCount}`, note: '平台业务规模', tone: 'cyan' },
    { icon: <CrownOutlined />, label: '正式会员', value: data.paidUsers, note: `已过期 ${data.expiredUsers}`, tone: 'green' },
    { icon: <DollarOutlined />, label: '会员收入', value: money(data.recordedMembershipRevenue), note: `${data.membershipOrderCount} 笔订单`, tone: 'orange' },
  ]
  return <div className="platform-metrics">{cards.map((card) => <article className={`platform-metric ${card.tone}`} key={card.label}><span>{card.icon}</span><small>{card.label}</small><strong>{card.value}</strong><p>{card.note}</p></article>)}</div>
}

function UsersPanel({ ticket }: { ticket: string }) {
  const columns: ColumnsType<PlatformUser> = [
    { title: '用户', render: (_, row) => <div className="platform-name-cell"><b>{row.nickname || '未命名用户'}</b><span>{row.phone || '未绑定手机'}</span></div> },
    { title: '会员', dataIndex: 'subscriptionStatus', render: (value) => <MembershipTag value={value} /> },
    { title: '机构 / 校区', render: (_, row) => `${row.organizationCount || 0} / ${row.campusCount || 0}` },
    { title: '订单', render: (_, row) => `${row.membershipOrderCount || 0} 笔 · ${money(row.paidAmount)}` },
    { title: '注册时间', dataIndex: 'createTime', render: dateText },
  ]
  return <PagedPanel<PlatformUser> ticket={ticket} placeholder="昵称 / 手机 / 机构" filters={[{ value: '', label: '全部会员' }, { value: 'trial', label: '试用中' }, { value: 'active', label: '正式会员' }, { value: 'expired', label: '已过期' }]} fetcher={(page, keyword, status) => platformApi.users(ticket, { page, size: 20, keyword, subscriptionStatus: status })} columns={columns} rowKey="id" />
}

function OrganizationsPanel({ ticket }: { ticket: string }) {
  const columns: ColumnsType<PlatformOrganization> = [
    { title: '机构', render: (_, row) => <div className="platform-name-cell"><b>{row.name || '未命名机构'}</b><span>{row.address || '未填写地址'}</span></div> },
    { title: '状态', render: (_, row) => <Tag color={row.dissolved || row.status === 0 ? 'default' : 'success'}>{row.dissolved ? '已解散' : row.status === 0 ? '已停用' : '正常'}</Tag> },
    { title: '联系人', render: (_, row) => `${row.contactPerson || '—'} · ${row.phone || '—'}` },
    { title: '校区', render: (_, row) => `${row.campuses?.length || 0} 个` },
    { title: '创建时间', dataIndex: 'createTime', render: dateText },
  ]
  return <PagedPanel<PlatformOrganization> ticket={ticket} placeholder="机构 / 联系人 / 电话" filters={[{ value: '', label: '全部状态' }, { value: 'normal', label: '正常' }, { value: 'dissolved', label: '已解散' }]} fetcher={(page, keyword, status) => platformApi.organizations(ticket, { page, size: 20, keyword, organizationStatus: status })} columns={columns} rowKey="id" expandable={{ expandedRowRender: (row: PlatformOrganization) => <div className="platform-campus-list">{row.campuses?.length ? row.campuses.map((campus: PlatformCampus) => <div key={campus.id}><b>{campus.name || '未命名校区'}</b><span>{campus.contactPerson || '—'} · {campus.contactPhone || '—'} · {campus.address || '未填写地址'}</span></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无校区" />}</div> }} />
}

function OrdersPanel({ ticket }: { ticket: string }) {
  const columns: ColumnsType<PlatformOrder> = [
    { title: '订单 / 套餐', render: (_, row) => <div className="platform-name-cell"><b>{row.planName || '会员服务'}</b><span>{row.orderNo || '未生成订单号'}</span></div> },
    { title: '用户', render: (_, row) => `${row.userName || '用户已删除'} · ${row.userPhone || '—'}` },
    { title: '金额', dataIndex: 'amount', render: money },
    { title: '状态', dataIndex: 'payStatus', render: (value) => <Tag color={value === 1 ? 'success' : value === 0 ? 'warning' : 'default'}>{value === 1 ? '已支付' : value === 0 ? '待支付' : '已关闭'}</Tag> },
    { title: '下单时间', dataIndex: 'createTime', render: dateText },
    { title: '到期日', dataIndex: 'accessExpireDate', render: (value) => value || '—' },
  ]
  return <PagedPanel<PlatformOrder> ticket={ticket} placeholder="订单号 / 用户 / 手机" filters={[{ value: '', label: '全部订单' }, { value: 'paid', label: '已支付' }, { value: 'pending', label: '待支付' }]} fetcher={(page, keyword, status) => platformApi.orders(ticket, { page, size: 20, keyword, payStatus: status })} columns={columns} rowKey="id" />
}

function PagedPanel<T extends object>(props: { ticket: string; placeholder: string; filters: Array<{ value: string; label: string }>; fetcher: (page: number, keyword: string, status: string) => Promise<PlatformPage<T>>; columns: ColumnsType<T>; rowKey: string; expandable?: object }) {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PlatformPage<T>>({ total: 0, current: 1, size: 20, pages: 0, records: [] })
  const [loading, setLoading] = useState(false)
  useEffect(() => { setLoading(true); props.fetcher(page, query, status).then(setData).finally(() => setLoading(false)) }, [page, query, status, props.ticket])
  return <section className="platform-panel"><div className="platform-filter"><Input.Search value={keyword} placeholder={props.placeholder} allowClear onChange={(event) => setKeyword(event.target.value)} onSearch={() => { setPage(1); setQuery(keyword.trim()) }} /><Select value={status} options={props.filters} onChange={(value) => { setPage(1); setStatus(value) }} /></div><Table<T> loading={loading} dataSource={data.records} columns={props.columns} rowKey={props.rowKey} pagination={false} expandable={props.expandable} /><Pagination current={data.current || page} pageSize={data.size || 20} total={data.total || 0} showTotal={(total) => `共 ${total} 条`} onChange={setPage} /></section>
}

function MembershipTag({ value }: { value?: string }) {
  return <Tag color={value === 'active' ? 'success' : value === 'expired' ? 'error' : value === 'trial' ? 'processing' : 'default'}>{value === 'active' ? '正式会员' : value === 'expired' ? '已过期' : value === 'trial' ? '试用中' : '未设置'}</Tag>
}

function PanelLoading() { return <section className="platform-panel"><Skeleton active paragraph={{ rows: 8 }} /></section> }

function FeedbackPanel({ ticket }: { ticket: string }) {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PlatformPage<PlatformFeedback>>({ total: 0, current: 1, size: 20, pages: 0, records: [] })
  const [editing, setEditing] = useState<PlatformFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ status: number; resolutionType?: string; replyContent?: string }>()
  function load() { setLoading(true); platformApi.feedbacks(ticket, { page, size: 20, keyword: query, status: status === '' ? undefined : Number(status), source }).then(setData).finally(() => setLoading(false)) }
  useEffect(load, [page, query, status, source, ticket])
  function open(row: PlatformFeedback) {
    setEditing(row)
    form.setFieldsValue({ status: row.status || 0, resolutionType: row.resolutionType || '', replyContent: row.replyContent || '' })
  }
  async function save() {
    if (!editing) return
    const values = await form.validateFields()
    setSaving(true)
    try { await platformApi.updateFeedback(ticket, editing.id, values); message.success('反馈处理状态已更新'); setEditing(null); load() } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }
  const columns: ColumnsType<PlatformFeedback> = [
    { title: '反馈', render: (_, row) => <div className="platform-feedback-cell"><b>{row.title || '未填写标题'}</b><p>{row.content || '未填写内容'}</p><span>{row.sourceText || (row.source === 'parent' ? '学员端' : '机构端')} · {row.categoryText || row.category || '未分类'}</span></div> },
    { title: '用户', render: (_, row) => <div className="platform-name-cell"><b>{row.userName || '匿名用户'}</b><span>{row.userPhone || row.contact || '未填写联系方式'}</span></div> },
    { title: '状态', render: (_, row) => <Tag color={row.status === 3 ? 'success' : row.status === 4 ? 'default' : row.status === 0 ? 'warning' : 'processing'}>{row.statusText || ['待处理', '已受理', '处理中', '已完成', '已关闭'][row.status || 0]}</Tag> },
    { title: '提交时间', dataIndex: 'createTime', render: dateText },
    { title: '操作', width: 90, render: (_, row) => <Button type="link" icon={<CommentOutlined />} onClick={() => open(row)}>处理</Button> },
  ]
  return <section className="platform-panel"><div className="platform-filter platform-filter-feedback"><Input.Search value={keyword} placeholder="用户 / 手机 / 标题 / 内容" allowClear onChange={(event) => setKeyword(event.target.value)} onSearch={() => { setPage(1); setQuery(keyword.trim()) }} /><Select value={status} options={[{ value: '', label: '全部状态' }, { value: '0', label: '待处理' }, { value: '1', label: '已受理' }, { value: '2', label: '处理中' }, { value: '3', label: '已完成' }, { value: '4', label: '已关闭' }]} onChange={(value) => { setPage(1); setStatus(value) }} /><Select value={source} options={[{ value: '', label: '全部来源' }, { value: 'org', label: '机构端' }, { value: 'parent', label: '学员端' }]} onChange={(value) => { setPage(1); setSource(value) }} /></div><Table loading={loading} dataSource={data.records} columns={columns} rowKey="id" pagination={false} /><Pagination current={data.current || page} pageSize={data.size || 20} total={data.total || 0} showTotal={(total) => `共 ${total} 条`} onChange={setPage} /><Modal open={Boolean(editing)} title="处理问题反馈" okText="保存处理结果" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setEditing(null)} width={620}><div className="platform-feedback-preview"><strong>{editing?.title || '未填写标题'}</strong><p>{editing?.content}</p><span>{editing?.userName || '匿名用户'} · {editing?.userPhone || editing?.contact || '未填写联系方式'}</span></div><Form form={form} layout="vertical"><Form.Item name="status" label="处理状态" rules={[{ required: true }]}><Select options={[{ value: 0, label: '待处理' }, { value: 1, label: '已受理' }, { value: 2, label: '处理中' }, { value: 3, label: '已完成' }, { value: 4, label: '已关闭' }]} /></Form.Item><Form.Item name="resolutionType" label="处理结论"><Select allowClear options={[{ value: 'solved', label: '已解决' }, { value: 'adopted', label: '已采纳' }, { value: 'answered', label: '已答复' }, { value: 'deferred', label: '暂不处理' }, { value: 'duplicate', label: '重复反馈' }, { value: 'unreproduced', label: '无法复现' }]} /></Form.Item><Form.Item name="replyContent" label="回复内容"><Input.TextArea rows={5} maxLength={1000} showCount /></Form.Item></Form></Modal></section>
}

function SettlementsPanel({ ticket }: { ticket: string }) {
  const [rows, setRows] = useState<PlatformSettlement[]>([])
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState<number | null>(null)
  function load() { setLoading(true); platformApi.settlements(ticket).then(setRows).finally(() => setLoading(false)) }
  useEffect(load, [ticket])
  function payout(row: PlatformSettlement) {
    Modal.confirm({ title: `向“${row.organizationName || '机构'}”发放结算？`, content: `待发放 ${money(row.pendingCredit)}，待扣除 ${money(row.pendingDeduction)}，本次净额 ${money(row.pendingNet)}。`, okText: '确认发放', cancelText: '取消', onOk: async () => { setPaying(row.orgId); try { await platformApi.payout(ticket, row.orgId); message.success('营销结算已发放'); load() } finally { setPaying(null) } } })
  }
  const columns: ColumnsType<PlatformSettlement> = [
    { title: '机构', dataIndex: 'organizationName', render: (value) => value || '未命名机构' },
    { title: '待发放', dataIndex: 'pendingCredit', render: money },
    { title: '待扣除', dataIndex: 'pendingDeduction', render: money },
    { title: '本次净额', dataIndex: 'pendingNet', render: (value) => <b className={Number(value || 0) > 0 ? 'platform-money-positive' : ''}>{money(value)}</b> },
    { title: '操作', width: 110, render: (_, row) => <Button type="primary" loading={paying === row.orgId} disabled={Number(row.pendingNet || 0) <= 0} onClick={() => payout(row)}>发放</Button> },
  ]
  return <section className="platform-panel"><Table loading={loading} dataSource={rows} columns={columns} rowKey="orgId" pagination={false} locale={{ emptyText: <Empty description="暂无待发放机构" /> }} /></section>
}

function PlansWorkspace({ ticket }: { ticket: string }) {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PlatformPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  function load() { setLoading(true); platformApi.plans(ticket).then(setPlans).finally(() => setLoading(false)) }
  useEffect(load, [ticket])
  function open(plan: PlatformPlan) { setEditing(plan); form.setFieldsValue({ ...plan, priceOneYear: Number(plan.priceOneYear || 0), priceTwoYear: Number(plan.priceTwoYear || 0), priceThreeYear: Number(plan.priceThreeYear || 0), addon40Price: Number(plan.addon40Price || 0), addon80Price: Number(plan.addon80Price || 0) }) }
  async function save() { if (!editing) return; const values = await form.validateFields(); setSaving(true); try { await platformApi.updatePlan(ticket, editing.id, values); message.success('套餐配置已保存'); setEditing(null); load() } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) } }
  if (loading) return <PanelLoading />
  return <><div className="platform-plan-grid">{plans.map((plan) => <article className={plan.highlighted ? 'platform-plan highlighted' : 'platform-plan'} key={plan.id}><header><span>{plan.tag || (plan.enabled ? '已上架' : '已下架')}</span><Switch size="small" checked={plan.enabled} disabled /></header><h2>{plan.planName}</h2><p>{plan.description || '会员服务套餐'}</p><strong>{money(plan.priceOneYear)}<small> / 年</small></strong><div><span>{plan.organizationLimit || 0} 个机构</span><span>{plan.campusLimit || 0} 个校区</span><span>每校区 {plan.studentLimitPerCampus || 0} 名学员</span></div><Button type={plan.highlighted ? 'primary' : 'default'} onClick={() => open(plan)}>编辑套餐</Button></article>)}</div><Modal open={Boolean(editing)} title={`编辑${editing?.planName || '套餐'}`} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setEditing(null)} width={760}><Form form={form} layout="vertical"><div className="platform-plan-form-grid"><Form.Item name="planName" label="套餐名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="tag" label="角标"><Input placeholder="例如：主推" /></Form.Item></div><Form.Item name="description" label="简介"><Input.TextArea rows={2} maxLength={200} showCount /></Form.Item><Form.Item name="benefitText" label="权益说明"><Input.TextArea rows={3} maxLength={300} showCount /></Form.Item><div className="platform-plan-form-grid three"><MoneyField name="priceOneYear" label="1年价格" /><MoneyField name="priceTwoYear" label="2年价格" /><MoneyField name="priceThreeYear" label="3年价格" /><NumberField name="organizationLimit" label="机构数量" /><NumberField name="campusLimit" label="校区数量" /><NumberField name="studentLimitPerCampus" label="每校区学员" /><MoneyField name="addon40Price" label="40人扩容年价" /><MoneyField name="addon80Price" label="80人扩容年价" /><NumberField name="sortOrder" label="排序" /></div><div className="platform-switch-row"><Form.Item name="highlighted" label="设为主推" valuePropName="checked"><Switch /></Form.Item><Form.Item name="enabled" label="购买页上架" valuePropName="checked"><Switch /></Form.Item></div></Form></Modal></>
}

function MoneyField(props: { name: string; label: string }) { return <Form.Item name={props.name} label={props.label} rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} /></Form.Item> }
function NumberField(props: { name: string; label: string }) { return <Form.Item name={props.name} label={props.label} rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item> }

function FeaturesWorkspace({ ticket }: { ticket: string }) {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { platformApi.features(ticket).then((data) => setEnabled(data.marketingEnabled !== false)).finally(() => setLoading(false)) }, [ticket])
  async function change(value: boolean) { setSaving(true); try { const result = await platformApi.setMarketing(ticket, value); setEnabled(result.marketingEnabled !== false); message.success(value ? '营销中心已开放' : '营销中心已关闭') } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) } }
  return <div className="platform-feature-grid"><section className="platform-panel platform-feature-card"><div className="platform-feature-icon"><SettingOutlined /></div><div><h2>营销中心</h2><p>统一控制机构端营销活动、报名、推广奖励和结算功能的入口。关闭后已有数据保留，机构暂时不可见。</p></div><Switch checked={enabled} loading={loading || saving} onChange={(value) => void change(value)} checkedChildren="开放" unCheckedChildren="关闭" /></section><section className="platform-panel platform-feature-note"><h3>功能开关说明</h3><p>平台级开关对全部机构生效。变更后 Web 与微信小程序入口会同步刷新；进行中的活动数据和订单不会被删除。</p></section></div>
}
