import { BarChartOutlined, CalendarOutlined, ShareAltOutlined, WalletOutlined } from '@ant-design/icons'
import { Button, Empty, Progress, Segmented, Skeleton, Tag, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { copyShareLink, memberKey, useParentContext } from './ParentLayout'
import { ParentMemberTabs, useMemberSelection } from './parent-kit'
import type { ParentChild, ParentCourseStats } from './parent-model'

export function ParentStatsPage() {
  const [params] = useSearchParams()
  const { home } = useParentContext()
  const selection = useMemberSelection(home.children || [])
  const [stats, setStats] = useState<ParentCourseStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'courses' | 'trend'>('courses')
  const [period, setPeriod] = useState<'weeks' | 'months'>('weeks')

  useEffect(() => {
    const requested = params.get('member')
    const member = home.children?.find((item) => memberKey(item) === requested)
    if (member) selection.select(member)
  }, [params, home.children])
  useEffect(() => {
    if (!selection.selected) return
    setLoading(true)
    parentApi.stats(selection.selected).then(setStats).finally(() => setLoading(false))
  }, [selection.selectedKey])

  async function share() {
    if (!selection.selected) return
    const result = await parentApi.share(selection.selected)
    copyShareLink(`/parent/share/course-stats/${result.shareCode}`)
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>课程统计</h2><p>同时查看课时、缴费、剩余权益与出勤趋势。</p></div><Button icon={<ShareAltOutlined />} disabled={!stats?.courses?.length} onClick={() => void share()}>分享统计</Button></div>
      <div className="parent-stats-memberbar"><ParentMemberTabs members={home.children || []} value={selection.selectedKey} onChange={selection.select} /></div>
      {loading ? <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 10 }} /></div> : stats ? <StatsContent stats={stats} view={view} period={period} setView={setView} setPeriod={setPeriod} /> : <div className="parent-card parent-empty"><Empty description="暂无课程统计" /></div>}
    </div>
  )
}

export function StatsContent(props: { stats: ParentCourseStats; view?: 'courses' | 'trend'; period?: 'weeks' | 'months'; setView?: (view: 'courses' | 'trend') => void; setPeriod?: (period: 'weeks' | 'months') => void; readOnly?: boolean }) {
  const stats = props.stats
  const view = props.view || 'courses'
  const period = props.period || 'weeks'
  return (
    <>
      <section className="parent-stats-overview">
        <div><span>综合出勤率</span><strong>{stats.attendanceRate == null ? '--' : `${stats.attendanceRate}%`}</strong></div>
        <Stat icon={<WalletOutlined />} value={`¥${Number(stats.totalAmount || 0).toFixed(2)}`} label="缴费总额" />
        <Stat icon={<BarChartOutlined />} value={String(stats.courses?.length || 0)} label="课程 · 门" />
        <Stat icon={<CalendarOutlined />} value={String(stats.checkInCount || 0)} label="到课 · 次" />
        <Stat icon={<CalendarOutlined />} value={String(stats.leaveCount || 0)} label="请假 · 次" tone="orange" />
      </section>
      <section className="parent-card parent-stats-panel">
        <div className="parent-stats-toolbar">{props.readOnly ? <strong>课程数据</strong> : <><Segmented value={view} options={[{ value: 'courses', label: '课程数据' }, { value: 'trend', label: '上课趋势' }]} onChange={(value) => props.setView?.(value as 'courses' | 'trend')} />{view === 'trend' ? <Segmented size="small" value={period} options={[{ value: 'weeks', label: '按周' }, { value: 'months', label: '按月' }]} onChange={(value) => props.setPeriod?.(value as 'weeks' | 'months')} /> : null}</>}</div>
        {view === 'courses' ? <CourseStatsList stats={stats} /> : <TrendChart stats={stats} period={period} />}
      </section>
    </>
  )
}

function Stat(props: { icon: React.ReactNode; value: string; label: string; tone?: string }) {
  return <div className={`parent-stat ${props.tone || ''}`}><span>{props.icon}</span><strong>{props.value}</strong><small>{props.label}</small></div>
}

function CourseStatsList({ stats }: { stats: ParentCourseStats }) {
  if (!stats.courses?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有可统计的课程" />
  return <div className="parent-stat-courses">{stats.courses.map((course, index) => <article className="parent-stat-course" key={`${course.courseName}-${index}`}><div className="parent-stat-course-head"><div><strong>{course.courseName || '未命名课程'}</strong><small>{course.orgName || '自建课程'} {course.cardLabel ? <Tag>{course.cardLabel}</Tag> : null}</small></div><span><small>出勤率</small><b>{course.attendanceRate == null ? '--' : `${course.attendanceRate}%`}</b></span></div>{course.progressPercent != null ? <Progress percent={Math.max(0, Math.min(100, course.progressPercent))} showInfo={false} strokeColor="#315ff4" /> : null}<div className="parent-stat-course-facts"><span>缴费 <b>¥{Number(course.totalAmount || 0).toFixed(2)}</b></span><span>到课 <b>{course.checkInCount || 0} 次</b></span><span>请假 <b>{course.leaveCount || 0} 次</b></span><span>{benefitLabel(course)} <b>{benefitValue(course)}</b></span></div></article>)}</div>
}

function TrendChart({ stats, period }: { stats: ParentCourseStats; period: 'weeks' | 'months' }) {
  const periods = stats[period] || []
  const max = Math.max(1, ...periods.flatMap((item) => item.counts || []))
  const courses = stats.courses || []
  const colors = ['#315ff4', '#14a57c', '#eb8a35', '#8557d3', '#dd5a72', '#167ca6']
  if (!periods.length || !stats.checkInCount) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="到课后，这里会展示趋势" />
  return <div className="parent-trend"><div className="parent-trend-legend">{courses.map((course, index) => <span key={`${course.courseName}-${index}`}><i style={{ background: colors[index % colors.length] }} />{course.courseName}</span>)}</div><div className="parent-trend-plot">{periods.map((item) => <div className="parent-trend-group" key={item.label}><div className="parent-trend-bars">{(item.counts || []).map((count, index) => <Tooltip key={index} title={`${courses[index]?.courseName || '课程'}：${count} 次`}><i style={{ height: `${Math.max(count ? 8 : 2, count / max * 100)}%`, background: count ? colors[index % colors.length] : '#e8edf5' }} /></Tooltip>)}</div><span>{item.label}</span></div>)}</div></div>
}

function benefitLabel(course: NonNullable<ParentCourseStats['courses']>[number]) {
  if (course.hoursTracked) return '剩余课时'
  if (course.amountTracked) return '储值余额'
  if (course.periodTracked) return '有效期'
  return '权益'
}
function benefitValue(course: NonNullable<ParentCourseStats['courses']>[number]) {
  if (course.hoursTracked) return `${course.remainingHours || 0}`
  if (course.amountTracked) return `¥${Number(course.remainingAmount || 0).toFixed(2)}`
  if (course.periodTracked) return course.periodOpenEnded ? '无限期' : '有效'
  return '--'
}

export function loadStatsForMember(member: ParentChild) { return parentApi.stats(member) }
