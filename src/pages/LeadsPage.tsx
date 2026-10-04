import { CheckCircleOutlined, ClockCircleOutlined, PlusOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Input, Select, Space, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getJson } from '../api/biz'
import { canViewLeads } from '../nav'
import { PageHead, PhoneCopyButton, copyPlainText, tell, useShell } from './kit'
import { LeadDetail } from './leads-detail'
import { LeadEditor } from './leads-editor'
import { LEAD_STATUSES, isLeadDue, leadTime, statusInfo, type Lead, type LeadCampus, type LeadPage, type LeadSalesperson, type LeadSummary } from './leads-model'

const PAGE_SIZE = 10
type Filters = { keyword?: string; status?: string; ownerId?: string; due?: string; campusId?: number }
export function LeadsPage() {
  const shell = useShell()
  const org = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  if (!canViewLeads(shell.user, org)) {
    return <div className="work-page leads-page"><Alert type="warning" showIcon message="客源管理只对机构管理员和校区管理员开放。" /></div>
  }
  return <LeadWorkspace key={shell.currentOrgId} userId={shell.user?.id} />
}

function LeadWorkspace({ userId }: { userId?: number }) {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<LeadPage<Lead>>({ records: [], total: 0, current: 1, pages: 0 })
  const [summary, setSummary] = useState<LeadSummary | null>(null)
  const [salespeople, setSalespeople] = useState<LeadSalesperson[]>([])
  const [campuses, setCampuses] = useState<LeadCampus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const sequence = useRef(0)
  const selectedId = Number(params.get('leadId')) || null
  const load = useCallback(async () => {
    const token = ++sequence.current
    setLoading(true); setError('')
    try {
      const [rows, stats, sales, campusRows] = await Promise.all([
        getJson<LeadPage<Lead>>('/leads', { ...filters, page, size: PAGE_SIZE }),
        getJson<LeadSummary>('/leads/summary'),
        getJson<LeadSalesperson[]>('/leads/salespeople', filters.campusId ? { campusId: filters.campusId } : undefined),
        getJson<LeadCampus[]>('/leads/campuses'),
      ])
      if (token !== sequence.current) return
      setCampuses(campusRows)
      setData(rows); setSummary(stats); setSalespeople(sales)
    } catch (reason) { if (token === sequence.current) setError(tell(reason, '客源加载失败')) }
    finally { if (token === sequence.current) setLoading(false) }
  }, [filters, page])
  useEffect(() => { void load(); return () => { sequence.current++ } }, [load])
  function filter(next: Filters) { setFilters(next); setPage(1) }
  function select(id?: number) { setParams(id ? { leadId: String(id) } : {}) }
  const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== '')
  const mySales = salespeople.filter((person) => person.userId === userId)
  const cards = [
    { label: '全部客源', value: summary?.total, icon: <TeamOutlined />, tone: 'blue', filter: {} },
    { label: '新客源', value: summary?.fresh, icon: <UserAddOutlined />, tone: 'cyan', filter: { status: 'NEW' } },
    { label: '到期待跟进', value: summary?.due, icon: <ClockCircleOutlined />, tone: 'orange', filter: { due: 'DUE' } },
    { label: '待分配', value: summary?.unassigned, icon: <UserSwitchOutlined />, tone: 'purple', filter: { ownerId: '0' } },
    { label: '已成交', value: summary?.won, icon: <CheckCircleOutlined />, tone: 'green', filter: { status: 'SOLD' } },
  ]
  return <div className="work-page leads-page">
    <PageHead title="客源管理" extra="按校区查看客源并分配销售负责人。销售人员在小程序跟进本校区客户。" />
    <section className="lead-overview" aria-label="机构客源概况">{cards.map((card) => <button type="button" key={card.label} className={`lead-stat lead-stat--${card.tone}`} onClick={() => { filter(card.filter); setSearch('') }}>
      <span className="lead-stat-icon">{card.icon}</span><span><small>{card.label}</small><strong>{card.value ?? '—'}</strong></span>
    </button>)}</section>
    <section className="lead-list-panel">
      <div className="lead-list-heading"><h2>客源档案</h2><Space><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>录入客源</Button></Space></div>
      <div className="lead-filters">
        <Input.Search aria-label="搜索客源" placeholder="搜索姓名、电话、联系人或微信" value={search} maxLength={100} allowClear onChange={(event) => { setSearch(event.target.value); if (!event.target.value) filter({ ...filters, keyword: '' }) }} onSearch={(keyword) => filter({ ...filters, keyword })} />
        {campuses.length > 1 && <Select aria-label="所属校区" placeholder="全部校区" allowClear value={filters.campusId} options={campuses.map((item) => ({ value: item.id, label: item.name }))} onChange={(campusId) => filter({ ...filters, campusId: campusId || undefined })} />}
        <Select aria-label="客户状态" mode="multiple" placeholder="全部状态" allowClear maxTagCount="responsive" value={filters.status ? filters.status.split(',') : []} options={LEAD_STATUSES} onChange={(status: string[]) => filter({ ...filters, status: status.length ? status.join(',') : undefined })} />
        <Select aria-label="销售负责人" mode="multiple" placeholder="全部销售" allowClear showSearch optionFilterProp="label" maxTagCount="responsive" value={filters.ownerId ? filters.ownerId.split(',').map((id) => Number(id)) : []} options={[{ value: 0, label: '待分配' }, ...salespeople.map((person) => ({ value: person.id, label: person.name }))]} onChange={(ownerIds: number[]) => filter({ ...filters, ownerId: ownerIds.length ? ownerIds.join(',') : undefined })} />
        {mySales.length === 1 && <Button type={filters.ownerId === String(mySales[0].id) ? 'primary' : 'default'} onClick={() => filter({ ...filters, ownerId: String(mySales[0].id) })}>我负责的</Button>}
      </div>
      {error && <Alert type="error" showIcon message={error} action={<Button onClick={load}>重试</Button>} />}
      <Table<Lead> rowKey="id" loading={loading} dataSource={error ? [] : data.records} scroll={{ x: 920 }}
        onRow={(row) => ({ onClick: () => select(row.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, showSizeChanger: false, showTotal: (total) => `共 ${total} 个客源`, onChange: setPage }}
        locale={{ emptyText: <Empty description={error ? '加载失败，请重试' : hasFilters ? '没有符合筛选条件的客源' : '录入第一位客户，开始跟进'}>{!error && (hasFilters ? <Button onClick={() => { setSearch(''); filter({}) }}>重置筛选</Button> : <Button type="primary" onClick={() => setCreating(true)}>录入客源</Button>)}</Empty> }} columns={[
          { title: '客户', key: 'name', width: 170, fixed: 'left', render: (_, row) => <div className="lead-customer"><span className="lead-avatar">{row.name.slice(0, 1)}</span><div className="lead-customer-text"><span className="lead-customer-name" title={row.name}>{row.name}</span>{row.contactName ? <small title={row.contactName}>{row.contactName}</small> : null}</div></div> },
          { title: '联系电话', dataIndex: 'phone', width: 190, render: (phone: string) => phone ? <Space size={4} onClick={(event) => event.stopPropagation()}><a href={`tel:${phone}`}>{phone}</a><span className="lead-copy-dot">·</span><PhoneCopyButton onClick={async () => { if (await copyPlainText(phone)) message.success('已复制'); else message.error('复制失败') }} /></Space> : '—' },
          { title: '客源渠道', dataIndex: 'source', width: 110, render: (source: string) => source || '—' },
          ...(campuses.length > 1 ? [{ title: '校区', dataIndex: 'campusId', width: 120, render: (id: number | null) => campuses.find((item) => item.id === id)?.name || (id ? '—' : '未分配校区') }] : []),
          { title: '客户状态', dataIndex: 'status', width: 100, render: (status) => <Tag color={statusInfo(status).color}>{statusInfo(status).label}</Tag> },
          { title: '销售负责人', dataIndex: 'ownerName', width: 110, render: (name) => name || <span className="lead-muted">待分配</span> },
          { title: '下次跟进', key: 'next', width: 175, render: (_, row) => <span className={isLeadDue(row) ? 'lead-due' : 'lead-muted'}>{isLeadDue(row) && <ClockCircleOutlined />} {leadTime(row.nextFollowAt)}</span> },
        ]} />
    </section>
    {creating && <LeadEditor salespeople={salespeople} campuses={campuses} onClose={() => setCreating(false)} onSaved={(lead) => { setCreating(false); select(lead.id); void load() }} />}
    {selectedId && <LeadDetail key={selectedId} id={selectedId} salespeople={salespeople} campuses={campuses} onClose={() => select()} onChanged={load} />}
  </div>
}
