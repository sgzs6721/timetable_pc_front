import { Button, Form, Input, Modal, Popconfirm, Space, Switch, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, postJson, putJson } from '../api/biz'
import { AppIcon, genderText, money, studentStatusText, tell } from './kit'
import type { Student, Named, PayRecord, PayLaunch, CheckRecord } from './students-model'
import { CardDesk } from './student-card-desk'
import { CampusTransfer } from './student-campus-transfer'
import { BirthDateItem, PhoneActions, ProfileSaveButton, campusProfile, coachIdsKey, createdAtText, detailTabKey, profileProblem } from './student-profile'
import { TeacherPaymentList } from './student-payments'
import { PaymentEditor } from './student-payment-editor'
import { CheckInPanel } from './student-checkins'
import { StudentPaymentHistory } from './student-payment-history'
import { FeeItems } from './student-fees'
import { AssignedCoaches, ChoiceTabs, archiveHint, canArchiveStudent, cardBalanceView, cardValidityLine, courseCoachCount, lastCheckInText, orderedStudentCards, paymentBlockReason, personName, saveActiveCardCoaches, showsCardCoaches } from './students-domain'

export function StudentDetail(props: {
  tab?: string
  student: Student
  coaches: Named[]
  campuses: Named[]
  groups: Named[]
  services: Named[]
  payments: PayRecord[]
  checks: CheckRecord[]
  financialHidden: boolean
  accessOn: boolean
  accessVisible: boolean
  feeItems: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
  parentPaidIds: number[]
  payOpen: PayLaunch | null
  setPayOpen: (value: PayLaunch | null) => void
  manage: boolean
  readOnlyText: string
  onChanged: () => Promise<void>
  onAccess: (enabled: boolean) => Promise<void>
  onLocal: (patch: Partial<Student>) => void
  onDeleted: () => void
  onCheckIn: (cardId?: number) => void
  reloadList: () => void
}) {
  const student = props.student
  const cards = orderedStudentCards(student.cards || [])
  const [activeCardId, setActiveCardId] = useState<number | undefined>(cards[0]?.id)
  const [paymentCardId, setPaymentCardId] = useState<number | undefined>(cards[0]?.id)
  const [detailTab, setDetailTab] = useState(detailTabKey(props.tab))
  useEffect(() => { setDetailTab(detailTabKey(props.tab)) }, [props.tab])
  const activeCard = cards.find((card) => card.id === activeCardId) || cards[0]
  const balance = activeCard ? cardBalanceView(activeCard) : null
  const validity = activeCard ? cardValidityLine(activeCard) : null
  const serviceNames = (activeCard?.serviceItemNames || []).map((item) => String(item || '').trim()).filter(Boolean)
  const profile = campusProfile(student, props.campuses)
  const created = createdAtText(student.createTime)
  const statusText = studentStatusText(student)
  const statusTone = statusText === '结业' ? 'graduated' : statusText === '待缴费' ? 'pending' : 'active'
  const cardFacts = [
    activeCard?.courseCategory !== false && activeCard?.studentGroupName ? { label: '课程', value: activeCard.studentGroupName } : null,
    serviceNames.length ? { label: '适用服务', value: serviceNames.join('、') } : null,
    lastCheckInText(activeCard?.lastCourseDate) ? { label: '最后打卡', value: lastCheckInText(activeCard?.lastCourseDate) } : null,
    validity ? { label: validity.label, value: validity.text } : null,
    profile.campus ? { label: profile.label, value: profile.campus } : null,
    profile.source ? { label: '来源', value: profile.source } : null,
    created ? { label: '创建时间', value: created } : null,
  ].filter((item): item is { label: string; value: string } => !!item)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [feeItemsOpen, setFeeItemsOpen] = useState(false)
  const [coachEditing, setCoachEditing] = useState(false)
  const [coachDraft, setCoachDraft] = useState<number[]>([])
  const [savingCoaches, setSavingCoaches] = useState(false)
  const coachAssignmentDisabled = Number(student.status || 0) === 2 || courseCoachCount(student, activeCard, props.groups) > 1
  const assignableCoaches = props.coaches.filter((item) => Number(item.status ?? 1) !== 0)
  useEffect(() => {
    if (activeCard?.id && activeCard.id !== activeCardId) setActiveCardId(activeCard.id)
  }, [student.id, cards.map((card) => card.id).join('|')])
  useEffect(() => { setPaymentCardId(activeCard?.id) }, [activeCard?.id])
  useEffect(() => {
    setProfileEditing(false)
    setFeeItemsOpen(false)
    setCoachEditing(false)
  }, [student.id])
  useEffect(() => { setCoachEditing(false) }, [activeCard?.id])
  async function saveProfile(values: { name: string; gender?: number; phone?: string; birthDate?: string; remark?: string }) {
    if (savingProfile) return
    const problem = profileProblem(values, student)
    if (problem === 'unchanged') return
    if (problem) {
      message.warning(problem)
      return
    }
    setSavingProfile(true)
    try {
      const birthDate = String(values.birthDate || '').trim()
      await putJson(`/students/${student.id}`, {
        ...values,
        name: values.name.trim(),
        phone: String(values.phone || '').trim(),
        birthDate: birthDate || undefined,
        clearBirthDate: !birthDate,
      })
      message.success('资料已保存')
      setProfileEditing(false)
      await props.onChanged()
      props.reloadList()
    } catch (error) {
      message.error(tell(error, '保存失败'))
    } finally {
      setSavingProfile(false)
    }
  }
  return (
    <div className="student-detail">
    {props.manage ? null : <div className="student-detail-readonly">{props.readOnlyText}</div>}
    <Tabs
      className="student-detail-tabs"
      activeKey={detailTab}
      onChange={setDetailTab}
      items={[
        {
          key: 'base',
          label: '基本信息',
          children: (
            <div className="student-detail-base">
              <section className="student-detail-overview-panel">
                <div className="student-detail-overview-main">
                  <div className="student-detail-identity">
                    <span className={`student-detail-avatar is-${Number(student.gender) === 2 ? 'female' : Number(student.gender) === 1 ? 'male' : 'neutral'}`}>{Array.from(student.name || '学')[0]}</span>
                    <div>
                      <div className="student-detail-name-row">
                        <h2>{student.name}</h2>
                        {genderText(student.gender) ? <span className={`student-detail-gender is-${Number(student.gender) === 2 ? 'female' : 'male'}`}>{genderText(student.gender)}</span> : null}
                        <span className={`student-detail-status is-${statusTone}`}>{statusText}</span>
                      </div>
                      {profile.campus ? <p>{profile.campus}</p> : null}
                    </div>
                  </div>
                  {cards.length === 1 && balance ? <div className="student-single-card-summary" aria-label={`${balance.tag}，${balance.metric} ${balance.value}`}>
                    <strong>{balance.value}</strong>
                    <span><b>{balance.tag}</b><em>{balance.metric}</em></span>
                  </div> : null}
                  {props.manage ? <div className="student-detail-quick-actions">
                    <Button disabled={Number(student.status || 0) === 2} onClick={() => setProfileEditing(true)}>编辑</Button>
                    <Button type="primary" disabled={Number(student.status || 0) === 2 || !activeCard} onClick={() => props.onCheckIn(activeCard?.id)}>打卡</Button>
                    <Button onClick={() => {
                      const reason = paymentBlockReason(student)
                      if (reason) return message.warning(reason)
                      props.setPayOpen('new')
                    }}>缴费</Button>
                  </div> : null}
                </div>
                {cards.length > 1 ? <div className="student-card-tabs" role="tablist" aria-label="切换学员卡">
                  {cards.map((card) => {
                    const cardView = cardBalanceView(card)
                    const selected = card.id === activeCard?.id
                    return <button key={card.id || `${card.cardName}-${card.studentGroupName}`} type="button" role="tab" aria-selected={selected} className={selected ? 'is-active' : ''} onClick={() => setActiveCardId(card.id)}><span>{card.cardName || card.studentGroupName || cardView.tag}</span><em>{cardView.tag} · {cardView.value}</em></button>
                  })}
                </div> : cards.length ? null : <div className="student-card-tabs"><span className="student-card-tabs-empty">暂无课程卡，请点击“编辑”新增</span></div>}
              </section>

              <div className="student-detail-side-stack">
                  <section className="student-detail-panel student-rights-panel">
                    <header className="student-detail-section-head">
                      <div>
                        <div className="student-detail-heading-line">
                          <h3>{activeCard?.cardName || activeCard?.studentGroupName || '当前卡信息'}</h3>
                          {student.phone && props.accessVisible ? <button
                            className="student-parent-access-info"
                            type="button"
                            aria-label="允许家长查看说明"
                            onClick={() => Modal.info({
                              title: '允许家长查看',
                              content: '打开右侧开关后，使用该联系电话登录的家长可在家长端查看本学员的课表、缴费记录和上课记录。默认关闭。',
                              okText: '我知道了',
                            })}
                          >i</button> : null}
                        </div>
                        <p>当前选中的课程权益</p>
                      </div>
                      {balance ? <span className="student-detail-card-type">{balance.tag}</span> : null}
                    </header>
                    {balance ? <div className="student-card-balance-inline"><span>{balance.metric}</span><strong>{balance.value}</strong></div> : null}
                    {cardFacts.length ? <dl className="student-detail-facts">
                      {cardFacts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                    </dl> : <p className="student-detail-empty-text">暂无课程与卡片信息</p>}
                    {student.phone ? <div className="student-contact-access">
                      <div className="student-contact-access-row">
                        <span>联系电话</span>
                        <div>
                          <a href={`tel:${student.phone}`}>{student.phone}</a>
                          {props.accessVisible && props.manage ? <Switch aria-label="允许家长查看" checked={props.accessOn} onChange={(checked) => props.onAccess(checked).catch((error) => message.error(tell(error, '更新失败')))} /> : null}
                        </div>
                      </div>
                      {props.accessVisible && props.manage && props.accessOn ? <Button className="student-parent-fee-entry" type="text" onClick={() => setFeeItemsOpen(true)}><span>家长可缴项目</span><em>管理</em></Button> : null}
                    </div> : null}
                  </section>

                  {props.manage && showsCardCoaches(activeCard) ? (
                    <section className="student-detail-panel student-detail-teachers">
                      <header className="student-detail-section-head">
                        <div><h3>分配的老师</h3></div>
                        <Button
                          className="student-coach-assign-link"
                          type="link"
                          disabled={coachAssignmentDisabled}
                          onClick={() => {
                            const ids = activeCard?.coachMemberIds?.length ? activeCard.coachMemberIds : (student.coachMemberIds || [])
                            setCoachDraft(Array.from(new Set(ids.map(Number).filter((id) => id > 0))))
                            setCoachEditing(true)
                          }}
                        >分配老师</Button>
                      </header>
                      <AssignedCoaches student={student} card={activeCard} coaches={props.coaches} groups={props.groups} onChanged={props.onChanged} />
                    </section>
                  ) : null}
              </div>

              {props.manage ? <section className="student-detail-panel student-actions-panel">
                <header className="student-detail-section-head">
                  <div><h3>学员操作</h3><p>{archiveHint(student)}</p></div>
                </header>
                <div className="student-detail-record-actions">
                  <CampusTransfer student={student} campuses={props.campuses} onDone={props.onChanged} />
                  <Popconfirm
                    title={`确定删除学员“${student.name}”吗？`}
                    disabled={student.canDelete === false}
                    onConfirm={async () => {
                      try {
                        await delJson(`/students/${student.id}`)
                        message.success('已删除')
                        props.onDeleted()
                      } catch (error) {
                        message.error(tell(error, '删除失败'))
                      }
                    }}
                  >
                    <Button danger disabled={student.canDelete === false}>删除学员</Button>
                  </Popconfirm>
                  {student.status !== 2 && !canArchiveStudent(student) ? (
                    <Button onClick={() => message.warning('仍有卡权益未用尽或未到期，不能归档')}>归档结业</Button>
                  ) : (
                    <Popconfirm
                      title={student.status === 2 ? '恢复在学' : '归档结业'}
                      description={student.status === 2 ? `确定将学员“${student.name}”恢复为在学状态吗？` : `确定将学员“${student.name}”归档为结业吗？归档后仍可查看历史记录。`}
                      okText={student.status === 2 ? '确认恢复' : '确认归档'}
                      cancelText="取消"
                      onConfirm={async () => {
                        try {
                          await putJson(`/students/${student.id}/status`, { status: student.status === 2 ? 1 : 2 })
                          message.success(student.status === 2 ? '已恢复在学' : '已归档结业')
                          await props.onChanged()
                          props.reloadList()
                        } catch (error) {
                          message.error(tell(error, student.status === 2 ? '恢复失败' : '归档失败'))
                        }
                      }}
                    >
                      <Button>{student.status === 2 ? '恢复在学' : '归档结业'}</Button>
                    </Popconfirm>
                  )}
                </div>
                {student.canDelete === false ? <p className="student-detail-operation-note">{student.deleteBlockedReason || '当前学员暂不满足删除条件'}</p> : null}
              </section> : null}
            </div>
          ),
        },
        {
          key: 'pay',
          label: '缴费记录',
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {props.manage && props.orders.length ? <div className="student-parent-orders">{props.orders.map((order) => (
                <div key={String(order.orderNo)}>
                  <span><strong>家长已支付，尚未入账</strong>{String(order.itemName || order.orderNo)} · ¥{money(order.amount)}</span>
                  <Button onClick={async () => {
                    try {
                      await postJson(`/parent-admin/orders/${order.orderNo}/book`)
                      message.success('已记入缴费记录')
                      await props.onChanged()
                    } catch (error) {
                      message.error(tell(error, '记入失败'))
                    }
                  }}>记入缴费</Button>
                </div>
              ))}</div> : null}
              {props.financialHidden ? <TeacherPaymentList payments={props.payments} cards={student.cards || []} /> : <StudentPaymentHistory
                student={student}
                rows={props.payments}
                parentPaidIds={props.parentPaidIds}
                manage={props.manage}
                focusCardId={activeCard?.id}
                onCardChange={(cardId) => {
                  setPaymentCardId(cardId)
                  if (cardId) setActiveCardId(cardId)
                }}
                onPay={() => {
                  const reason = paymentBlockReason(student)
                  if (reason) return message.warning(reason)
                  props.setPayOpen('new')
                }}
                setPayOpen={props.setPayOpen}
                onChanged={props.onChanged}
              />}
              <PaymentEditor
                open={props.payOpen}
                student={student}
                coaches={props.coaches}
                groups={props.groups}
                services={props.services}
                payments={props.payments}
                preferredCardId={paymentCardId || activeCard?.id}
                onClose={() => props.setPayOpen(null)}
                onSaved={async () => { props.setPayOpen(null); await props.onChanged() }}
              />
            </Space>
          ),
        },
        {
          key: 'check',
          label: '打卡记录',
          children: (
            <CheckInPanel
              student={student}
              rows={props.checks}
              payments={props.payments}
              groups={props.groups}
              financialHidden={props.financialHidden}
              coaches={props.coaches}
              focusCardId={activeCard?.id}
              onCardChange={(cardId) => { if (cardId) setActiveCardId(cardId) }}
              onCheckIn={props.onCheckIn}
              onChanged={props.onChanged}
              manage={props.manage}
            />
          ),
        },
      ]}
    />
    <Modal className="student-profile-edit-modal" title="编辑基本资料" width={720} open={profileEditing} onCancel={() => setProfileEditing(false)} footer={null} destroyOnHidden>
      <div className="student-profile-edit-shell">
        <section className="student-profile-edit-section">
          <header><h3>学员资料</h3><p>修改姓名、联系方式和基础档案</p></header>
          <Form className="student-profile-form" layout="vertical" initialValues={student} onFinish={saveProfile}>
            <div className="student-profile-grid">
              <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }, { max: 6, message: '学员姓名不能超过6个字' }]}><Input maxLength={6} /></Form.Item>
              <Form.Item name="phone" label="联系电话" extra={<PhoneActions />} rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入11位正确手机号' }]}><Input maxLength={11} placeholder="选填" /></Form.Item>
              <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
                <ChoiceTabs options={[{ value: 1, label: '男', icon: 'icon-gender-male' }, { value: 2, label: '女', icon: 'icon-gender-female' }]} />
              </Form.Item>
              <BirthDateItem />
              <Form.Item className="student-profile-wide" name="remark" label="备注"><Input.TextArea rows={3} maxLength={200} placeholder="记录需要关注的学习情况或沟通事项" /></Form.Item>
              <div className="student-profile-actions"><Button onClick={() => setProfileEditing(false)}>取消</Button><ProfileSaveButton student={student} saving={savingProfile} /></div>
            </div>
          </Form>
        </section>
        <CardDesk student={student} coaches={props.coaches} services={props.services} groups={props.groups} onChanged={props.onChanged} />
      </div>
    </Modal>
    <Modal className="student-parent-fee-modal" title="家长可缴项目" width={700} open={feeItemsOpen} onCancel={() => setFeeItemsOpen(false)} footer={null} destroyOnHidden>
      <p className="student-parent-fee-intro">家长只能选择这里配置的项目，支付成功后会直接记入缴费记录。</p>
      <FeeItems student={student} items={props.feeItems} onChanged={props.onChanged} />
    </Modal>
    <Modal
      className="student-coach-assign-modal"
      title={`为 ${student.name} 分配老师`}
      width={560}
      open={coachEditing}
      onCancel={() => setCoachEditing(false)}
      destroyOnHidden
      footer={[
        <Button key="cancel" disabled={savingCoaches} onClick={() => setCoachEditing(false)}>取消</Button>,
        <Button
          key="save"
          type="primary"
          loading={savingCoaches}
          disabled={!coachDraft.length}
          onClick={async () => {
            if (!coachDraft.length) return message.warning('请至少选择一位老师')
            if (coachIdsKey(coachDraft) === coachIdsKey(activeCard?.coachMemberIds?.length ? activeCard.coachMemberIds : student.coachMemberIds)) {
              setCoachEditing(false)
              return
            }
            setSavingCoaches(true)
            try {
              await saveActiveCardCoaches(student, activeCard, coachDraft)
              message.success('分配成功')
              setCoachEditing(false)
              await props.onChanged()
            } catch (error) {
              message.error(tell(error, '分配失败'))
            } finally {
              setSavingCoaches(false)
            }
          }}
        >确定</Button>,
      ]}
    >
      <p className="student-coach-assign-subtitle">直接选择老师即可，可多选</p>
      <div className="student-coach-assign-section-title">选择老师</div>
      {assignableCoaches.length ? <div className="student-coach-choice-grid">
        {assignableCoaches.map((coach) => {
          const selected = coachDraft.includes(Number(coach.id))
          const female = Number(coach.gender) === 2 || String(coach.gender).toLowerCase() === 'female'
          return <button
            key={coach.id}
            type="button"
            className={selected ? 'is-selected' : ''}
            aria-pressed={selected}
            onClick={() => setCoachDraft((current) => selected ? current.filter((id) => id !== coach.id) : [...current, coach.id])}
          >
            <span className={female ? 'is-female' : 'is-male'}><AppIcon name={female ? 'icon-gender-female' : 'icon-gender-male'} size={14} /></span>
            <strong>{personName(coach)}</strong>
          </button>
        })}
      </div> : <p className="student-coach-choice-empty">当前校区暂无老师</p>}
    </Modal>
    </div>
  )
}
