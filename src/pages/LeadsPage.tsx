import { CheckCircleOutlined, ClockCircleOutlined, PlusOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Input, Select, Space, Table, Tag } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getJson } from '../api/biz'
import { PageHead, tell, useShell } from './kit'
import { LeadDetail } from './leads-detail'
import { LeadEditor } from './leads-editor'
import { LEAD_SOURCES, LEAD_STATUSES, isLeadDue, leadTime, statusInfo, type Lead, type LeadPage, type LeadSalesperson, type LeadSummary } from './leads-model'

type Filters = { keyword?: string; status?: string; ownerId?: number; due?: string; source?: string }
export function LeadsPage() {
  const { currentOrgId, user } = useShell()
  // Switching organization remounts the entire workspace, discarding open customer forms.
  return <LeadWorkspace key={currentOrgId} userId={user?.id} />
}

function LeadWorkspace({ userId }: { userId?: number }) {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<LeadPage<Lead>>({ records: [], total: 0, current: 1, pages: 0 })
  const [summary, setSummary] = useState<LeadSummary | null>(null)
  const [salespeople, setSalespeople] = useState<LeadSalesperson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const sequence = useRef(0)
  const selectedId = Number(params.get('leadId')) || null
  const load = useCallback(async () => {
    const token = ++sequence.current
    setLoading(true); setError('')
    try {
      const [rows, stats, sales] = await Promise.all([
        getJson<LeadPage<Lead>>('/leads', { ...filters, page, size: 20 }),
        getJson<LeadSummary>('/leads/summary'), getJson<LeadSalesperson[]>('/leads/salespeople'),
      ])
      if (token !== sequence.current) return
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
    { label: '待分配', value: summary?.unassigned, icon: <UserSwitchOutlined />, tone: 'purple', filter: { ownerId: 0 } },
    { label: '已成交', value: summary?.won, icon: <CheckCircleOutlined />, tone: 'green', filter: { status: 'SOLD' } },
  ]
  return <div className="work-page leads-page">
    <PageHead title="客源管理" extra="记录客户来源，分配销售负责人，持续跟进每一次沟通。" />
    <section className="lead-overview" aria-label="机构客源概况">{cards.map((card) => <button type="button" key={card.label} className={`lead-stat lead-stat--${card.tone}`} onClick={() => { filter(card.filter); setSearch('') }}>
      <span className="lead-stat-icon">{card.icon}</span><span><small>{card.label}</small><strong>{card.value ?? '—'}</strong></span>
    </button>)}</section>
    <section className="lead-list-panel">
      <div className="lead-list-heading"><div><h2>客源档案</h2><p>从第一次咨询，到每一次进展</p></div><Space><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>录入客源</Button></Space></div>
      <div className="lead-filters">
        <Input.Search aria-label="搜索客源" placeholder="搜索姓名、电话、联系人或微信" value={search} maxLength={100} allowClear onChange={(event) => { setSearch(event.target.value); if (!event.target.value) filter({ ...filters, keyword: '' }) }} onSearch={(keyword) => filter({ ...filters, keyword })} />
        <Select aria-label="客户状态" placeholder="全部状态" allowClear value={filters.status} options={LEAD_STATUSES} onChange={(status) => filter({ ...filters, status })} />
        <Select aria-label="销售负责人" placeholder="全部销售" allowClear showSearch optionFilterProp="label" value={filters.ownerId} options={[{ value: 0, label: '待分配' }, ...salespeople.map((person) => ({ value: person.id, label: person.name }))]} onChange={(ownerId) => filter({ ...filters, ownerId })} />
        <Select aria-label="跟进时间" placeholder="全部跟进时间" allowClear value={filters.due} options={[{ value: 'DUE', label: '到期待跟进' }, { value: 'TODAY', label: '今日计划' }, { value: 'UNPLANNED', label: '未安排跟进' }]} onChange={(due) => filter({ ...filters, due })} />
        <Select aria-label="客源渠道" placeholder="全部渠道" allowClear value={filters.source} options={LEAD_SOURCES.map((value) => ({ value, label: value }))} onChange={(source) => filter({ ...filters, source })} />
        <Button onClick={() => { setSearch(''); filter({}) }}>重置</Button>
        {mySales.length === 1 && <Button type={filters.ownerId === mySales[0].id ? 'primary' : 'default'} onClick={() => filter({ ...filters, ownerId: mySales[0].id })}>我负责的</Button>}
      </div>
      {error && <Alert type="error" showIcon message={error} action={<Button onClick={load}>重试</Button>} />}
      <Table<Lead> rowKey="id" loading={loading} dataSource={error ? [] : data.records} scroll={{ x: 920 }}
        pagination={{ current: page, pageSize: 20, total: data.total, showSizeChanger: false, showTotal: (total) => `共 ${total} 条客源`, onChange: setPage }}
        locale={{ emptyText: <Empty description={error ? '加载失败，请重试' : hasFilters ? '没有符合筛选条件的客源' : '录入第一位客户，开始跟进'}>{!error && (hasFilters ? <Button onClick={() => { setSearch(''); filter({}) }}>重置筛选</Button> : <Button type="primary" onClick={() => setCreating(true)}>录入客源</Button>)}</Empty> }} columns={[
          { title: '客户', key: 'name', width: 170, fixed: 'left', render: (_, row) => <div className="lead-customer"><span className="lead-avatar">{row.name.slice(0, 1)}</span><div className="lead-customer-text"><Button type="link" title={row.name} onClick={() => select(row.id)}>{row.name}</Button><small title={row.contactName}>{row.contactName || '未填写联系人'}</small></div></div> },
          { title: '联系电话', dataIndex: 'phone', width: 145 },
          { title: '客源渠道', dataIndex: 'source', width: 110 },
          { title: '客户状态', dataIndex: 'status', width: 100, render: (status) => <Tag color={statusInfo(status).color}>{statusInfo(status).label}</Tag> },
          { title: '销售负责人', dataIndex: 'ownerName', width: 110, render: (name) => name || <span className="lead-muted">待分配</span> },
          { title: '下次跟进', key: 'next', width: 175, render: (_, row) => <span className={isLeadDue(row) ? 'lead-due' : 'lead-muted'}>{isLeadDue(row) && <ClockCircleOutlined />} {leadTime(row.nextFollowAt)}</span> },
          { title: '操作', key: 'actions', width: 115, fixed: 'right', render: (_, row) => <Button type="link" onClick={() => select(row.id)}>查看 / 跟进</Button> },
        ]} />
    </section>
    {creating && <LeadEditor salespeople={salespeople} onClose={() => setCreating(false)} onSaved={(lead) => { setCreating(false); select(lead.id); void load() }} />}
    {selectedId && <LeadDetail key={selectedId} id={selectedId} salespeople={salespeople} onClose={() => select()} onChanged={load} />}
  </div>
}
