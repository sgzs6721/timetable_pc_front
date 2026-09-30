import { useState } from 'react'
import { PageHead } from './kit'

const ROLES = [
  { title: '机构/校区管理员', text: '管理机构与校区' },
  { title: '带课教师', text: '查看课表与工资' },
  { title: '普通成员', text: '查看授权业务' },
]

const FLOW = [
  { number: '1', title: '选机构', text: '确定业务范围' },
  { number: '2', title: '选校区', text: '切换校区数据' },
  { number: '3', title: '做业务', text: '处理日常业务' },
  { number: '4', title: '看结果', text: '查看统计分析' },
]

const SECTIONS = [
  { id: 'start', title: '开始使用：登录、机构与校区', subtitle: '第一次使用先完成身份和基础资料设置', steps: ['完成手机号或微信登录。', '没有机构时创建机构，或接受邀请加入已有机构。', '机构管理员新建校区，填写名称、地址、负责人和电话。', '在顶栏切换机构和校区，页面数据会跟着刷新。'], tips: ['页面提示先选择机构时，先回首页完成机构选择。', '不同身份看到的菜单不同。'] },
  { id: 'home', title: '首页：工作台与今日安排', subtitle: '查看当前校区概况', steps: ['顶部切换机构和校区。', '今日、明日切换后重新看课程、学员和销课。', '最近上课记录可进入学员详情。', '快捷入口按身份显示。'], tips: ['没有校区时先创建校区。'] },
  { id: 'students', title: '学员管理', subtitle: '档案、课程卡与上课记录', steps: ['按在学、结业、待缴费筛选并搜索。', '新增学员、分配老师、配置课程卡。', '详情里编辑资料、转校区、结业或删除。', '缴费记录和打卡记录可以查看、编辑、删除。', '家长可见开关和家长可缴项目由员工维护。'], tips: ['跨校区前先确认顶栏校区。'] },
  { id: 'payment', title: '缴费与课时', subtitle: '收款、退费、补缴和统计', steps: ['缴费管理按校区和日期汇总。', '新增、续费、补缴、退费和调整分开记录。', '正课、赠课、有效期和余额在记录里查看。', '展开明细后可以进入学员。'], tips: ['退费只处理记录，不会清空历史课时。'] },
  { id: 'schedule', title: '课表管理', subtitle: '新建、排课、调整与归档', steps: ['按校区查看活动课表和归档课表。', '周固定或日期范围，设置上课日和时间。排课粒度固定为 1 小时。', '周视图里新增、请假、占用、移动、复制和取消课段。', '可以看本周总览，以及某课程的本周和全部排课。'], tips: ['已有排课时只能修改课表名称。每人最多保留 2 张非归档课表。'] },
  { id: 'class', title: '课程', subtitle: '老师、学员和课程配置', steps: ['查看课程总数、一对一和其它课程。', '维护简称、单价、是否一对一和最少开课人数。', '课程学员里查看状态、有效期、余额和剩余课时。'], tips: ['先配置老师和课程，学员添加课程卡时才有可选项。'] },
  { id: 'organization', title: '机构、校区与人员', subtitle: '组织结构和权限', steps: ['维护机构资料、协同管理员和工资周期。', '校区可以新建、编辑、上线、下线和删除。', '老师按手机号添加，也可以从其他校区导入并指定职位。', '系统管理职位不可删除。人员交接后移出校区，历史记录保留。'], tips: ['权限以当前机构和当前校区为准。'] },
  { id: 'service', title: '校区服务与日常管理', subtitle: '服务项目、制度和奖惩', steps: ['维护校区服务项目。', '规章制度未配置时显示空状态。', '奖惩记录选择老师、项目、日期和金额。'], tips: ['先配置服务和工资规则，再做缴费和排课。'] },
  { id: 'salary', title: '工资', subtitle: '设置、核算与发放', steps: ['有管理权进入工资管理，没有管理权只看我的工资。', '按记薪周期查看固定项、课时项、体验课和奖惩。', '管理员可以记录发放日期、方式和备注。'], tips: ['工资依赖课时单价、消课和奖惩日期。'] },
  { id: 'finance', title: '收支与经营分析', subtitle: '流水、成本和利润', steps: ['财务设置维护收入项目、支出项目和周期支出。', '收支总览分开看收入、运营支出和老师成本。', '经营分析选择周期，对比校区，查看每日趋势。', '点开日期可看课时成本、销课收入和经营支出，并从收入进入学员。'], tips: ['空白时先检查日期和校区。'] },
  { id: 'membership', title: '会员与扩容', subtitle: '续费、升级和学员容量', steps: ['查看当前会员、有效期和套餐权益。', '同级续费可选 1 至 3 年，升级要查看补差价方式。', '可查看校区学员容量和扩容档位。', '不支持降级。'], tips: ['微信支付请在小程序会员页完成，网页不发起支付。'] },
  { id: 'feedback', title: '反馈与账号', subtitle: '提交问题并退出', steps: ['问题反馈填写类别、标题、描述和联系方式，并查看自己提交的记录。', '个人中心可改昵称和头像，查看职位、机构和关联机构。', '退出会清理本机登录状态。'], tips: ['不要在反馈里填写密码或验证码。'] },
]

export function GuidePage() {
  const [open, setOpen] = useState('start')
  return (
    <section>
      <PageHead title="使用文档" extra="机构、学员、排课、收费、工资与经营分析，按权限使用。" />
      <section className="work-card">
        <h2>你能看到什么，取决于你的身份</h2>
        <div className="shortcut-grid">
          {ROLES.map((item) => <div className="shortcut-card" key={item.title}><strong>{item.title}</strong><span>{item.text}</span></div>)}
        </div>
      </section>
      <section className="work-card">
        <h2>四步建立日常管理节奏</h2>
        <div className="shortcut-grid">
          {FLOW.map((item) => <div className="shortcut-card" key={item.number}><strong>{item.number} {item.title}</strong><span>{item.text}</span></div>)}
        </div>
      </section>
      {SECTIONS.map((section) => (
        <section className="work-card guide-section" key={section.id}>
          <button className="guide-toggle" type="button" onClick={() => setOpen(open === section.id ? '' : section.id)}>
            <strong>{section.title}</strong>
            <span>{section.subtitle}</span>
          </button>
          {open === section.id ? (
            <div className="guide-body">
              <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p>使用提醒：{section.tips.join(' ')}</p>
            </div>
          ) : null}
        </section>
      ))}
    </section>
  )
}
