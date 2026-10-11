import { BookOutlined, ClockCircleOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons'
import { Button, Empty, Skeleton, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { memberKey, useParentContext } from './ParentLayout'
import { ParentMemberTabs, useMemberSelection } from './parent-kit'
import type { ParentClassRecord, ParentPayment } from './parent-model'

export function ParentRecordsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { home } = useParentContext()
  const selection = useMemberSelection(home.children || [])
  const tab = params.get('tab') === 'class' ? 'class' : 'payment'
  const [payments, setPayments] = useState<ParentPayment[]>([])
  const [classes, setClasses] = useState<ParentClassRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const requested = params.get('member')
    const member = home.children?.find((item) => memberKey(item) === requested)
    if (member) selection.select(member)
  }, [home.children, params])

  useEffect(() => {
    if (!selection.selected) return
    setLoading(true)
    Promise.all([parentApi.payments(selection.selected), parentApi.classes(selection.selected)])
      .then(([payRows, classRows]) => { setPayments(payRows || []); setClasses(classRows || []) })
      .finally(() => setLoading(false))
  }, [selection.selectedKey])

  const courseName = params.get('courseName') || ''
  const visiblePayments = courseName ? payments.filter((item) => item.courseName === courseName || item.courseType?.includes(courseName)) : payments
  const visibleClasses = courseName ? classes.filter((item) => item.courseName === courseName) : classes
  const grouped = useMemo(() => groupByOrg(tab === 'payment' ? visiblePayments : visibleClasses), [tab, visiblePayments, visibleClasses])
  const total = tab === 'payment' ? visiblePayments.reduce((sum, item) => sum + Number(item.amount || 0), 0) : visibleClasses.reduce((sum, item) => sum + Number(item.hours || 0), 0)

  function switchTab(next: 'payment' | 'class') {
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams)
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>{courseName || `${selection.selected?.name || '成员'}的记录`}</h2><p>{selection.selected?.source === 'PRIVATE' ? '自建记录可在具体课程中新增、编辑或删除。' : '机构记录由机构维护，家长端保持只读同步。'}</p></div>{selection.selected?.source === 'PRIVATE' ? <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/parent/courses')}>前往课程新增记录</Button> : null}</div>
      <div className="parent-record-toolbar">
        <ParentMemberTabs members={home.children || []} value={selection.selectedKey} onChange={selection.select} />
        <div className="parent-record-tabs"><button type="button" className={tab === 'payment' ? 'active' : ''} onClick={() => switchTab('payment')}><WalletOutlined /> 缴费记录</button><button type="button" className={tab === 'class' ? 'active' : ''} onClick={() => switchTab('class')}><ClockCircleOutlined /> 上课记录</button></div>
      </div>
      <div className="parent-record-summary parent-card"><span className={tab}>{tab === 'payment' ? <WalletOutlined /> : <BookOutlined />}</span><div><small>{tab === 'payment' ? '累计缴费' : '累计到课'}</small><strong>{tab === 'payment' ? `¥${total.toFixed(2)}` : `${visibleClasses.length} 次${total ? ` · ${total} 课时` : ''}`}</strong></div><Tag color={selection.selected?.source === 'PRIVATE' ? 'blue' : 'cyan'}>{selection.selected?.source === 'PRIVATE' ? '自建数据' : '机构同步'}</Tag></div>
      {loading ? <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 7 }} /></div> : grouped.length ? <div className="parent-record-groups">{grouped.map((group) => <section className="parent-card parent-record-group" key={group.name}><div className="parent-card-head"><h3>{group.name}</h3><span>{group.rows.length} 条</span></div>{group.rows.map((row) => tab === 'payment' ? <PaymentRow key={row.id} row={row as ParentPayment} /> : <ClassRow key={row.id} row={row as ParentClassRecord} />)}</section>)}</div> : <div className="parent-card parent-empty"><Empty description={tab === 'payment' ? '暂无缴费记录' : '暂无上课记录'} /></div>}
    </div>
  )
}

function groupByOrg(rows: Array<ParentPayment | ParentClassRecord>) {
  const map = new Map<string, Array<ParentPayment | ParentClassRecord>>()
  rows.forEach((row) => { const name = [row.orgName, row.campusName].filter(Boolean).join(' · ') || '自建课程'; map.set(name, [...(map.get(name) || []), row]) })
  return [...map.entries()].map(([name, records]) => ({ name, rows: records.sort((a, b) => String((b as ParentPayment).paymentDate || (b as ParentClassRecord).classDate).localeCompare(String((a as ParentPayment).paymentDate || (a as ParentClassRecord).classDate))) }))
}

function PaymentRow({ row }: { row: ParentPayment }) {
  return <div className="parent-record-row"><span className="payment"><WalletOutlined /></span><div><strong>{row.courseName || row.cardName || '缴费'}</strong><small>{[row.paymentDate || row.payDate, row.typeText, row.remark].filter(Boolean).join(' · ')}</small></div><b>+ ¥{Number(row.amount || 0).toFixed(2)}</b></div>
}

function ClassRow({ row }: { row: ParentClassRecord }) {
  return <div className="parent-record-row"><span className="class"><ClockCircleOutlined /></span><div><strong>{row.courseName || '上课记录'} {row.autoCheckIn ? <Tag color="blue">自动打卡</Tag> : null}</strong><small>{[row.classDate, row.startTime && `${String(row.startTime).slice(0, 5)}–${String(row.endTime || '').slice(0, 5)}`, row.coachName, row.remark].filter(Boolean).join(' · ')}</small></div><b className="class-value">{row.hours ? `${row.hours} 课时` : '已到课'}</b></div>
}
