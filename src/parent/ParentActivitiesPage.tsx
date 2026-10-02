import { Empty, Skeleton } from 'antd'
import { useEffect, useState } from 'react'
import { parentApi } from '../api/parent'
import { useParentContext } from './ParentLayout'
import { buildActivities } from './ParentHomePage'

export function ParentActivitiesPage() {
  const { home } = useParentContext()
  const [rows, setRows] = useState<ReturnType<typeof buildActivities>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    Promise.all((home.children || []).map(async (member) => {
      const [payments, classes] = await Promise.all([parentApi.payments(member), parentApi.classes(member)])
      return buildActivities(payments, classes).map((row) => ({ ...row, title: `${member.name} · ${row.title}` }))
    })).then((groups) => setRows(groups.flat().sort((a, b) => b.date.localeCompare(a.date)))).finally(() => setLoading(false))
  }, [home.children])
  return (
    <div>
      <div className="parent-page-head"><div><h2>最近动态</h2><p>按时间汇总全部成员的机构记录与自建记录。</p></div></div>
      <section className="parent-card parent-timeline">
        {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : rows.length ? rows.map((row) => <div className="parent-timeline-row" key={row.key}><span className={row.kind} /><div><strong>{row.title}</strong><small>{row.meta}</small></div><b>{row.value}</b></div>) : <Empty description="暂无最近动态" />}
      </section>
    </div>
  )
}
