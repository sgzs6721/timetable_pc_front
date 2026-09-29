import { Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { loadHome } from '../api/home'
import type { HomeBootstrap, ScheduleItem } from '../api/types'
import type { ShellContext } from '../layouts/AppShell'
import './HomePage.css'

function clock(value?: string): string {
  if (!value) return ''
  return value.slice(0, 5)
}

function scheduleTitle(item: ScheduleItem): string {
  return item.displayName || item.courseName || '未命名课程'
}

export function HomePage() {
  const shell = useOutletContext<ShellContext>()
  const [home, setHome] = useState<HomeBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    loadHome(shell.campusId)
      .then((data) => {
        if (!active) return
        setHome(data)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : '首页加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [shell.campusId, shell.currentOrgId])

  if (loading) {
    return <Spin />
  }

  const userName = home?.user?.realName || home?.user?.nickname || home?.user?.nickName || '你好'
  const organizations = home?.organizations || []
  const dashboard = home?.dashboard
  const schedules = dashboard?.todaySchedules || []

  if (!organizations.length) {
    return (
      <section className="empty-card">
        <h2>当前账号没有机构身份</h2>
        <p>网页端只进入机构教务台。请使用已加入机构的账号登录，或先在小程序创建机构。</p>
      </section>
    )
  }

  return (
    <section>
      <header className="home-hero">
        <h1>{userName}</h1>
        <p>{error || '今天的课程、学员和销课，先看这一屏。'}</p>
      </header>
      <div className="metric-grid">
        <article className="metric-card">
          <span>今日课程</span>
          <strong>{dashboard?.todayScheduleCount ?? 0}<em>节</em></strong>
        </article>
        <article className="metric-card">
          <span>今日学员</span>
          <strong>{dashboard?.todayStudentCount ?? 0}<em>人</em></strong>
        </article>
        <article className="metric-card">
          <span>今日销课</span>
          <strong>{dashboard?.todayConsumptionAmount ?? 0}<em>元</em></strong>
        </article>
        <article className="metric-card">
          <span>有课老师</span>
          <strong>{dashboard?.todayCoachCount ?? 0}<em>位</em></strong>
        </article>
      </div>
      <section className="schedule-card">
        <h2>今日课程</h2>
        {schedules.length === 0 ? <p className="schedule-meta" style={{ padding: '0 18px 16px' }}>今天还没有课程安排</p> : null}
        {schedules.map((item) => (
          <div className="schedule-row" key={item.id}>
            <div className="schedule-time">{clock(item.startTime)}{item.endTime ? `–${clock(item.endTime)}` : ''}</div>
            <div>
              <div className="schedule-title">{scheduleTitle(item)}</div>
              <div className="schedule-meta">{[item.coachName, item.location].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="schedule-meta">{item.currentStudents != null ? `${item.currentStudents} 人上课` : ''}</div>
          </div>
        ))}
      </section>
    </section>
  )
}
