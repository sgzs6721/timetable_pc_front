import { ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons'
import { Button, Empty, Skeleton } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { BoardToolbar, ParentWeekBoard } from './parent-kit'
import { StatsContent } from './ParentStatsPage'
import type { ParentBoard, ParentCourseStats } from './parent-model'

function currentWeekStart() {
  const today = dayjs()
  return today.subtract((today.day() || 7) - 1, 'day').format('YYYY-MM-DD')
}

export function SharedTimetablePage() {
  const { shareCode = '' } = useParams()
  const navigate = useNavigate()
  const [start, setStart] = useState(currentWeekStart())
  const [board, setBoard] = useState<ParentBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true)
    setError('')
    parentApi.sharedBoard(shareCode, start).then(setBoard).catch((reason) => setError(reason.message)).finally(() => setLoading(false))
  }, [shareCode, start])
  return <SharedFrame title={board?.name ? `${board.name}的课表` : '课表分享'} description={`${dayjs(start).format('M月D日')} – ${dayjs(start).add(6, 'day').format('M月D日')} · 只读分享`} onBack={() => navigate('/parent/home')}><BoardToolbar start={start} setStart={setStart} /><ParentWeekBoard board={board} start={start} loading={loading} error={error} readOnly /></SharedFrame>
}

export function SharedCourseStatsPage() {
  const { shareCode = '' } = useParams()
  const navigate = useNavigate()
  const [stats, setStats] = useState<ParentCourseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { parentApi.sharedStats(shareCode).then(setStats).catch((reason) => setError(reason.message)).finally(() => setLoading(false)) }, [shareCode])
  return <SharedFrame title={stats?.memberName ? `${stats.memberName}的课程统计` : '课程统计分享'} description={`综合出勤率 ${stats?.attendanceRate == null ? '--' : `${stats.attendanceRate}%`} · 只读分享`} onBack={() => navigate('/parent/home')}>{loading ? <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 9 }} /></div> : error ? <div className="parent-card parent-empty"><Empty description={error} /></div> : stats ? <StatsContent stats={stats} readOnly /> : null}</SharedFrame>
}

function SharedFrame(props: { title: string; description: string; onBack: () => void; children: React.ReactNode }) {
  return <main className="parent-shared-page"><header><span><CalendarOutlined /></span><div><h1>{props.title}</h1><p>{props.description}</p></div><Button icon={<ArrowLeftOutlined />} onClick={props.onBack}>返回家长端</Button></header><section>{props.children}</section><footer>云效课时 · 保护成员隐私，仅登录用户可查看</footer></main>
}
