import { BarChartOutlined, BookOutlined, CalendarOutlined, ClockCircleOutlined, PlusOutlined, RightOutlined, WalletOutlined } from '@ant-design/icons'
import { Button, Empty, Skeleton, Tag } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { useParentContext } from './ParentLayout'
import { BoardToolbar, ParentMemberTabs, ParentWeekBoard, useMemberSelection, useParentBoard } from './parent-kit'
import type { ParentClassRecord, ParentPayment } from './parent-model'

type Activity = { key: string; kind: 'class' | 'payment'; title: string; meta: string; value: string; date: string }

export function ParentHomePage() {
  const navigate = useNavigate()
  const { user, home } = useParentContext()
  const members = home.children || []
  const selection = useMemberSelection(members)
  const boardState = useParentBoard(selection.selected)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!selection.selected) return setActivities([])
    setActivityLoading(true)
    Promise.all([parentApi.payments(selection.selected), parentApi.classes(selection.selected)])
      .then(([payments, classes]) => setActivities(buildActivities(payments, classes).slice(0, 6)))
      .catch(() => setActivities([]))
      .finally(() => setActivityLoading(false))
  }, [selection.selectedKey])

  const lessons = useMemo(() => [...(boardState.board?.institutionLessons || []), ...(boardState.board?.privateLessons || [])], [boardState.board])
  const weekLessons = lessons.filter((lesson) => !lesson.scheduleDate || (!dayjs(lesson.scheduleDate).isBefore(dayjs(boardState.start), 'day') && !dayjs(lesson.scheduleDate).isAfter(dayjs(boardState.start).add(6, 'day'), 'day')))
  const greeting = dayjs().hour() < 11 ? '早上好' : dayjs().hour() < 14 ? '中午好' : dayjs().hour() < 18 ? '下午好' : '晚上好'
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][dayjs().day()]

  if (!members.length) {
    return (
      <section className="parent-welcome-empty parent-card">
        <div className="parent-welcome-visual"><CalendarOutlined /></div>
        <h2>从第一位成员开始管理课表</h2>
        <p>新建成员后，可以安排个人课表、记录缴费和上课日期；机构开放家长查看后，关联学员也会自动出现。</p>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/parent/children?create=1')}>新建成员</Button>
      </section>
    )
  }

  return (
    <div>
      <div className="parent-home-hero">
        <div><span>{greeting}，{user?.nickname || user?.realName || '学员'}</span><h2>把这一周的学习安排，看得更清楚。</h2><p>{dayjs().format('YYYY年M月D日')} {weekday} · 共 {members.length} 位成员</p></div>
        <ParentMemberTabs members={members} value={selection.selectedKey} onChange={selection.select} />
      </div>
      <section className="parent-card parent-home-board">
        <div className="parent-card-head"><h3>{selection.selected?.name}的本周课程</h3><span>{weekLessons.length} 节安排</span></div>
        <div className="parent-home-board-body">
          <BoardToolbar start={boardState.start} setStart={boardState.setStart} member={selection.selected} />
          <ParentWeekBoard board={boardState.board} start={boardState.start} loading={boardState.loading} error={boardState.error} compact onLessonClick={() => navigate(`/parent/timetable?member=${selection.selectedKey}`)} />
        </div>
      </section>
      <div className="parent-home-lower">
        <section>
          <div className="parent-section-title"><h3>常用功能</h3><span>快速进入</span></div>
          <div className="parent-quick-grid">
            <Quick icon={<CalendarOutlined />} tone="blue" title="全部课表" text="查看和安排一周课程" onClick={() => navigate(`/parent/timetable?member=${selection.selectedKey}`)} />
            <Quick icon={<BookOutlined />} tone="green" title="上课记录" text="到课与请假一目了然" onClick={() => navigate(`/parent/records?member=${selection.selectedKey}&tab=class`)} />
            <Quick icon={<WalletOutlined />} tone="orange" title="缴费记录" text="机构与自建课程费用" onClick={() => navigate(`/parent/records?member=${selection.selectedKey}&tab=payment`)} />
            <Quick icon={<BarChartOutlined />} tone="violet" title="课程统计" text="课时、金额和出勤趋势" onClick={() => navigate(`/parent/course-stats?member=${selection.selectedKey}`)} />
          </div>
        </section>
        <section>
          <div className="parent-section-title"><h3>最近动态</h3><Button type="link" onClick={() => navigate('/parent/activities')}>全部 <RightOutlined /></Button></div>
          <div className="parent-card parent-activity-list">
            {activityLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : activities.length ? activities.map((item) => <ActivityRow key={item.key} item={item} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无最近动态" />}
          </div>
        </section>
      </div>
    </div>
  )
}

function Quick(props: { icon: React.ReactNode; tone: string; title: string; text: string; onClick: () => void }) {
  return <button type="button" className={`parent-quick ${props.tone}`} onClick={props.onClick}><span>{props.icon}</span><strong>{props.title}</strong><small>{props.text}</small><RightOutlined /></button>
}

function ActivityRow({ item }: { item: Activity }) {
  return <div className="parent-activity-row"><span className={item.kind}><ClockCircleOutlined /></span><div><strong>{item.title}</strong><small>{item.meta}</small></div><Tag color={item.kind === 'payment' ? 'blue' : 'green'}>{item.value}</Tag></div>
}

export function buildActivities(payments: ParentPayment[], classes: ParentClassRecord[]): Activity[] {
  const payRows = payments.map((item) => ({ key: `p-${item.id}`, kind: 'payment' as const, title: item.typeText || (item.parentPaid ? '学员端缴费' : `${item.courseName || item.cardName || '课程'}缴费`), meta: [item.orgName, item.paymentDate || item.payDate].filter(Boolean).join(' · '), value: `¥${Number(item.amount || 0).toFixed(2)}`, date: item.eventTime || item.paymentDate || item.payDate || '' }))
  const classRows = classes.map((item) => ({ key: `c-${item.id}`, kind: 'class' as const, title: `${item.courseName || '课程'}上课`, meta: [item.orgName, item.classDate, item.coachName].filter(Boolean).join(' · '), value: item.hours ? `${item.hours}课时` : '已到课', date: item.eventTime || item.classDate || '' }))
  return [...payRows, ...classRows].sort((a, b) => b.date.localeCompare(a.date))
}
