import { BarChartOutlined, CommentOutlined, CreditCardOutlined, IdcardOutlined, LogoutOutlined, ReadOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import { clearSession } from '../session'
import { useParentContext } from './ParentLayout'

export function ParentMinePage() {
  const navigate = useNavigate()
  const { user, home } = useParentContext()
  async function signOut() {
    await logout().catch(() => undefined)
    clearSession()
    navigate('/login', { replace: true })
  }
  return (
    <div className="parent-mine-grid">
      <section className="parent-mine-hero">
        <Avatar size={76} src={user?.avatarUrl} icon={<IdcardOutlined />} />
        <div><span>学员端</span><h2>{user?.realName || user?.nickname || user?.nickName || '家长用户'}</h2><p>{home.phone || user?.phone || '未绑定手机号'} · {home.children?.length || 0} 位成员</p></div>
      </section>
      <section>
        {user?.orgMemberId ? <MenuCard icon={<IdcardOutlined />} tone="blue" title="进入机构端" text="返回教务管理工作台" onClick={() => navigate('/home')} /> : null}
        <MenuCard icon={<BarChartOutlined />} tone="violet" title="课程统计" text="查看课时、缴费与出勤趋势" onClick={() => navigate('/parent/course-stats')} />
        <MenuCard icon={<CreditCardOutlined />} tone="blue" title="缴费报名" text="选择机构发布的项目并在线缴费" onClick={() => navigate('/parent/pay')} />
        <MenuCard icon={<TeamOutlined />} tone="cyan" title="成员管理" text="管理自建成员与机构关联学员" onClick={() => navigate('/parent/children')} />
        <MenuCard icon={<CommentOutlined />} tone="green" title="问题反馈" text="提交建议、异常与体验问题" onClick={() => navigate('/feedback')} />
      </section>
      <section className="parent-card parent-about-card">
        <h3>关于学员端</h3>
        <div><span><SafetyCertificateOutlined /></span><p><strong>机构学员</strong><small>手机号一致且机构开放查看后，会自动出现在成员列表。</small></p></div>
        <div><span><ReadOutlined /></span><p><strong>自建课表</strong><small>个人课表、缴费和打卡仅自己可见，机构端不会读取。</small></p></div>
      </section>
      <Button className="parent-logout-button" danger icon={<LogoutOutlined />} onClick={signOut}>退出当前账号</Button>
    </div>
  )
}

function MenuCard(props: { icon: React.ReactNode; tone: string; title: string; text: string; onClick: () => void }) {
  return <button type="button" className={`parent-mine-menu parent-card ${props.tone}`} onClick={props.onClick}><span>{props.icon}</span><p><strong>{props.title}</strong><small>{props.text}</small></p><b>›</b></button>
}
