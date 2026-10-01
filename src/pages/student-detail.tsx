import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, postJson, putJson } from '../api/biz'
import { genderText, money, tell } from './kit'
import type { Student, Named, PayRecord, PayLaunch, CheckRecord } from './students-model'
import { CardDesk } from './student-card-desk'
import { CampusTransfer } from './student-campus-transfer'
import { BirthDateItem, CoachSaveButton, PhoneActions, ProfileSaveButton, campusProfile, coachIdsKey, createdAtText, detailTabKey, profileProblem } from './student-profile'
import { TeacherPaymentList, canAdjustPayment, canEditPayment, childPaymentDisplay, deletePaymentContent, deletePaymentPeerLabel, deletePaymentTitle, groupPayments, paymentAmountText, paymentAvgText, paymentChildLine, paymentCommissionText, paymentRemainingText, paymentRemarkText, paymentSummaryMetrics, paymentValidityCell, supplementSectionFoldable, supplementSectionTitle } from './student-payments'
import { PaymentEditor } from './student-payment-editor'
import { CheckInPanel, CourseRecords } from './student-checkins'
import { FeeItems } from './student-fees'
import { AssignedCoaches, CardRecordTabs, ChoiceTabs, CoachHint, archiveHint, canArchiveStudent, cardBalanceView, cardValidityLine, lastCheckInText, orderedStudentCards, paymentBlockReason, personName, saveActiveCardCoaches, showsCardCoaches } from './students-domain'

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
  onCheckIn: () => void
  reloadList: () => void
}) {
  const student = props.student
  const cards = orderedStudentCards(student.cards || [])
  const [activeCardId, setActiveCardId] = useState<number | undefined>(cards[0]?.id)
  const [openSupplementIds, setOpenSupplementIds] = useState<number[]>([])
  const [detailTab, setDetailTab] = useState(detailTabKey(props.tab))
  useEffect(() => { setDetailTab(detailTabKey(props.tab)) }, [props.tab])
  const activeCard = cards.find((card) => card.id === activeCardId) || cards[0]
  const activeIndex = Math.max(0, cards.findIndex((card) => card.id === activeCard?.id))
  const balance = activeCard ? cardBalanceView(activeCard) : null
  const validity = activeCard ? cardValidityLine(activeCard) : null
  const serviceNames = (activeCard?.serviceItemNames || []).map((item) => String(item || '').trim()).filter(Boolean)
  const profile = campusProfile(student, props.campuses)
  const created = createdAtText(student.createTime)
  const expiredHours = Number(activeCard?.expiredHours || 0)
  const [savingProfile, setSavingProfile] = useState(false)
  useEffect(() => {
    if (activeCard?.id && activeCard.id !== activeCardId) setActiveCardId(activeCard.id)
  }, [student.id, cards.map((card) => card.id).join('|')])
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
    {props.manage ? null : <p>{props.readOnlyText}</p>}
    <Tabs
      activeKey={detailTab}
      onChange={setDetailTab}
      items={[
        {
          key: 'base',
          label: '基本信息',
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {activeCard && balance ? (
                <>
                  <div className="card-switch">
                    {cards.length > 1 ? <Button disabled={activeIndex <= 0} onClick={() => setActiveCardId(cards[activeIndex - 1]?.id)}>上一张</Button> : <span />}
                    <div>
                      <strong>{balance.value}</strong>
                      <em>{balance.tag} · {balance.metric}{cards.length > 1 ? ` · ${activeIndex + 1}/${cards.length}` : ''}</em>
                      {expiredHours > 0 && String(activeCard.cardCategory || '').toUpperCase() === 'HOURS' ? <em className="card-switch-extra">{expiredHours}课时过期</em> : null}
                    </div>
                    {cards.length > 1 ? <Button disabled={activeIndex >= cards.length - 1} onClick={() => setActiveCardId(cards[activeIndex + 1]?.id)}>下一张</Button> : <span />}
                  </div>
                  <dl className="card-facts">
                    {activeCard.courseCategory !== false && activeCard.studentGroupName ? <><dt>课程</dt><dd>{activeCard.studentGroupName}</dd></> : null}
                    {serviceNames.length ? <><dt>服务</dt><dd>{serviceNames.join('、')}</dd></> : null}
                    {lastCheckInText(activeCard.lastCourseDate) ? <><dt>最后打卡时间</dt><dd>{lastCheckInText(activeCard.lastCourseDate)}</dd></> : null}
                    {validity ? <><dt>{validity.label}</dt><dd>{validity.text}</dd></> : null}
                    {profile.campus ? <><dt>{profile.label}</dt><dd>{profile.campus}</dd></> : null}
                    {profile.source ? <><dt>来源</dt><dd>{profile.source}</dd></> : null}
                    {created ? <><dt>创建时间</dt><dd>{created}</dd></> : null}
                  </dl>
                </>
              ) : null}
              {props.manage ? <Form
                layout="vertical"
                initialValues={student}
                onFinish={async (values: { name: string; gender?: number; phone?: string; birthDate?: string; remark?: string }) => {
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
                    await props.onChanged()
                    props.reloadList()
                  } catch (error) {
                    message.error(tell(error, '保存失败'))
                  } finally {
                    setSavingProfile(false)
                  }
                }}
              >
                <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }, { max: 6, message: '学员姓名不能超过6个字' }]}><Input maxLength={6} /></Form.Item>
                <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
                  <ChoiceTabs options={[{ value: 1, label: '男', icon: 'icon-gender-male' }, { value: 2, label: '女', icon: 'icon-gender-female' }]} />
                </Form.Item>
                <Form.Item name="phone" label="电话" extra={<PhoneActions />} rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入11位正确手机号' }]}><Input maxLength={11} /></Form.Item>
                <BirthDateItem />
                <Form.Item name="remark" label="备注"><Input.TextArea rows={2} maxLength={200} /></Form.Item>
                <ProfileSaveButton student={student} saving={savingProfile} />
              </Form> : (
                <dl className="card-facts">
                  <dt>姓名</dt><dd>{student.name}</dd>
                  <dt>性别</dt><dd>{genderText(student.gender) || '未填'}</dd>
                  {student.phone ? <><dt>电话</dt><dd>{student.phone}</dd></> : null}
                  {student.birthDate ? <><dt>出生日期</dt><dd>{student.birthDate}</dd></> : null}
                  {student.remark ? <><dt>备注</dt><dd>{student.remark}</dd></> : null}
                </dl>
              )}
              {props.manage && showsCardCoaches(activeCard) ? (
              <AssignedCoaches
                student={student}
                card={activeCard}
                coaches={props.coaches}
                groups={props.groups}
                onChanged={props.onChanged}
              />
              ) : null}
              {props.manage && showsCardCoaches(activeCard) ? (
              <Form
                key={`coaches-${activeCard?.id || student.id}`}
                layout="vertical"
                initialValues={{ coachMemberIds: activeCard?.coachMemberIds || student.coachMemberIds || [] }}
                onFinish={async (values: { coachMemberIds: number[] }) => {
                  if (Number(student.status || 0) === 2) {
                    message.warning('该学员已结业，不能调整老师')
                    return
                  }
                  const coachMemberIds = (values.coachMemberIds || []).map(Number).filter((id) => id > 0)
                  const originalIds = coachIdsKey(activeCard?.coachMemberIds?.length ? activeCard.coachMemberIds : student.coachMemberIds)
                  if (!coachMemberIds.length) {
                    message.warning('请至少选择一位老师')
                    return
                  }
                  if (coachIdsKey(coachMemberIds) === originalIds) return
                  try {
                    await saveActiveCardCoaches(student, activeCard, coachMemberIds)
                    if (!coachMemberIds.length) return
                    message.success('老师已更新')
                    await props.onChanged()
                  } catch (error) {
                    message.error(tell(error, '老师保存失败'))
                  }
                }}
              >
                <Form.Item name="coachMemberIds" label="授课老师" extra={<CoachHint />}>
                  <Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} />
                </Form.Item>
                <CoachSaveButton student={student} card={activeCard} />
              </Form>
              ) : null}
              {props.manage ? <CardDesk student={student} coaches={props.coaches} services={props.services} groups={props.groups} onChanged={props.onChanged} /> : null}
              {props.manage ? <Space direction="vertical">
                <span>{archiveHint(student)}</span>
                <Space wrap>
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
                  <CampusTransfer student={student} campuses={props.campuses} onDone={props.onChanged} />
                  <Popconfirm
                    title={`确定删除学员“${student.name}”吗？`}
                    disabled={student.canDelete === false}
                    onConfirm={async () => {
                      try {
                        await delJson(`/students/${student.id}`)
                        message.success('已删除')
                        props.reloadList()
                        props.onLocal({})
                      } catch (error) {
                        message.error(tell(error, '删除失败'))
                      }
                    }}
                  >
                    <Button danger disabled={student.canDelete === false}>删除学员</Button>
                  </Popconfirm>
                </Space>
                {student.canDelete === false ? <span>{student.deleteBlockedReason || '当前学员暂不满足删除条件'}</span> : null}
              </Space> : null}
            </Space>
          ),
        },
        {
          key: 'pay',
          label: '缴费记录',
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {props.manage ? props.orders.map((order) => (
                <Space key={String(order.orderNo)}>
                  <span>家长已支付，尚未入账 · {String(order.itemName || order.orderNo)} · {money(order.amount)}</span>
                  <Button onClick={async () => {
                    try {
                      await postJson(`/parent-admin/orders/${order.orderNo}/book`)
                      message.success('已记入缴费记录')
                      await props.onChanged()
                    } catch (error) {
                      message.error(tell(error, '记入失败'))
                    }
                  }}>记入缴费</Button>
                </Space>
              )) : null}
              {props.manage ? <Button type="primary" onClick={() => {
                const reason = paymentBlockReason(student)
                if (reason) {
                  message.warning(reason)
                  return
                }
                props.setPayOpen('new')
              }}>缴费</Button> : null}
              {props.financialHidden ? <TeacherPaymentList payments={props.payments} cards={student.cards || []} /> : (
              <CardRecordTabs cards={student.cards} rows={props.payments} focusId={activeCard?.id}>
              {(rows, card) => {
                const summary = paymentSummaryMetrics(rows, card, student, props.financialHidden)
                const paymentColumns = (kind: 'main' | 'child') => [
                  { title: '类型', dataIndex: 'typeText', render: (value: string, row: PayRecord) => `${value || row.type || ''}${props.parentPaidIds.includes(row.id) ? ' · 家长缴费' : ''}` },
                  ...(kind === 'child' ? [{ title: '说明', render: (_: unknown, row: PayRecord) => paymentChildLine(row, props.financialHidden) }] : []),
                  { title: '日期', dataIndex: 'paymentDate' },
                  { title: '课程', render: (_: unknown, row: PayRecord) => row.courseTypeLabel || row.courseType },
                  { title: '金额', render: (_: unknown, row: PayRecord) => props.financialHidden ? '' : paymentAmountText(row, kind === 'main') },
                  { title: '均价', render: (_: unknown, row: PayRecord) => props.financialHidden ? '' : paymentAvgText(row) },
                  { title: '补充', render: (_: unknown, row: PayRecord) => [paymentCommissionText(row) ? `提成：${paymentCommissionText(row)}` : '', paymentRemarkText(row)].filter(Boolean).join('；') },
                  { title: '正课', dataIndex: 'hours' },
                  { title: '赠课', dataIndex: 'giftHours' },
                  { title: '剩余', render: (_: unknown, row: PayRecord) => paymentRemainingText(row, card, student, kind) },
                  { title: '有效期', render: (_: unknown, row: PayRecord) => {
                    const view = paymentValidityCell(row, card, student, kind)
                    return view.text ? <span className={view.tone ? `pay-validity is-${view.tone}` : 'pay-validity'}>{view.text}</span> : ''
                  } },
                  {
                    title: '操作',
                    render: (_: unknown, row: PayRecord) => (
                      <Space>
                        {kind === 'main' && canAdjustPayment(row) ? <Button type="link" onClick={() => props.setPayOpen({ adjust: row })}>调整</Button> : null}
                        {(kind === 'child' ? canEditPayment(row) : row.adjustmentReason !== 'transfer') ? <Button type="link" onClick={() => props.setPayOpen(row)}>编辑</Button> : null}
                        <Button type="link" danger onClick={() => {
                          const storedService = String(row.displayMode || '').trim() === 'stored_service'
                          const hours = Number(row.totalHours ?? (Number(row.hours || 0) + Number(row.giftHours || 0)))
                          const serviceCount = Array.isArray(row.serviceRights) ? row.serviceRights.length : 0
                          Modal.confirm({
                            title: deletePaymentTitle(row),
                            content: (
                              <div>
                                <p>{deletePaymentContent(row)}</p>
                                {row.adjustmentReason === 'transfer' ? <p>关联记录：{String(row.transferTargetStudentName || '对方学员')} · {deletePaymentPeerLabel(row)}</p> : null}
                                <p>{storedService ? `服务数量：${serviceCount} 项` : `课时数：${hours} 课时`}</p>
                                <p>金额：¥{money(row.amount)}</p>
                              </div>
                            ),
                            okText: '删除',
                            okButtonProps: { danger: true },
                            cancelText: '取消',
                            onOk: async () => {
                              try {
                                await delJson(`/payment-records/${row.id}`)
                                message.success('已删除')
                                await props.onChanged()
                              } catch (error) {
                                message.error(tell(error, '删除失败，请稍后重试'))
                                throw error
                              }
                            },
                          })
                        }}>删除</Button>
                      </Space>
                    ),
                  },
                ]
                const grouped = groupPayments(rows)
                const shownColumns = (kind: 'main' | 'child') => props.manage ? paymentColumns(kind) : paymentColumns(kind).filter((column) => column.title !== '操作')
                return (
              <Space direction="vertical" style={{ width: '100%' }}>
                {summary.head ? (
                  <div className="profit-day-card">
                    <div className="stat-line"><span>{summary.head.title}{summary.head.value ? <strong>{summary.head.value}</strong> : null}</span></div>
                    {summary.head.subtitle ? <p className="schedule-meta">{summary.head.subtitle}</p> : null}
                    {summary.head.course ? <p className="schedule-meta">{summary.head.course}</p> : null}
                  </div>
                ) : null}
                {summary.metrics.length ? (
                  <div className="stat-line">
                    {summary.metrics.map((item) => <span key={item.label}>{item.label}<strong>{item.value}</strong></span>)}
                  </div>
                ) : null}
              <Table
                rowKey="id"
                dataSource={grouped}
                pagination={false}
                locale={{ emptyText: '该卡暂无缴费记录' }}
                columns={shownColumns('main')}
                expandable={{
                  rowExpandable: (row) => row.supplements.length > 0,
                  expandedRowKeys: grouped.filter((row) => row.supplements.length > 0).map((row) => row.id),
                  expandedRowRender: (row) => {
                    const title = supplementSectionTitle(row.supplements)
                    const foldable = supplementSectionFoldable(title, row.supplements.length)
                    const open = !foldable || openSupplementIds.includes(row.id)
                    const shown = (open ? row.supplements : row.supplements.slice(0, 1)).map((item) => childPaymentDisplay(item, row))
                    return (
                      <div>
                        {title === '补缴记录' || title === '退费记录' ? null : (
                          <button type="button" className="supplement-head" disabled={!foldable} onClick={() => {
                            if (!foldable) return
                            setOpenSupplementIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])
                          }}>
                            <span>{title === '金额调整记录' ? '金额调整' : title === '课时调整记录' ? '课时调整' : '调整记录'}</span>
                            <span>共 {row.supplements.length} 笔{foldable ? (open ? ' · 收起' : ' · 展开') : ''}</span>
                          </button>
                        )}
                        <Table rowKey="id" dataSource={shown} pagination={false} columns={shownColumns('child')} />
                      </div>
                    )
                  },
                }}
              />
              </Space>
                )
              }}
              </CardRecordTabs>
              )}
              <PaymentEditor
                open={props.payOpen}
                student={student}
                coaches={props.coaches}
                groups={props.groups}
                services={props.services}
                payments={props.payments}
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
              onCheckIn={props.onCheckIn}
              onChanged={props.onChanged}
              manage={props.manage}
            />
          ),
        },
        {
          key: 'lessons',
          label: '上课记录',
          children: <CourseRecords studentId={student.id} coaches={props.coaches} />,
        },
        {
          key: 'parent',
          label: '家长',
          children: props.accessVisible ? (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {props.manage ? (
                <>
                  <div>
                    允许家长查看
                    <Switch checked={props.accessOn} onChange={(checked) => props.onAccess(checked).catch((error) => message.error(tell(error, '更新失败')))} />
                  </div>
                  <p>打开右侧开关后，使用该联系电话登录的家长可在家长端查看本学员的课表、缴费记录和上课记录。默认关闭。</p>
                  {props.accessOn && student.phone ? <FeeItems student={student} items={props.feeItems} onChanged={props.onChanged} /> : null}
                  {props.accessOn && !student.phone ? <p>请先填写联系电话，才能管理家长可缴项目。</p> : null}
                </>
              ) : <p>{props.accessOn ? '家长可以查看该学员。' : '家长查看未开启。'}</p>}
            </Space>
          ) : <p>当前机构未开放家长查看。</p>,
        },
      ]}
    />
    </Space>
  )
}

