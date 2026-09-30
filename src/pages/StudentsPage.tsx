import { Button, Checkbox, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { buildQuickCheckInPaymentOptions, buildQuickCheckInServiceOptions, checkInCourseSelectWarning, checkInCourseSubmitWarning } from './checkin-options'
import { computePeriodValidityEndDate, paymentDateLabel, periodValidityError, supplementValidityError, transferTargetLabel } from './payment-rules'
import { NeedCampus, PageHead, genderText, money, studentStatusText, tell, todayIso, useShell } from './kit'

const KEYWORD_KEY = 'pc-students-keyword'

interface Student {
  id: number
  name: string
  gender?: number
  phone?: string
  birthDate?: string
  status?: number
  remark?: string
  campusId?: number
  coachMemberName?: string
  coachMemberIds?: number[]
  remainingHours?: number
  totalHours?: number
  regularHours?: number
  bonusHours?: number
  remainingAmount?: number
  totalAmount?: number
  expiredHours?: number
  cardCategory?: string
  courseCategory?: boolean
  studentGroupId?: number
  periodValidStartDate?: string
  periodValidEndDate?: string
  canDelete?: boolean
  deleteBlockedReason?: string
  cards?: Card[]
}

interface Card {
  id?: number
  cardName?: string
  cardCategory?: string
  periodType?: string
  studentGroupId?: number
  studentGroupName?: string
  remainingHours?: number
  totalHours?: number
  regularHours?: number
  bonusHours?: number
  remainingAmount?: number
  totalAmount?: number
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
  serviceItemIds?: number[]
  serviceItemNames?: string[]
  coachMemberIds?: number[]
  coachMemberNames?: string[]
  courseCategory?: boolean
  periodTypeEditable?: boolean
  canClose?: boolean
  closeBlockedReason?: string
  serviceRights?: ServiceRight[]
  status?: number
}

interface ServiceRight {
  courseType?: string
  courseTypeLabel?: string
  discount?: number
  unitPrice?: number
}

interface Named {
  id: number
  name?: string
  nickname?: string
  displayName?: string
  phone?: string
  serviceName?: string
  shortName?: string
  unitPrice?: number
  enabled?: number | boolean
  status?: number
  coachId?: number
  coachIds?: number[]
}

interface PayRecord {
  id: number
  type?: string
  typeText?: string
  amount?: number
  hours?: number
  giftHours?: number
  remainingHours?: number
  courseType?: string
  courseTypeLabel?: string
  paymentDate?: string
  paymentMethod?: number
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
  remark?: string
  studentCardId?: number
  mainRecordId?: number
  adjustmentReason?: string
  commissionEnabled?: boolean
  commissionMemberId?: number
  commissionRate?: number
  commissionAmount?: number
  transferTargetStudentId?: number
  storedValueRights?: Array<{ courseType?: string; discount?: number; unitPrice?: number }>
}

interface CheckRecord {
  id: number
  consumeDate?: string
  courseName?: string
  courseType?: string
  courseTypeLabel?: string
  coachName?: string
  coachId?: number
  hours?: number
  amount?: number
  remark?: string
  studentCardId?: number
  paymentRecordId?: number
  autoCheckIn?: number
  unitPrice?: number
}

function personName(item?: Named): string {
  return item?.displayName || item?.nickname || item?.name || item?.serviceName || item?.phone || '未命名'
}

function cardCategoryText(value?: string): string {
  const text = String(value || '').toUpperCase()
  if (text === 'STORED_VALUE') return '储值卡'
  if (text === 'PERIOD') return '时段卡'
  if (text === 'HOURS') return '课时卡'
  return value || ''
}

function checkInBounds(source?: { validStartDate?: string; validEndDate?: string; consumeDeadline?: string }): { min: string; max: string; hint: string } {
  const start = String(source?.validStartDate || '')
  const end = String(source?.validEndDate || '')
  const deadline = String(source?.consumeDeadline || '')
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (isDate(start) && isDate(end)) {
    const max = isDate(deadline) && deadline < end ? deadline : end
    return { min: start, max, hint: `仅可选择有效期内日期：${start} 至 ${max}` }
  }
  if (isDate(deadline)) return { min: '', max: deadline, hint: `仅可选择有效期至 ${deadline} 及之前的日期` }
  if (isDate(end)) return { min: '', max: end, hint: `仅可选择有效期至 ${end} 及之前的日期` }
  if (isDate(start)) return { min: start, max: '', hint: `仅可选择 ${start} 及之后的日期` }
  return { min: '', max: '', hint: '' }
}

function checkInBlockReason(student: Student, card?: Card): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能打卡'
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const amount = Number(card?.remainingAmount ?? student.remainingAmount ?? 0)
  const hours = Number(card?.remainingHours ?? student.remainingHours ?? 0)
  if (category === 'STORED_VALUE' && amount <= 0) return '剩余金额为0，不能打卡'
  if (category === 'PERIOD') {
    const end = String(card?.validEndDate || student.periodValidEndDate || '')
    const start = String(card?.validStartDate || student.periodValidStartDate || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || (/^\d{4}-\d{2}-\d{2}$/.test(start) && todayIso() < start)) return '时段卡未生效，不能打卡'
  }
  if (category !== 'STORED_VALUE' && category !== 'PERIOD' && hours <= 0) return '剩余课时为0，不能打卡'
  return ''
}

function paymentBlockReason(student: Student): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能缴费'
  const card = (student.cards || []).find((item) => item.status == null || item.status === 1) || student.cards?.[0]
  const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
  const needsCoach = category === 'HOURS' || (card ? card.courseCategory !== false : category !== 'STORED_VALUE')
  const coachIds = card?.coachMemberIds?.length ? card.coachMemberIds : student.coachMemberIds
  if (needsCoach && !(coachIds || []).length) return '请先分配老师再缴费'
  return ''
}

function canArchiveStudent(student: Student): boolean {
  if (Number(student.status || 0) === 2) return true
  const cards = student.cards?.length ? student.cards : [{ cardCategory: student.cardCategory, remainingHours: student.remainingHours, remainingAmount: student.remainingAmount, validEndDate: student.periodValidEndDate }]
  const today = todayIso()
  return cards.every((card) => {
    const category = String(card.cardCategory || 'HOURS').toUpperCase()
    if (category === 'STORED_VALUE') return Number(card.remainingAmount || 0) === 0
    if (category === 'PERIOD') return !!card.validEndDate && card.validEndDate < today
    return Number(card.remainingHours || 0) === 0
  })
}

function archiveHint(student: Student): string {
  if (Number(student.status || 0) === 2) return '该学员已结业归档，点击可恢复为在学状态'
  return canArchiveStudent(student) ? '所有卡权益均已用尽或到期，可执行结业归档' : '仍有卡存在剩余课时、余额或尚未到期，不能归档'
}

function assignBlock(student: Student, groups: Named[], coaches: Named[]): string {
  if (Number(student.status || 0) === 2) return '该学员已结业，不能分配老师'
  const card = (student.cards || []).find((item) => item.status == null || Number(item.status) === 1)
  const groupId = Number(card?.studentGroupId || student.studentGroupId || 0)
  const group = groups.find((item) => item.id === groupId)
  const coachIds = group?.coachIds?.length ? group.coachIds : (group?.coachId ? [group.coachId] : [])
  if (coachIds.length > 1) return '该课程有多位老师，不能单独分配'
  const assignable = coaches.filter((item) => Number(item.status ?? 1) !== 0)
  if (!assignable.length) return '当前校区暂无老师，请先配置校区老师'
  return ''
}

function cardRemain(card: Card | undefined, student: Student): number {
  if (card?.remainingHours != null) return Number(card.remainingHours)
  return Number(student.remainingHours || 0)
}

export function StudentsPage() {
  const shell = useShell()
  const [params, setParams] = useSearchParams()
  const [keyword, setKeyword] = useState(() => sessionStorage.getItem(KEYWORD_KEY) || '')
  const [draft, setDraft] = useState(keyword)
  const [status, setStatus] = useState<string>('all')
  const [cardCategory, setCardCategory] = useState('')
  const [coachId, setCoachId] = useState<number | undefined>()
  const [sort, setSort] = useState('remainingHours:asc')
  const [assignStudent, setAssignStudent] = useState<Student | null>(null)
  const [rows, setRows] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [coaches, setCoaches] = useState<Named[]>([])
  const [groups, setGroups] = useState<Named[]>([])
  const [services, setServices] = useState<Named[]>([])
  const [campuses, setCampuses] = useState<Named[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [detail, setDetail] = useState<Student | null>(null)
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [checks, setChecks] = useState<CheckRecord[]>([])
  const [accessOn, setAccessOn] = useState(false)
  const [accessVisible, setAccessVisible] = useState(false)
  const [feeItems, setFeeItems] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [adding, setAdding] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [checkStudent, setCheckStudent] = useState<Student | null>(null)
  const [payOpen, setPayOpen] = useState<PayRecord | 'new' | null>(null)

  const campusId = shell.campusId

  async function load(nextPage = page, nextKeyword = keyword) {
    if (!campusId) return
    setLoading(true)
    try {
      const queryStatus = status === 'graduated' ? 2 : status === 'active' || status === 'pending' ? 1 : undefined
      const data = await getJson<{ records: Student[]; total: number }>('/students/page', {
        campusId,
        name: nextKeyword,
        status: queryStatus,
        cardCategory: cardCategory || undefined,
        coachMemberId: coachId,
        sortField: sort.split(':')[0],
        sortOrder: sort.split(':')[1],
        page: nextPage,
        pageSize: status === 'pending' ? 100 : 20,
      })
      const list = data.records || []
      setRows(status === 'pending' ? list.filter((item) => studentStatusText(item) === '待缴费') : list)
      setTotal(status === 'pending' ? list.filter((item) => studentStatusText(item) === '待缴费').length : Number(data.total || 0))
      setSummary(await getJson('/students/campus-summary', { campusId, includeDetail: true }))
    } catch (error) {
      message.error(tell(error, '学员加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!campusId) return
    setPage(1)
    load(1, keyword).catch(() => undefined)
    getJson<Named[]>(`/campus-teacher/campus/${campusId}`).then(setCoaches).catch(() => setCoaches([]))
    getJson<Named[]>('/student-groups/list', { campusId }).then(setGroups).catch(() => setGroups([]))
    getJson<Named[]>(`/campus-services/${campusId}/items`).then(setServices).catch(() => setServices([]))
    getJson<Named[]>('/campus/list').then(setCampuses).catch(() => setCampuses([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, status, cardCategory, coachId, sort])

  useEffect(() => {
    const studentId = Number(params.get('studentId') || 0)
    if (studentId) openDetail(studentId).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function openDetail(id: number) {
    const student = await getJson<Student>(`/students/${id}`)
    setDetail(student)
    const bootstrap = await getJson<{ paymentRecords?: PayRecord[]; consumptions?: CheckRecord[] }>('/consumptions/course-tab-bootstrap', { studentId: id }).catch(() => null)
    setPayments(bootstrap?.paymentRecords || await getJson<PayRecord[]>(`/payment-records/student/${id}`).catch(() => []))
    setChecks(bootstrap?.consumptions || [])
    const access = await getJson<{ enabled?: boolean; visible?: boolean }>(`/parent-admin/students/${id}/access`).catch(() => null)
    setAccessVisible(Boolean(access?.visible))
    setAccessOn(Boolean(access?.enabled))
    setFeeItems(await getJson<Array<Record<string, unknown>>>(`/parent-admin/students/${id}/fee-items`).catch(() => []))
    const marks = await getJson<{ unbookedOrders?: Array<Record<string, unknown>> }>(`/parent-admin/students/${id}/pay-marks`).catch(() => null)
    setOrders(marks?.unbookedOrders || [])
  }

  function search() {
    sessionStorage.setItem(KEYWORD_KEY, draft)
    setKeyword(draft)
    setPage(1)
    load(1, draft).catch(() => undefined)
  }

  function patchStudent(id: number, patch: Partial<Student>) {
    setRows((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
    setDetail((current) => (current && current.id === id ? { ...current, ...patch } : current))
  }

  const columns = useMemo(() => [
    { title: '姓名', dataIndex: 'name' },
    { title: '性别', render: (_: unknown, row: Student) => genderText(row.gender) || '未填' },
    { title: '老师', dataIndex: 'coachMemberName', render: (value: string) => value || '待分配' },
    { title: '卡类型', render: (_: unknown, row: Student) => cardCategoryText(row.cardCategory) },
    { title: '课时', render: (_: unknown, row: Student) => `${row.remainingHours ?? 0}/${row.totalHours ?? 0}` },
    { title: '状态', render: (_: unknown, row: Student) => {
      const text = studentStatusText(row)
      const tone = text === '待缴费' ? 'status-warn' : text === '结业' ? 'status-muted' : 'status-ok'
      return <Tag className={tone}>{text}</Tag>
    } },
    { title: '待缴费', render: (_: unknown, row: Student) => studentStatusText(row) === '待缴费' ? '是' : '' },
    {
      title: '操作',
      render: (_: unknown, row: Student) => (
        <Space>
          <Button type="link" onClick={() => openDetail(row.id)}>详情</Button>
          {row.courseCategory === false ? null : <Button type="link" onClick={() => {
            const reason = assignBlock(row, groups, coaches)
            if (reason) {
              message.warning(reason)
              return
            }
            setAssignStudent(row)
          }}>分配老师</Button>}
          <Button type="link" onClick={() => {
            if (Number(row.status || 0) === 2) {
              message.warning('该学员已结业，不能打卡')
              return
            }
            setCheckStudent(row)
          }}>快捷打卡</Button>
        </Space>
      ),
    },
  ], [groups, coaches])

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="学员" extra="搜索、打卡、缴费、转校区和更换老师，与小程序使用同一套学员数据。">
        <Button type="primary" onClick={() => setAdding(true)}>新增学员</Button>
        <Button onClick={() => setTransferOpen(true)} disabled={!selected.length}>批量更换老师</Button>
      </PageHead>
      <section className="work-card">
        <div className="stat-line">
          <button type="button" className={status === 'all' && !cardCategory ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('') }}>学员<strong>{Number(summary?.studentCount || 0)}</strong></button>
          <button type="button" className={status === 'active' && !cardCategory ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('active'); setCardCategory('') }}>在学<strong>{Number(summary?.activeStudentCount || 0)}</strong></button>
          <span>剩余正课<strong>{money(summary?.remainingRegularHours)}</strong></span>
          <span>剩余赠课<strong>{money(summary?.remainingBonusHours)}</strong></span>
          <button type="button" className={cardCategory === 'STORED_VALUE' ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('STORED_VALUE') }}>储值卡<strong>{Number(summary?.storedValueCardCount || 0)}</strong></button>
          <button type="button" className={cardCategory === 'PERIOD' ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('PERIOD') }}>时段卡<strong>{Number(summary?.periodCardCount || 0)}</strong></button>
        </div>
        <div className="work-toolbar">
          <Input
            style={{ width: 220 }}
            placeholder="搜索学员"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={search}
          />
          <Button onClick={search}>搜索</Button>
          <Select
            style={{ width: 140 }}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'active', label: '在学' },
              { value: 'graduated', label: '结业' },
              { value: 'pending', label: '待缴费' },
            ]}
          />
          <Select
            style={{ width: 140 }}
            value={cardCategory}
            onChange={setCardCategory}
            options={[
              { value: '', label: '全部卡类型' },
              { value: 'HOURS', label: '课时卡' },
              { value: 'STORED_VALUE', label: '储值卡' },
              { value: 'PERIOD', label: '时段卡' },
            ]}
          />
          <Select
            style={{ width: 160 }}
            value={sort}
            onChange={setSort}
            options={[
              { value: 'remainingHours:asc', label: '剩余课时从少到多' },
              { value: 'remainingHours:desc', label: '剩余课时从多到少' },
              { value: 'totalHours:desc', label: '总课时从多到少' },
              { value: 'paymentDate:desc', label: '最近缴费' },
              { value: 'createTime:desc', label: '最近建档' },
            ]}
          />
          <Select
            allowClear
            placeholder="全部老师"
            style={{ width: 160 }}
            value={coachId}
            onChange={setCoachId}
            options={coaches.map((item) => ({ value: item.id, label: personName(item) }))}
          />
          <Button onClick={() => load()}>刷新</Button>
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys.map(Number)) }}
          pagination={{ current: page, pageSize: status === 'pending' ? 100 : 20, total, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
        />
      </section>
      <Modal title={assignStudent ? `为 ${assignStudent.name} 分配老师` : '分配老师'} open={!!assignStudent} onCancel={() => setAssignStudent(null)} footer={null} destroyOnClose>
        {assignStudent ? (
          <Form
            layout="vertical"
            initialValues={{ coachMemberIds: assignStudent.coachMemberIds || [] }}
            onFinish={async (values: { coachMemberIds?: number[] }) => {
              const coachMemberIds = Array.from(new Set((values.coachMemberIds || []).map(Number).filter((id) => id > 0)))
              if (!assignStudent.id) {
                message.warning('数据异常，请重新打开弹窗')
                return
              }
              if (!coachMemberIds.length) {
                message.warning('请至少选择一位老师')
                return
              }
              try {
                const activeCards = (assignStudent.cards || []).filter((card) => card.status == null || Number(card.status) === 1)
                const shown = activeCards.find((card) => card.courseCategory !== false) || activeCards[0]
                if (shown?.id) {
                  if (!shown.cardCategory && !assignStudent.cardCategory) {
                    message.warning('卡类型缺失，请刷新后重试')
                    return
                  }
                  await putJson(`/student-cards/${shown.id}`, {
                    cardCategory: shown.cardCategory || assignStudent.cardCategory,
                    periodType: shown.periodType,
                    courseCategory: shown.courseCategory !== false,
                    cardName: shown.cardName,
                    studentGroupId: shown.studentGroupId,
                    coachMemberIds,
                  })
                  const unionIds = Array.from(new Set(activeCards.flatMap((card) => (
                    card.id === shown.id ? coachMemberIds : (card.coachMemberIds || assignStudent.coachMemberIds || [])
                  ).map(Number).filter((id) => id > 0))))
                  await putJson(`/students/${assignStudent.id}/coaches`, unionIds.length ? unionIds : coachMemberIds)
                } else {
                  await putJson(`/students/${assignStudent.id}/coaches`, coachMemberIds)
                }
                message.success('分配成功')
                setAssignStudent(null)
                await load()
              } catch (error) {
                message.error(tell(error, '分配失败'))
              }
            }}
          >
            <Form.Item name="coachMemberIds" label="授课老师">
              <Select mode="multiple" options={coaches.filter((item) => Number(item.status ?? 1) !== 0).map((item) => ({ value: item.id, label: personName(item) }))} />
            </Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Drawer title={detail ? detail.name : '学员详情'} width={860} open={!!detail} onClose={() => { setDetail(null); setParams({}) }}>
        {detail ? (
          <StudentDetail
            student={detail}
            coaches={coaches}
            campuses={campuses}
            groups={groups}
            services={services}
            payments={payments}
            checks={checks}
            accessOn={accessOn}
            accessVisible={accessVisible}
            feeItems={feeItems}
            orders={orders}
            payOpen={payOpen}
            setPayOpen={setPayOpen}
            onChanged={() => openDetail(detail.id)}
            onAccess={async (enabled) => {
              await putJson(`/parent-admin/students/${detail.id}/access`, { enabled })
              setAccessOn(enabled)
            }}
            onLocal={(patch) => patchStudent(detail.id, patch)}
            onCheckIn={() => {
              if (Number(detail.status || 0) === 2) {
                message.warning('该学员已结业，不能打卡')
                return
              }
              setCheckStudent(detail)
            }}
            reloadList={() => load()}
          />
        ) : null}
      </Drawer>
      <AddStudent
        open={adding}
        coaches={coaches}
        groups={groups}
        services={services}
        campusId={campusId}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); load() }}
      />
      <CoachTransfer
        open={transferOpen}
        coaches={coaches}
        campusId={campusId || 0}
        studentIds={selected}
        onClose={() => setTransferOpen(false)}
        onSaved={() => { setTransferOpen(false); setSelected([]); load() }}
      />
      <QuickCheckIn
        student={checkStudent}
        coaches={coaches}
        services={services}
        groups={groups}
        onClose={() => setCheckStudent(null)}
        onDone={(studentId, hours, amount) => {
          const current = rows.find((item) => item.id === studentId)
          if (current) {
            patchStudent(studentId, {
              remainingHours: Math.max(0, Number(current.remainingHours || 0) - hours),
              remainingAmount: Math.max(0, Number(current.remainingAmount || 0) - amount),
            })
          }
          setCheckStudent(null)
          load().catch(() => undefined)
        }}
      />
    </NeedCampus>
  )
}

function StudentDetail(props: {
  student: Student
  coaches: Named[]
  campuses: Named[]
  groups: Named[]
  services: Named[]
  payments: PayRecord[]
  checks: CheckRecord[]
  accessOn: boolean
  accessVisible: boolean
  feeItems: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
  payOpen: PayRecord | 'new' | null
  setPayOpen: (value: PayRecord | 'new' | null) => void
  onChanged: () => Promise<void>
  onAccess: (enabled: boolean) => Promise<void>
  onLocal: (patch: Partial<Student>) => void
  onCheckIn: () => void
  reloadList: () => void
}) {
  const student = props.student
  return (
    <Tabs
      items={[
        {
          key: 'base',
          label: '基本信息',
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Form
                layout="vertical"
                initialValues={student}
                onFinish={async (values: { name: string; gender?: number; phone?: string; birthDate?: string; remark?: string }) => {
                  if (Number(student.status || 0) === 2) {
                    message.warning('该学员已结业，不能编辑信息')
                    return
                  }
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
                  }
                }}
              >
                <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true }, { max: 6, message: '学员姓名不能超过6个字' }]}><Input maxLength={6} /></Form.Item>
                <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}><Select options={[{ value: 1, label: '男' }, { value: 2, label: '女' }]} /></Form.Item>
                <Form.Item name="phone" label="电话" rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入11位正确手机号' }]}><Input maxLength={11} /></Form.Item>
                <Form.Item name="birthDate" label="出生日期" rules={[{ validator: validateBirthDate }]}><Input type="date" max={birthDateMax()} /></Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
                <Button type="primary" htmlType="submit" disabled={Number(student.status || 0) === 2}>保存资料</Button>
              </Form>
              <Form
                layout="vertical"
                initialValues={{ coachMemberIds: student.coachMemberIds || [] }}
                onFinish={async (values: { coachMemberIds: number[] }) => {
                  if (Number(student.status || 0) === 2) {
                    message.warning('该学员已结业，不能调整老师')
                    return
                  }
                  await putJson(`/students/${student.id}/coaches`, values.coachMemberIds || [])
                  message.success('老师已更新')
                  await props.onChanged()
                }}
              >
                <Form.Item name="coachMemberIds" label="授课老师">
                  <Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} />
                </Form.Item>
                <Button htmlType="submit">保存老师</Button>
              </Form>
              <CardDesk student={student} coaches={props.coaches} services={props.services} groups={props.groups} onChanged={props.onChanged} />
              <Space direction="vertical">
                <span>{archiveHint(student)}</span>
                <Space wrap>
                  <Popconfirm title={student.status === 2 ? `确定将学员“${student.name}”恢复为在学状态吗？` : `确定将学员“${student.name}”归档为结业吗？归档后仍可查看历史记录。`} disabled={student.status !== 2 && !canArchiveStudent(student)} onConfirm={async () => {
                    try {
                      await putJson(`/students/${student.id}/status`, { status: student.status === 2 ? 1 : 2 })
                      message.success(student.status === 2 ? '已恢复在学' : '已结业')
                      await props.onChanged()
                      props.reloadList()
                    } catch (error) {
                      message.error(tell(error, '状态更新失败'))
                    }
                  }}>
                    <Button disabled={student.status !== 2 && !canArchiveStudent(student)}>{student.status === 2 ? '恢复在学' : '归档结业'}</Button>
                  </Popconfirm>
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
              </Space>
            </Space>
          ),
        },
        {
          key: 'pay',
          label: '缴费记录',
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {props.orders.map((order) => (
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
              ))}
              <Button type="primary" onClick={() => {
                const reason = paymentBlockReason(student)
                if (reason) {
                  message.warning(reason)
                  return
                }
                props.setPayOpen('new')
              }}>缴费</Button>
              <Table
                rowKey="id"
                dataSource={props.payments}
                pagination={false}
                columns={[
                  { title: '类型', dataIndex: 'typeText', render: (value: string, row: PayRecord) => value || row.type },
                  { title: '日期', dataIndex: 'paymentDate' },
                  { title: '课程', render: (_: unknown, row: PayRecord) => row.courseTypeLabel || row.courseType },
                  { title: '金额', render: (_: unknown, row: PayRecord) => money(row.amount) },
                  { title: '正课', dataIndex: 'hours' },
                  { title: '赠课', dataIndex: 'giftHours' },
                  { title: '剩余', dataIndex: 'remainingHours' },
                  { title: '有效期', render: (_: unknown, row: PayRecord) => [row.validStartDate, row.validEndDate || row.consumeDeadline].filter(Boolean).join(' ~ ') },
                  {
                    title: '操作',
                    render: (_: unknown, row: PayRecord) => (
                      <Space>
                        <Button type="link" onClick={() => props.setPayOpen(row)}>编辑</Button>
                        <Popconfirm title="删除这条缴费记录？" onConfirm={async () => {
                          try {
                            await delJson(`/payment-records/${row.id}`)
                            message.success('已删除')
                            await props.onChanged()
                          } catch (error) {
                            message.error(tell(error, '删除失败，请稍后重试'))
                          }
                        }}>
                          <Button type="link" danger>删除</Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
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
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Button type="primary" onClick={props.onCheckIn}>打卡</Button>
                <Button onClick={() => props.onChanged()}>刷新</Button>
              </Space>
              <Table
                rowKey="id"
                dataSource={props.checks}
                pagination={false}
                columns={[
                  { title: '日期', dataIndex: 'consumeDate' },
                  { title: '课程', render: (_: unknown, row: CheckRecord) => row.courseName || row.courseTypeLabel || row.courseType },
                  { title: '老师', dataIndex: 'coachName' },
                  { title: '课时', dataIndex: 'hours' },
                  { title: '金额', render: (_: unknown, row: CheckRecord) => row.amount == null ? '' : money(row.amount) },
                  {
                    title: '操作',
                    render: (_: unknown, row: CheckRecord) => (
                      <Space>
                        <CheckEditor record={row} student={student} coaches={props.coaches} onSaved={props.onChanged} />
                        <Popconfirm title={consumptionDeleteText(row)} onConfirm={async () => {
                          try {
                            await delJson(`/consumptions/${row.id}`)
                            message.success('已删除')
                            await props.onChanged()
                          } catch (error) {
                            message.error(tell(error, '删除失败'))
                          }
                        }}>
                          <Button type="link" danger>删除</Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            </Space>
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
              <div>
                允许家长查看
                <Switch checked={props.accessOn} onChange={(checked) => props.onAccess(checked).catch((error) => message.error(tell(error, '更新失败')))} />
              </div>
              <p>打开右侧开关后，使用该联系电话登录的家长可在家长端查看本学员的课表、缴费记录和上课记录。默认关闭。</p>
              {props.accessOn && student.phone ? <FeeItems studentId={student.id} items={props.feeItems} onChanged={props.onChanged} /> : null}
              {props.accessOn && !student.phone ? <p>请先填写联系电话，才能管理家长可缴项目。</p> : null}
            </Space>
          ) : <p>当前机构未开放家长查看。</p>,
        },
      ]}
    />
  )
}

function CardDesk(props: { student: Student; coaches: Named[]; services: Named[]; groups: Named[]; onChanged: () => Promise<void> }) {
  const cards = props.student.cards || []
  const [editing, setEditing] = useState<Card | null>(null)
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <CardSummary cards={cards} />
      <CardCreate student={props.student} coaches={props.coaches} services={props.services} onChanged={props.onChanged} />
      {cards.map((card) => (
        <Space key={card.id} wrap>
          <span>{card.cardName || card.studentGroupName || cardCategoryText(card.cardCategory)}{card.status != null && card.status !== 1 ? ' · 已关闭' : ''}</span>
          <span>{(card.coachMemberNames || []).join('、')}</span>
          {card.status === 1 || card.status == null ? <Button size="small" onClick={() => setEditing(card)}>编辑</Button> : null}
          {card.canClose === false ? <span>{card.closeBlockedReason || '当前不能关闭'}</span> : card.status === 1 || card.status == null ? (
            <Popconfirm title="结清并关闭这张卡？" onConfirm={async () => {
              try {
                await postJson(`/student-cards/${card.id}/close`, {})
                message.success('卡已关闭')
                await props.onChanged()
              } catch (error) {
                message.error(tell(error, '关闭失败'))
              }
            }}>
              <Button size="small">关闭</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ))}
      <Modal title="编辑课时卡" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{
              cardName: editing.cardName,
              periodType: editing.periodType,
              studentGroupId: editing.studentGroupId,
              coachMemberIds: editing.coachMemberIds,
              serviceItemIds: editing.serviceItemIds,
              courseCategory: editing.courseCategory !== false,
              ...rightFields(editing.serviceRights),
            }}
            onFinish={async (values: CardFormValues) => {
              const category = String(editing.cardCategory || '').toUpperCase()
              const course = category === 'HOURS' || values.courseCategory !== false
              if (category === 'PERIOD' && !values.periodType) {
                message.warning('请选择时段卡类型')
                return
              }
              if (category === 'PERIOD' && editing.periodTypeEditable === false && values.periodType !== editing.periodType) {
                message.warning('时段卡已有缴费记录，不能修改卡类型')
                return
              }
              if (course && !values.studentGroupId) {
                message.warning('请选择课程')
                return
              }
              if (course && !(values.coachMemberIds || []).length) {
                message.warning('请选择老师')
                return
              }
              if (!course && category !== 'HOURS' && !(values.serviceItemIds || []).length) {
                message.warning('服务类卡必须至少选择一个适用服务')
                return
              }
              const rights = category === 'STORED_VALUE' ? serviceRightPayload(values, props.services) : undefined
              if (rights && rights.some((item) => !item.discount && !item.unitPrice)) {
                message.warning('请为每个已选服务设置折扣或折后单价')
                return
              }
              await putJson(`/student-cards/${editing.id}`, {
                cardCategory: editing.cardCategory,
                cardName: values.cardName,
                periodType: category === 'PERIOD' ? values.periodType : undefined,
                courseCategory: category === 'HOURS' ? true : values.courseCategory,
                studentGroupId: course ? values.studentGroupId || 0 : 0,
                coachMemberIds: course ? values.coachMemberIds || [] : [],
                serviceItemIds: category === 'HOURS' ? [] : values.serviceItemIds || [],
                serviceRights: rights,
              })
              message.success('课时卡已更新')
              setEditing(null)
              await props.onChanged()
            }}
          >
            <Form.Item name="cardName" label="名称"><Input /></Form.Item>
            {String(editing.cardCategory || '').toUpperCase() === 'PERIOD' ? <Form.Item name="periodType" label="时段"><PeriodTypeSelect locked={editing.periodTypeEditable === false} /></Form.Item> : null}
            {String(editing.cardCategory || '').toUpperCase() !== 'HOURS' ? <Form.Item name="courseCategory" label="包含课程" valuePropName="checked"><Switch /></Form.Item> : null}
            <Form.Item name="studentGroupId" label="课程"><Select allowClear options={props.groups.map((item) => ({ value: item.id, label: item.shortName || personName(item) }))} /></Form.Item>
            <Form.Item name="coachMemberIds" label="老师"><Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item>
            {String(editing.cardCategory || '').toUpperCase() !== 'HOURS' ? <Form.Item name="serviceItemIds" label="服务"><ServiceMultiSelect services={props.services} /></Form.Item> : null}
            {String(editing.cardCategory || '').toUpperCase() === 'STORED_VALUE' ? <StoredRights services={props.services} /> : null}
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </Space>
  )
}

function CardCreate(props: { student: Student; coaches: Named[]; services: Named[]; onChanged: () => Promise<void> }) {
  const [form] = Form.useForm<CardFormValues>()
  const category = String(Form.useWatch('cardCategory', form) || 'HOURS').toUpperCase()
  const courseOn = Form.useWatch('courseCategory', form)
  const course = category === 'HOURS' || courseOn !== false
  const services = props.services.filter((item) => item.enabled !== 0 && item.enabled !== false)
  const previousCategory = useRef('HOURS')
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ cardCategory: 'HOURS', periodType: 'MONTH', courseCategory: true }}
      onFinish={async (values) => {
        if (Number(props.student.status || 0) === 2) {
          message.warning('该学员已结业，不能新增卡类型')
          return
        }
        const nextCategory = String(values.cardCategory || '').trim().toUpperCase()
        if (!['HOURS', 'PERIOD', 'STORED_VALUE'].includes(nextCategory)) return
        const cardName = String(values.cardName || '').trim()
        if (cardName.length > 40) {
          message.warning('卡片名称不能超过40个字')
          return
        }
        if (nextCategory === 'PERIOD' && !values.periodType) {
          message.warning('请选择时段卡类型')
          return
        }
        const nextCourse = nextCategory === 'HOURS' || values.courseCategory !== false
        const coachIds = Array.from(new Set((values.coachMemberIds || []).map((id) => Number(id)).filter(Boolean)))
        const serviceIds = nextCategory === 'HOURS' ? [] : Array.from(new Set((values.serviceItemIds || []).map((id) => Number(id)).filter(Boolean)))
        if ((nextCategory === 'PERIOD' || nextCategory === 'STORED_VALUE') && !nextCourse && serviceIds.length === 0) {
          message.warning(nextCategory === 'PERIOD' ? '请为服务类时段卡选择服务' : '请为服务类储值卡选择服务')
          return
        }
        if (nextCourse && coachIds.length === 0) {
          message.warning('请至少选择一位老师')
          return
        }
        const rights = nextCategory === 'STORED_VALUE' ? serviceRightPayload({ ...values, serviceItemIds: serviceIds }, services) : undefined
        if (rights && serviceIds.length > 0 && rights.some((item) => !item.discount && !item.unitPrice)) {
          message.warning('请为每个已选服务设置折扣或折后单价')
          return
        }
        const currentCoachIds = Array.from(new Set((props.student.coachMemberIds || []).map((id) => Number(id)).filter(Boolean)))
        try {
          const legacyCourseCards = (props.student.cards || []).filter((item) => (
            Number(item.id || 0) > 0
            && (item.cardCategory === 'HOURS' || item.courseCategory !== false)
            && !Array.isArray(item.coachMemberIds)
          ))
          await Promise.all(legacyCourseCards.map((item) => putJson(`/student-cards/${item.id}`, {
            cardCategory: item.cardCategory,
            periodType: item.periodType || undefined,
            courseCategory: item.courseCategory !== false,
            cardName: item.cardName || undefined,
            coachMemberIds: currentCoachIds,
          })))
          await postJson(`/students/${props.student.id}/cards`, {
            cardName: cardName || undefined,
            cardCategory: nextCategory,
            periodType: nextCategory === 'PERIOD' ? values.periodType : undefined,
            courseCategory: nextCourse,
            coachMemberIds: nextCourse ? coachIds : [],
            serviceItemIds: serviceIds,
            serviceRights: rights,
          })
          const mergedCoachIds = Array.from(new Set([...currentCoachIds, ...coachIds]))
          const sameCoachSelection = currentCoachIds.length === mergedCoachIds.length && currentCoachIds.every((id) => mergedCoachIds.includes(id))
          if (nextCourse && !sameCoachSelection) {
            try {
              await putJson(`/students/${props.student.id}/coaches`, mergedCoachIds)
            } catch {
              message.warning('卡类型已创建，但老师分配失败，请重试')
              form.resetFields()
              await props.onChanged()
              return
            }
          }
          message.success('卡类型创建成功')
          form.resetFields()
          await props.onChanged()
        } catch (error) {
          message.error(tell(error, '创建卡类型失败'))
        }
      }}
    >
      <Form.Item name="cardName" label="名称"><Input maxLength={40} placeholder="可选，最多40个字" /></Form.Item>
      <Form.Item name="cardCategory" label="卡类型">
        <Select
          options={[{ value: 'HOURS', label: '课时卡' }, { value: 'PERIOD', label: '时段卡' }, { value: 'STORED_VALUE', label: '储值卡' }]}
          onChange={(value: string) => {
            const previous = previousCategory.current
            previousCategory.current = value
            if (value === 'HOURS') form.setFieldValue('courseCategory', true)
            else if (previous === 'HOURS') form.setFieldValue('courseCategory', false)
          }}
        />
      </Form.Item>
      {category === 'PERIOD' ? <Form.Item name="periodType" label="时段"><Select options={PERIOD_OPTIONS} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name="courseCategory" label="包含课程" valuePropName="checked"><Switch /></Form.Item> : null}
      {course ? <Form.Item name="coachMemberIds" label="老师"><Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name="serviceItemIds" label="服务"><ServiceMultiSelect services={props.services} /></Form.Item> : null}
      {category === 'STORED_VALUE' ? <StoredRights services={services} /> : null}
      <Button htmlType="submit" disabled={Number(props.student.status || 0) === 2}>新增卡</Button>
    </Form>
  )
}

export function disabledServiceWarning(services: Array<{ id: number; enabled?: number | boolean }>, current: number[] = [], next: number[] = []): string {
  const previous = new Set(current.map((id) => Number(id)))
  const blocked = next.some((id) => {
    if (previous.has(Number(id))) return false
    const service = services.find((item) => item.id === Number(id))
    return !!service && (service.enabled === false || service.enabled === 0)
  })
  return blocked ? '该服务已停用' : ''
}

function ServiceMultiSelect(props: { value?: number[]; onChange?: (value: number[]) => void; services: Named[] }) {
  return (
    <Select
      mode="multiple"
      value={props.value}
      options={props.services.map((item) => ({ value: item.id, label: personName(item) }))}
      onChange={(next: number[]) => {
        const warning = disabledServiceWarning(props.services, props.value, next)
        if (warning) {
          message.warning(warning)
          return
        }
        props.onChange?.(next)
      }}
    />
  )
}

function PeriodTypeSelect(props: { value?: string; onChange?: (value: string) => void; locked?: boolean }) {
  return (
    <Select
      value={props.value}
      options={PERIOD_OPTIONS}
      onChange={(next: string) => {
        if (props.locked && next !== props.value) {
          message.warning('时段卡已有缴费记录，不能修改卡类型')
          return
        }
        props.onChange?.(next)
      }}
    />
  )
}

const PERIOD_OPTIONS = [
  { value: 'WEEK', label: '周' },
  { value: 'MONTH', label: '月' },
  { value: 'QUARTER', label: '季' },
  { value: 'HALF_YEAR', label: '半年' },
  { value: 'YEAR', label: '年' },
]

function CardSummary({ cards }: { cards: Card[] }) {
  if (!cards.length) return <p>还没有课时卡。可在缴费时建立课时卡、时段卡或储值卡。</p>
  return (
    <div>
      {cards.map((card) => (
        <p key={card.id}>
          {card.cardName || card.studentGroupName || card.cardCategory} · 正课 {card.regularHours ?? 0} · 赠课 {card.bonusHours ?? 0} · 剩余课时 {card.remainingHours ?? 0} · 余额 {money(card.remainingAmount)} / {money(card.totalAmount)}
          {card.validEndDate || card.consumeDeadline ? ` · 有效期至 ${card.validEndDate || card.consumeDeadline}` : ''}
        </p>
      ))}
    </div>
  )
}

function CampusTransfer(props: { student: Student; campuses: Named[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [targetCampusId, setTargetCampusId] = useState<number>()
  const [transferDate, setTransferDate] = useState(todayIso())
  const [remark, setRemark] = useState('')
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [groups, setGroups] = useState<TransferOption[]>([])
  const [coaches, setCoaches] = useState<Named[]>([])
  const [services, setServices] = useState<TransferOption[]>([])
  const [drafts, setDrafts] = useState<Record<number, TransferDraft>>({})
  const [saving, setSaving] = useState(false)
  const cards = (props.student.cards || []).filter((card) => card.id && (card.status == null || card.status === 1))
  useEffect(() => {
    if (!open) return
    setTargetCampusId(undefined)
    setTransferDate(todayIso())
    setRemark('')
    setGroups([])
    setCoaches([])
    setServices([])
    let picked = false
    const next: Record<number, TransferDraft> = {}
    cards.forEach((card) => {
      const disabled = !periodTransferable(card, [])
      const selected = !disabled && !picked
      if (selected) picked = true
      next[card.id!] = { selected, hours: Number(card.remainingHours || 0), coachIds: [], serviceIds: [], discount: {}, price: {} }
    })
    setDrafts(next)
    getJson<PayRecord[]>(`/payment-records/student/${props.student.id}`).then((rows) => {
      setPayments(rows || [])
      setDrafts((current) => {
        const refreshed = { ...current }
        let chosen = false
        cards.forEach((card) => {
          const disabled = !periodTransferable(card, rows || [])
          const existing = refreshed[card.id!]
          refreshed[card.id!] = { ...(existing || { hours: Number(card.remainingHours || 0), coachIds: [], serviceIds: [], discount: {}, price: {} }), selected: !disabled && !chosen }
          if (!disabled && !chosen) chosen = true
        })
        return refreshed
      })
    }).catch(() => setPayments([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.student.id])
  useEffect(() => {
    if (!open || !targetCampusId) return
    setGroups([])
    setCoaches([])
    setServices([])
    getJson<TransferOption[]>('/student-groups/list', { campusId: targetCampusId }).then(setGroups).catch(() => setGroups([]))
    getJson<Named[]>(`/campus-teacher/campus/${targetCampusId}`).then(setCoaches).catch(() => setCoaches([]))
    getJson<TransferOption[]>(`/campus-services/${targetCampusId}/items`).then((rows) => setServices((rows || []).filter((item) => item.enabled !== 0 && item.enabled !== false))).catch(() => setServices([]))
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, { ...draft, courseId: undefined, coachIds: [], serviceIds: [], discount: {}, price: {} }])))
  }, [open, targetCampusId])
  useEffect(() => {
    if (!open || (!groups.length && !services.length)) return
    setDrafts((current) => {
      let changed = false
      const next = { ...current }
      cards.forEach((card) => {
        const draft = next[card.id!]
        if (!draft) return
        const fillCourse = groups.length === 1 && needsTransferCourse(card) && !draft.courseId
        const fillService = services.length === 1 && needsTransferService(card) && draft.serviceIds.length === 0
        if (!fillCourse && !fillService) return
        changed = true
        const group = groups[0]
        const coachIds = (group?.coachIds?.length ? group.coachIds : group?.coachId ? [group.coachId] : []).filter((id) => coaches.some((item) => item.id === id))
        next[card.id!] = {
          ...draft,
          courseId: fillCourse ? group?.id : draft.courseId,
          coachIds: fillCourse ? coachIds : draft.coachIds,
          serviceIds: fillService ? [services[0].id] : draft.serviceIds,
        }
      })
      return changed ? next : current
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups, services, coaches])
  function patch(cardId: number, patchValue: Partial<TransferDraft>) {
    setDrafts((current) => ({ ...current, [cardId]: { ...current[cardId], ...patchValue } }))
  }
  async function submit() {
    if (props.student.status === 2) {
      message.warning('结业学员不能转校区')
      return
    }
    if (!targetCampusId) {
      message.warning('请选择目标校区')
      return
    }
    const chosen = cards.filter((card) => drafts[card.id!]?.selected && periodTransferable(card, payments))
    if (cards.length && !chosen.length) {
      message.warning('请选择要转移的卡片')
      return
    }
    const cardTransfers: Array<Record<string, unknown>> = []
    for (const card of chosen) {
      const draft = drafts[card.id!]
      const category = String(card.cardCategory || '').toUpperCase()
      const hours = category === 'HOURS' ? Number(draft.hours || 0) : undefined
      const maxHours = Number(card.remainingHours || 0)
      if (hours != null && (hours < 0 || hours > maxHours + 0.000001)) {
        message.warning('转移课时不能超过当前卡剩余课时')
        return
      }
      const suggested = suggestedTransferAmount(card, payments, hours)
      const amount = draft.amount == null ? (category === 'STORED_VALUE' ? 0 : suggested) : Number(draft.amount)
      if (amount < 0 || amount > 999999.99) {
        message.warning('金额不能超过999999.99')
        return
      }
      if (category === 'STORED_VALUE' && amount > Number(card.remainingAmount || 0) + 0.000001) {
        message.warning('转移金额不能超过当前储值卡余额')
        return
      }
      if (category !== 'STORED_VALUE' && draft.amount != null && amount > suggested + 0.000001) {
        message.warning(category === 'PERIOD' ? '转移金额不能超过当前时段卡缴费金额' : '转移金额不能超过当前课时对应的可转金额')
        return
      }
      const moving = category === 'HOURS' ? (hours || 0) > 0 || amount > 0 : category === 'STORED_VALUE' ? amount > 0 : true
      const course = needsTransferCourse(card)
      const service = needsTransferService(card)
      if (moving && course && !draft.courseId) {
        message.warning('请选择目标校区对应课程')
        return
      }
      if (moving && course && !draft.coachIds.length) {
        message.warning('请选择目标校区负责老师')
        return
      }
      if (moving && service && !draft.serviceIds.length) {
        message.warning('请选择目标校区适用服务')
        return
      }
      const rights = category === 'STORED_VALUE' && service
        ? draft.serviceIds.map((id) => ({
          courseType: `service:${id}`,
          courseTypeLabel: personName(services.find((item) => item.id === id)),
          discount: Number(draft.discount[id] || 0) > 0 ? Number(draft.discount[id]) : undefined,
          unitPrice: Number(draft.price[id] || 0) > 0 ? Number(draft.price[id]) : undefined,
        }))
        : undefined
      if (moving && rights?.some((item) => !item.discount && !item.unitPrice)) {
        message.warning('请为每个已选服务设置折扣或折后单价')
        return
      }
      cardTransfers.push({
        studentCardId: card.id,
        hours,
        amount,
        targetCourseType: moving && course ? String(draft.courseId) : undefined,
        targetStudentGroupId: moving && course ? draft.courseId : undefined,
        targetCoachMemberIds: moving && course ? draft.coachIds : undefined,
        targetServiceItemIds: moving && service ? draft.serviceIds : undefined,
        targetServiceRights: rights,
      })
    }
    setSaving(true)
    try {
      await postJson(`/students/${props.student.id}/transfer-campus`, {
        targetCampusId,
        transferDate,
        remark,
        cardTransfers: cardTransfers.length ? cardTransfers : undefined,
      })
      message.success('已转校区')
      setOpen(false)
      await props.onDone()
    } catch (error) {
      message.error(tell(error, '转校区失败'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>转校区</Button>
      <Modal title="转校区" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose width={760}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="目标校区"
            style={{ width: '100%' }}
            value={targetCampusId}
            onChange={setTargetCampusId}
            options={props.campuses.filter((item) => item.id !== props.student.campusId).map((item) => ({ value: item.id, label: personName(item) }))}
          />
          <Input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} />
          <Input placeholder="备注" value={remark} onChange={(event) => setRemark(event.target.value)} />
          {cards.map((card) => {
            const draft = drafts[card.id!]
            if (!draft) return null
            const category = String(card.cardCategory || '').toUpperCase()
            const disabled = !periodTransferable(card, payments)
            const moving = category === 'HOURS' ? Number(draft.hours || 0) > 0 || Number(draft.amount || 0) > 0 : category === 'STORED_VALUE' ? Number(draft.amount || 0) > 0 : true
            const suggested = suggestedTransferAmount(card, payments, category === 'HOURS' ? Number(draft.hours || 0) : undefined)
            return (
              <div key={card.id} className="panel-block">
                <Checkbox disabled={disabled} checked={draft.selected && !disabled} onChange={(event) => patch(card.id!, { selected: event.target.checked })}>
                  {card.cardName || card.studentGroupName || cardCategoryText(card.cardCategory)}
                </Checkbox>
                <div>{disabled ? '当前没有可转移的有效期' : category === 'HOURS' ? `当前可转 ${card.remainingHours || 0} 课时` : category === 'STORED_VALUE' ? `当前可转 ${money(card.remainingAmount)}` : '有效期原样转入目标校区'}</div>
                {draft.selected && !disabled ? (
                  <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                    {category === 'HOURS' ? <InputNumber min={0} max={Number(card.remainingHours || 0)} value={draft.hours} addonBefore="课时" onChange={(value) => patch(card.id!, { hours: Number(value || 0) })} /> : null}
                    <InputNumber min={0} value={draft.amount} placeholder={suggested.toFixed(2)} addonBefore="金额" onChange={(value) => patch(card.id!, { amount: value == null ? undefined : Number(value) })} />
                    {moving && needsTransferCourse(card) ? (
                      <>
                        <Select
                          placeholder="目标校区课程"
                          style={{ width: '100%' }}
                          value={draft.courseId}
                          onChange={(value) => {
                            const group = groups.find((item) => item.id === value)
                            const coachIds = (group?.coachIds?.length ? group.coachIds : group?.coachId ? [group.coachId] : []).filter((id) => coaches.some((item) => item.id === id))
                            patch(card.id!, { courseId: value, coachIds })
                          }}
                          options={groups.map((item) => ({ value: item.id, label: item.shortName || personName(item) }))}
                        />
                        <Select mode="multiple" placeholder="目标校区老师" style={{ width: '100%' }} value={draft.coachIds} onChange={(value) => patch(card.id!, { coachIds: value })} options={coaches.map((item) => ({ value: item.id, label: personName(item) }))} />
                      </>
                    ) : null}
                    {moving && needsTransferService(card) ? (
                      <>
                        <Select mode="multiple" placeholder="目标校区服务" style={{ width: '100%' }} value={draft.serviceIds} onChange={(value) => patch(card.id!, { serviceIds: value })} options={services.map((item) => ({ value: item.id, label: personName(item) }))} />
                        {category === 'STORED_VALUE' ? draft.serviceIds.map((id) => (
                          <Space key={id} wrap>
                            <span>{personName(services.find((item) => item.id === id))}</span>
                            <InputNumber min={0} max={100} placeholder="折扣%" value={draft.discount[id]} onChange={(value) => patch(card.id!, { discount: { ...draft.discount, [id]: Number(value || 0) } })} />
                            <InputNumber min={0} placeholder="折后单价" value={draft.price[id]} onChange={(value) => patch(card.id!, { price: { ...draft.price, [id]: Number(value || 0) } })} />
                          </Space>
                        )) : null}
                      </>
                    ) : null}
                  </Space>
                ) : null}
              </div>
            )
          })}
          {!cards.length ? <p>这名学员还没有课时卡，将按原有余额转入目标校区。</p> : null}
          <Button type="primary" loading={saving} onClick={() => submit()}>确认转校</Button>
        </Space>
      </Modal>
    </>
  )
}

interface TransferOption extends Named {
  coachIds?: number[]
  coachId?: number
  enabled?: number | boolean
}

interface TransferDraft {
  selected: boolean
  hours: number
  amount?: number
  courseId?: number
  coachIds: number[]
  serviceIds: number[]
  discount: Record<number, number>
  price: Record<number, number>
}

function needsTransferCourse(card: Card): boolean {
  const category = String(card.cardCategory || '').toUpperCase()
  if (category === 'HOURS') return true
  return category === 'PERIOD' || category === 'STORED_VALUE' ? card.courseCategory !== false : false
}

function needsTransferService(card: Card): boolean {
  const category = String(card.cardCategory || '').toUpperCase()
  if (category !== 'PERIOD' && category !== 'STORED_VALUE') return false
  if (card.courseCategory === false) return true
  return (card.serviceItemIds || []).length > 0
}

function periodTransferable(card: Card, payments: PayRecord[]): boolean {
  if (String(card.cardCategory || '').toUpperCase() !== 'PERIOD') return true
  const today = todayIso()
  return payments.some((record) => (
    (!record.studentCardId || record.studentCardId === card.id)
    && (record.type === 'new' || record.type === 'renew' || (record.type === 'adjustment' && record.adjustmentReason === 'transfer'))
    && !!record.validEndDate
    && record.validEndDate >= today
  )) || (!payments.length && !!card.validEndDate && card.validEndDate >= today)
}

function suggestedTransferAmount(card: Card, payments: PayRecord[], hours?: number): number {
  const category = String(card.cardCategory || '').toUpperCase()
  const scoped = payments.filter((record) => !record.studentCardId || record.studentCardId === card.id)
  const funding = scoped.filter((record) => record.type === 'new' || record.type === 'renew' || (record.type === 'adjustment' && record.adjustmentReason === 'transfer'))
  if (category === 'STORED_VALUE') return Number(card.remainingAmount || 0)
  if (category === 'PERIOD') {
    const today = todayIso()
    const record = [...funding].reverse().find((item) => item.validEndDate && item.validEndDate >= today)
    return Number(record?.amount || 0)
  }
  const paidAmount = funding.reduce((total, record) => total + Math.max(0, Number(record.amount || 0)), 0)
  const paidHours = funding.reduce((total, record) => total + Math.max(0, Number(record.hours || 0)) + Math.max(0, Number(record.giftHours || 0)), 0)
  const maxHours = Number(card.remainingHours || 0)
  const full = paidHours > 0 ? (paidAmount / paidHours) * maxHours : 0
  if (hours == null || maxHours <= 0) return Number(full.toFixed(2))
  return Number(((full * hours) / maxHours).toFixed(2))
}

function AddStudent(props: { open: boolean; coaches: Named[]; groups: Named[]; services: Named[]; campusId: number | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal title="新增学员" open={props.open} onCancel={props.onClose} footer={null} destroyOnClose width={720}>
      <Form
        layout="vertical"
        initialValues={{ cards: [{ cardCategory: 'HOURS', courseCategory: true }] }}
        onFinish={async (values: { name: string; gender: number; phone?: string; birthDate?: string; remark?: string; cards: CardFormValues[] }) => {
          const cards = values.cards || []
          if (!cards.length) {
            message.warning('请选择至少一种卡类型')
            return
          }
          for (const card of cards) {
            const reason = cardDraftError(card)
            if (reason) {
              message.warning(reason)
              return
            }
          }
          const payloads = cards.map((card) => cardPayload(card, props.services))
          const coachIds = Array.from(new Set(payloads.flatMap((card) => card.coachMemberIds)))
          const groupIds = Array.from(new Set(payloads.map((card) => card.studentGroupId).filter((id): id is number => !!id)))
          try {
            await postJson<Student>('/students', {
              name: values.name.trim(),
              gender: values.gender,
              phone: String(values.phone || '').trim(),
              birthDate: values.birthDate || undefined,
              remark: values.remark,
              campusId: props.campusId,
              cardCategory: payloads[0].cardCategory,
              periodType: payloads[0].periodType,
              courseCategory: payloads[0].courseCategory,
              coachMemberIds: coachIds,
              studentGroupId: groupIds[0],
              studentGroupIds: groupIds,
              cards: payloads,
            })
            message.success('学员已添加')
            props.onSaved()
          } catch (error) {
            message.error(tell(error, '添加失败'))
          }
        }}
      >
        <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true }, { max: 6, message: '学员姓名不能超过6个字' }]}><Input maxLength={6} /></Form.Item>
        <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}><Select options={[{ value: 1, label: '男' }, { value: 2, label: '女' }]} /></Form.Item>
        <Form.Item name="phone" label="电话" rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入11位正确手机号' }]}><Input maxLength={11} /></Form.Item>
        <Form.Item name="birthDate" label="出生日期" rules={[{ validator: validateBirthDate }]}><Input type="date" max={birthDateMax()} /></Form.Item>
        <Form.List name="cards">
          {(fields, { add, remove }) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <CardDraft key={field.key} fieldName={field.name} index={index} coaches={props.coaches} groups={props.groups} services={props.services} onRemove={fields.length > 1 ? () => remove(field.name) : undefined} />
              ))}
              <Button onClick={() => add({ cardCategory: 'HOURS', courseCategory: true })}>再加一张卡</Button>
            </Space>
          )}
        </Form.List>
        <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        <Button type="primary" htmlType="submit">保存</Button>
      </Form>
    </Modal>
  )
}

interface CardFormValues {
  cardName?: string
  cardCategory?: string
  periodType?: string
  courseCategory?: boolean
  studentGroupId?: number
  coachMemberIds?: number[]
  serviceItemIds?: number[]
  rightDiscount?: Record<string, number>
  rightPrice?: Record<string, number>
}

function CardDraft(props: { fieldName: number; index: number; coaches: Named[]; groups: Named[]; services: Named[]; onRemove?: () => void }) {
  const category = String(Form.useWatch(['cards', props.fieldName, 'cardCategory']) || 'HOURS').toUpperCase()
  const course = category === 'HOURS' || Form.useWatch(['cards', props.fieldName, 'courseCategory']) !== false
  return (
    <div className="panel-block">
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <strong>课时卡 {props.index + 1}</strong>
        {props.onRemove ? <Button size="small" onClick={props.onRemove}>移除</Button> : null}
      </Space>
      <Form.Item name={[props.fieldName, 'cardCategory']} label="卡类型" rules={[{ required: true, message: '请选择卡类型' }]}>
        <Select options={[{ value: 'HOURS', label: '课时卡' }, { value: 'PERIOD', label: '时段卡' }, { value: 'STORED_VALUE', label: '储值卡' }]} />
      </Form.Item>
      {category === 'PERIOD' ? <Form.Item name={[props.fieldName, 'periodType']} label="时段" initialValue="MONTH"><Select options={PERIOD_OPTIONS} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name={[props.fieldName, 'courseCategory']} label="包含课程" valuePropName="checked" initialValue><Switch /></Form.Item> : null}
      {course ? <Form.Item name={[props.fieldName, 'studentGroupId']} label="课程"><Select allowClear options={props.groups.map((item) => ({ value: item.id, label: item.shortName || personName(item) }))} /></Form.Item> : null}
      {course ? <Form.Item name={[props.fieldName, 'coachMemberIds']} label="老师"><Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item> : null}
      {category !== 'HOURS' ? <Form.Item name={[props.fieldName, 'serviceItemIds']} label="服务"><ServiceMultiSelect services={props.services} /></Form.Item> : null}
      {category === 'STORED_VALUE' ? <StoredRights services={props.services} listName={props.fieldName} /> : null}
    </div>
  )
}

function StoredRights(props: { services: Named[]; listName?: number }) {
  const watchName = props.listName == null ? 'serviceItemIds' : ['cards', props.listName, 'serviceItemIds']
  const selected = (Form.useWatch(watchName) || []) as number[]
  if (!selected.length) return null
  return (
    <Space direction="vertical">
      {selected.map((id) => {
        const service = props.services.find((item) => item.id === id)
        const discountName = props.listName == null ? ['rightDiscount', String(id)] : [props.listName, 'rightDiscount', String(id)]
        const priceName = props.listName == null ? ['rightPrice', String(id)] : [props.listName, 'rightPrice', String(id)]
        return (
          <Space key={id} wrap>
            <span>{service ? personName(service) : `服务${id}`}</span>
            <Form.Item name={discountName} label="折扣%" style={{ marginBottom: 0 }}><InputNumber min={0} max={100} /></Form.Item>
            <Form.Item name={priceName} label="折后单价" style={{ marginBottom: 0 }}><InputNumber min={0} /></Form.Item>
          </Space>
        )
      })}
    </Space>
  )
}

function cardDraftError(card: CardFormValues): string {
  const category = String(card.cardCategory || '').toUpperCase()
  const course = category === 'HOURS' || card.courseCategory !== false
  if (category === 'PERIOD' && !card.periodType) return '请选择时段卡类型'
  if (course && !card.studentGroupId) return category === 'HOURS' ? '请为课时卡选择课程' : '请选择课程'
  if (course && !(card.coachMemberIds || []).length) return '请选择老师'
  if (!course && category !== 'HOURS' && !(card.serviceItemIds || []).length) return '服务类卡必须至少选择一个适用服务'
  if (category === 'STORED_VALUE' && serviceRightPayload(card, []).some((item) => !item.discount && !item.unitPrice)) return '请为每个已选服务设置折扣或折后单价'
  return ''
}

function cardPayload(card: CardFormValues, services: Named[]) {
  const category = String(card.cardCategory || 'HOURS').toUpperCase()
  const course = category === 'HOURS' || card.courseCategory !== false
  return {
    cardCategory: category,
    periodType: category === 'PERIOD' ? card.periodType || 'MONTH' : undefined,
    courseCategory: category === 'HOURS' ? true : course,
    coachMemberIds: course ? card.coachMemberIds || [] : [],
    serviceItemIds: category === 'HOURS' ? [] : card.serviceItemIds || [],
    serviceRights: category === 'STORED_VALUE' ? serviceRightPayload(card, services) : undefined,
    studentGroupId: course ? card.studentGroupId : undefined,
  }
}

function serviceRightPayload(card: CardFormValues, services: Named[]) {
  return (card.serviceItemIds || []).map((id) => {
    const discount = Number(card.rightDiscount?.[id] ?? card.rightDiscount?.[String(id)] ?? 0)
    const unitPrice = Number(card.rightPrice?.[id] ?? card.rightPrice?.[String(id)] ?? 0)
    const service = services.find((item) => item.id === id)
    return {
      courseType: `service:${id}`,
      courseTypeLabel: service ? personName(service) : undefined,
      discount: discount > 0 ? discount : undefined,
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
    }
  })
}

function rightFields(rights?: ServiceRight[]) {
  const rightDiscount: Record<string, number> = {}
  const rightPrice: Record<string, number> = {}
  ;(rights || []).forEach((right) => {
    const id = String(right.courseType || '').replace('service:', '')
    if (!id) return
    if (right.discount) rightDiscount[id] = Number(right.discount)
    if (right.unitPrice) rightPrice[id] = Number(right.unitPrice)
  })
  return { rightDiscount, rightPrice }
}

function birthDateMax(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function validateBirthDate(_: unknown, value?: string) {
  if (!value || value <= birthDateMax()) return Promise.resolve()
  return Promise.reject(new Error('出生日期须至少早于当前6个月'))
}

function CoachTransfer(props: { open: boolean; coaches: Named[]; campusId: number; studentIds: number[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal title="批量更换老师" open={props.open} onCancel={props.onClose} footer={null} destroyOnClose>
      <Form
        layout="vertical"
        onFinish={async (values: { sourceCoachMemberId: number; targetCoachMemberId: number }) => {
          const count = await postJson<number>('/students/coach-transfer', { ...values, campusId: props.campusId, studentIds: props.studentIds })
          message.success(`已更换 ${count ?? props.studentIds.length} 名学员`)
          props.onSaved()
        }}
      >
        <Form.Item name="sourceCoachMemberId" label="原老师" rules={[{ required: true }]}><Select options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item>
        <Form.Item name="targetCoachMemberId" label="新老师" rules={[{ required: true }]}><Select options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item>
        <Button type="primary" htmlType="submit">更换</Button>
      </Form>
    </Modal>
  )
}

function QuickCheckIn(props: {
  student: Student | null
  coaches: Named[]
  services: Named[]
  groups: Named[]
  onClose: () => void
  onDone: (studentId: number, hours: number, amount: number) => void
}) {
  const student = props.student
  const [full, setFull] = useState<Student | null>(null)
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [cardId, setCardId] = useState<number | undefined>()
  const [useCourse, setUseCourse] = useState(true)
  const [useService, setUseService] = useState(false)
  const [dates, setDates] = useState<string[]>([todayIso()])
  const [dateDraft, setDateDraft] = useState(todayIso())
  const [usedDates, setUsedDates] = useState<string[]>([])
  const [moreHours, setMoreHours] = useState(false)
  const [form] = Form.useForm()
  useEffect(() => {
    if (!student) return
    let active = true
    setDates([todayIso()])
    setDateDraft(todayIso())
    Promise.all([
      getJson<Student>(`/students/${student.id}`).catch(() => student),
      getJson<PayRecord[]>(`/payment-records/student/${student.id}`).catch(() => [] as PayRecord[]),
      getJson<Array<{ consumeDate?: string }>>(`/consumptions/student/${student.id}`).catch(() => [] as Array<{ consumeDate?: string }>),
    ]).then(([data, paymentRows, consumptionRows]) => {
      if (!active) return
      const loaded = data || student
      setFull(loaded)
      setPayments(paymentRows || [])
      setUsedDates((consumptionRows || []).map((item) => String(item.consumeDate || '')).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))
      const activeCards = (loaded.cards || []).filter((item) => item.status !== 0)
      const first = activeCards[0]
      setCardId(first?.id)
      if (activeCards.length > 1) return
      const serviceOnly = (String(first?.cardCategory || '').toUpperCase() === 'STORED_VALUE' || String(first?.cardCategory || '').toUpperCase() === 'PERIOD') && first?.courseCategory === false
      const paymentChoices = buildQuickCheckInPaymentOptions({ records: paymentRows || [], card: first, groups: props.groups, checkInDate: todayIso(), singleCard: true })
      const serviceChoices = buildQuickCheckInServiceOptions({ records: paymentRows || [], services: props.services, card: first, singleCard: true })
      const hasCourse = !serviceOnly && paymentChoices.some((item) => item.isSelectable !== false)
      if (!hasCourse && !serviceChoices.length) {
        message.warning(serviceOnly ? '暂无可用服务，请先缴费' : '暂无可用于打卡的缴费课程')
        props.onClose()
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [student])
  const cards = (full?.cards || []).filter((card) => card.status !== 0)
  const card = cards.find((item) => item.id === cardId) || cards[0]
  const checkDate = dates[0] || todayIso()
  const courseOptions = useMemo(() => buildQuickCheckInPaymentOptions({
    records: payments,
    card,
    groups: props.groups,
    checkInDate: checkDate,
    singleCard: cards.length <= 1,
  }), [payments, card, props.groups, checkDate, cards.length])
  const serviceOptions = useMemo(() => buildQuickCheckInServiceOptions({
    records: payments,
    services: props.services,
    card,
    singleCard: cards.length <= 1,
  }), [payments, props.services, card, cards.length])
  const selectableCourse = courseOptions.find((item) => item.isSelectable !== false)
  const expired = Boolean(card?.validEndDate && card.validEndDate < todayIso())
  const remain = cardRemain(card, full || student || { id: 0, name: '' })
  const cardCoaches = card?.coachMemberIds || []
  const serviceOnlyCard = (String(card?.cardCategory || '').toUpperCase() === 'STORED_VALUE' || String(card?.cardCategory || '').toUpperCase() === 'PERIOD') && card?.courseCategory === false
  const hasSelectableCourse = !serviceOnlyCard && !!selectableCourse
  const courseSignature = courseOptions.map((item) => `${item.id}:${item.isSelectable}:${item.courseType}`).join('|')
  const watchedPaymentId = Form.useWatch('paymentId', form)
  useEffect(() => {
    if (!card?.id) return
    setUseCourse(hasSelectableCourse)
    setUseService(!hasSelectableCourse && serviceOptions.length > 0)
    form.setFieldValue('paymentId', selectableCourse?.id)
    if (!hasSelectableCourse && serviceOptions.length === 1) form.setFieldValue('serviceId', serviceOptions[0].id)
  }, [card?.id])
  useEffect(() => {
    const current = form.getFieldValue('paymentId')
    const kept = courseOptions.find((item) => item.id === current && item.isSelectable !== false)
    const next = kept || selectableCourse
    if (current !== next?.id) form.setFieldValue('paymentId', next?.id)
  }, [courseSignature])
  if (!student) return null
  const blockReason = checkInBlockReason(full || student, card)
  return (
    <Modal title={`快捷打卡 · ${student.name}`} open onCancel={props.onClose} footer={null} destroyOnClose>
      {blockReason ? <p>{blockReason}</p> : null}
      {!courseOptions.length && !serviceOptions.length ? <p>{serviceOnlyCard ? '暂无可用服务，请先缴费' : '暂无可用于打卡的缴费课程'}</p> : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ hours: 1, serviceCount: 1 }}
        onFinish={async (values: { paymentId?: number; coachId?: number; hours?: number; serviceId?: number; serviceCount?: number; remark?: string }) => {
          if (blockReason) {
            message.warning(blockReason)
            return
          }
          const category = String(card?.cardCategory || student.cardCategory || 'HOURS').toUpperCase()
          const period = category === 'PERIOD'
          const stored = category === 'STORED_VALUE'
          const checkDates = Array.from(new Set(dates)).sort()
          if (!checkDates.length) {
            message.warning('请选择日期')
            return
          }
          if (checkDates.some((date) => date > todayIso())) {
            message.warning('不能选择未来日期')
            return
          }
          if (period && !card?.validEndDate) {
            message.warning('时段卡未生效，不能打卡')
            return
          }
          const payment = courseOptions.find((item) => item.id === values.paymentId) || selectableCourse
          const paymentBounds = payment && (payment.validStartDate || payment.validEndDate || payment.consumeDeadline) ? payment : card
          const bounds = checkInBounds(paymentBounds)
          const outOfRange = checkDates.find((date) => (bounds.min && date < bounds.min) || (bounds.max && date > bounds.max))
          if (outOfRange) {
            message.warning(bounds.min && outOfRange < bounds.min ? '未到有效期，不能打卡' : '已过有效期，不能打卡')
            return
          }
          if (!useCourse && !useService) {
            message.warning('请选择服务或课程')
            return
          }
          const items: Array<Record<string, unknown>> = []
          const datePayload = checkDates.length > 1 ? { consumeDates: checkDates } : { consumeDate: checkDates[0] }
          if (useCourse) {
            const courseWarning = checkInCourseSubmitWarning(payment)
            if (!payment || courseWarning || !String(payment.courseType || '').trim()) {
              message.warning(courseWarning || '请选择课程')
              return
            }
            if (!cardCoaches.length || !values.coachId || !cardCoaches.includes(Number(values.coachId))) {
              message.warning('请先为该课时卡分配老师')
              return
            }
            const hours = Number(values.hours || 0)
            if (!hours || hours <= 0) {
              message.warning('请输入正确的课时数')
              return
            }
            if (!stored && !period && hours * checkDates.length > remain) {
              message.warning(`剩余课时不足（${remain}）`)
              return
            }
            items.push({
              studentId: student.id,
              studentCardId: card?.id,
              consumeType: 1,
              remark: String(values.remark || '').trim(),
              coachId: values.coachId,
              coachName: personName(props.coaches.find((item) => item.id === values.coachId)),
              hours,
              paymentRecordId: payment.id || undefined,
              courseType: payment.courseType,
              courseTypeLabel: payment.courseLabel,
              ...datePayload,
            })
          }
          if (useService) {
            const service = serviceOptions.find((item) => item.id === values.serviceId)
            if (!service) {
              message.warning('请选择服务')
              return
            }
            const count = Number(values.serviceCount || 0)
            if (!Number.isFinite(count) || count <= 0) {
              message.warning('请输入正确的次数')
              return
            }
            const price = service.discountedPrice
            const totalAmount = price * count * checkDates.length
            const balance = Number(card?.remainingAmount ?? student.remainingAmount ?? 0)
            if (stored && totalAmount > balance) {
              message.warning(`剩余金额不足，剩余 ${money(balance)}，本次需 ${money(totalAmount)}`)
              return
            }
            items.push({
              studentId: student.id,
              studentCardId: card?.id,
              consumeType: 1,
              remark: String(values.remark || '').trim(),
              hours: count,
              unitPrice: price,
              amount: price * count,
              courseType: `service:${service.id}`,
              courseTypeLabel: service.name,
              ...datePayload,
            })
          }
          const duplicates = checkDates.filter((date) => usedDates.includes(date))
          if (duplicates.length) {
            const confirmed = await new Promise<boolean>((resolve) => {
              Modal.confirm({
                title: duplicates.length === 1 ? '该日期已打卡' : '部分日期已打卡',
                content: duplicates.length === 1 ? `${duplicates[0]} 已有打卡记录，是否继续打卡？` : `${duplicates.join('、')} 已有打卡记录，这些日期将被跳过。`,
                okText: duplicates.length === 1 ? '继续打卡' : '跳过并继续',
                cancelText: '取消',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              })
            })
            if (!confirmed) return
            if (duplicates.length > 1) {
              const kept = checkDates.filter((date) => !duplicates.includes(date))
              if (!kept.length) {
                message.warning('所选日期都已打卡')
                return
              }
              const nextPayload = kept.length > 1 ? { consumeDates: kept } : { consumeDate: kept[0] }
              items.forEach((item) => {
                delete item.consumeDate
                delete item.consumeDates
                Object.assign(item, nextPayload)
              })
            }
          }
          try {
            if (items.length > 1) await postJson('/consumptions/composite', { items })
            else if (items[0].consumeDates) await postJson('/consumptions/batch', items[0])
            else await postJson('/consumptions', items[0])
            const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
            const successTitle = checkDates.length > 1
              ? `已批量打卡${checkDates.length}次`
              : useCourse && useService
                ? '课程和服务打卡成功'
                : useService
                  ? '服务打卡成功'
                  : '打卡成功'
            message.success(successTitle)
            props.onDone(student.id, useCourse ? Number(values.hours || 0) * checkDates.length : 0, amount)
          } catch (error) {
            message.error(tell(error, '打卡失败'))
          }
        }}
      >
        <Form.Item label="课时卡">
          <Select value={card?.id} onChange={setCardId} options={cards.map((item) => ({ value: item.id, label: `${item.cardName || item.studentGroupName || item.cardCategory} · 剩余 ${cardRemain(item, full || student)}` }))} />
        </Form.Item>
        {expired ? <p>这张卡的有效期已过，过期日期不能打卡。</p> : null}
        <p>当前余额：课时 {remain}，金额 {money(card?.remainingAmount ?? student.remainingAmount)}。卡上没有余额时，按列表里的剩余课时兜底。</p>
        <Space>
          {serviceOnlyCard ? null : <><span>课程</span><Switch checked={useCourse} onChange={setUseCourse} /></>}
          {serviceOptions.length ? <><span>服务</span><Switch checked={useService} onChange={setUseService} /></> : null}
        </Space>
        {!hasSelectableCourse && courseOptions.some((item) => item.disabled) ? <p>{courseOptions.filter((item) => item.disabled).map((item) => item.label).join('；')}</p> : null}
        {useCourse ? (
          <>
            <Form.Item name="paymentId" label="课程" initialValue={selectableCourse?.id}>
              <Select
                options={courseOptions.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(value) => {
                  const option = courseOptions.find((item) => item.id === value)
                  const warning = checkInCourseSelectWarning(option)
                  if (!warning) return
                  message.warning(warning)
                  form.setFieldValue('paymentId', selectableCourse?.id)
                }}
              />
            </Form.Item>
            {(courseOptions.find((item) => item.id === watchedPaymentId) || selectableCourse)?.validityText ? <p>{(courseOptions.find((item) => item.id === watchedPaymentId) || selectableCourse)?.validityText}</p> : null}
            {cardCoaches.length ? (
              <Form.Item name="coachId" label="老师" initialValue={cardCoaches[0]}><Select options={props.coaches.filter((item) => cardCoaches.includes(item.id)).map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item>
            ) : <p>请先为该课时卡分配老师</p>}
            <Form.Item name="hours" label="消耗课时"><InputNumber min={0.5} step={0.5} style={{ width: '100%' }} /></Form.Item>
            <Space wrap>
              {(moreHours ? [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] : [0.5, 1, 1.5, 2]).map((hour) => (
                <Button key={hour} onClick={() => form.setFieldValue('hours', hour)}>{hour}课时</Button>
              ))}
              <Button type="link" onClick={() => setMoreHours((current) => !current)}>{moreHours ? '收起' : '更多课时'}</Button>
            </Space>
          </>
        ) : null}
        {useService ? (
          <>
            <Form.Item name="serviceId" label="具体服务"><Select options={serviceOptions.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item name="serviceCount" label="次数"><InputNumber min={1} /></Form.Item>
          </>
        ) : null}
        <Form.Item label="打卡日期">
          <Space wrap>
            <Input type="date" value={dateDraft} max={todayIso()} onChange={(event) => setDateDraft(event.target.value)} />
            <Button onClick={() => {
              if (!dateDraft) return
              if (dateDraft > todayIso()) {
                message.warning('不能选择未来日期')
                return
              }
              setDates((current) => current.includes(dateDraft) ? current : [...current, dateDraft].sort())
            }}>添加日期</Button>
          </Space>
          <Space wrap style={{ marginTop: 8 }}>
            {dates.map((date) => (
              <Tag key={date} closable={dates.length > 1} onClose={() => setDates((current) => current.filter((item) => item !== date))}>{date}{usedDates.includes(date) ? ' 已打卡' : ''}</Tag>
            ))}
          </Space>
        </Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
        <Button type="primary" htmlType="submit" disabled={!!blockReason}>确认打卡</Button>
      </Form>
      {props.groups.length === 0 ? null : null}
    </Modal>
  )
}

function decimalLimit(value: unknown): boolean {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric < 0) return false
  const scaled = Math.round(numeric * 100)
  return Math.abs(numeric * 100 - scaled) < 0.001 && Math.floor(numeric) <= 999999
}

function paymentFormError(values: Record<string, unknown>, student: Student, card?: Card, payments: PayRecord[] = [], coaches: Named[] = []) {
  if (Number(student.status) === 2) return '该学员已结业，不能缴费'
  const type = String(values.type || 'new')
  const reason = String(values.adjustmentReason || '')
  const category = String(card?.cardCategory || student.cardCategory || '').toUpperCase()
  const stored = category === 'STORED_VALUE'
  const period = category === 'PERIOD'
  const hoursCard = !stored && !period
  const amount = Number(values.amount)
  const hours = Number(values.hours || 0)
  const gift = Number(values.giftHours || 0)
  const date = String(values.paymentDate || '')
  if (!Number.isFinite(amount)) return '金额必须是有效数字'
  if (amount > 999999.99) return '金额不能超过999999.99'
  if (type !== 'adjustment' && amount <= 0) return '缴费金额必须大于0'
  if (type === 'refund' && stored && amount > Number(card?.remainingAmount || student.remainingAmount || 0) + 0.000001) {
    const refundable = Number(card?.remainingAmount || student.remainingAmount || 0)
    return refundable > 0 ? `最多可退¥${refundable.toFixed(2)}` : '当前无可退余额'
  }
  if (type !== 'adjustment' && !values.paymentMethod) return '请选择支付方式'
  if (hoursCard && !decimalLimit(values.hours)) return '正式课时最多6位整数和2位小数'
  if (hoursCard && !decimalLimit(values.giftHours)) return '赠课课时最多6位整数和2位小数'
  if (hours > 999999.99) return '正式课时不能超过999999.99'
  if (gift > 999999.99) return '赠课课时不能超过999999.99'
  if (hoursCard && (type === 'new' || type === 'renew') && hours <= 0) return '正式课时必须大于0'
  if (type === 'supplement' && (stored || period) && amount <= 0) return '请输入补缴金额'
  if (type === 'supplement' && hoursCard && hours <= 0 && gift <= 0) return '请至少填写补缴正课或赠课课时'
  const regularAvailable = Number(card?.regularHours ?? card?.remainingHours ?? student.remainingHours ?? 0)
  const giftAvailable = Number(card?.bonusHours ?? student.bonusHours ?? 0)
  if (type === 'refund' && hoursCard) {
    if (regularAvailable > 0 && hours <= 0) return '请填写退费正课'
    if (giftAvailable > 0 && gift <= 0) return '请填写退费赠课'
    if (hours <= 0 && gift <= 0) return '请填写退费正课和退费赠课'
    if (hours > regularAvailable) return `最多可退${regularAvailable}课时正课`
    if (gift > giftAvailable) return `最多可退${giftAvailable}课时赠课`
  }
  if (type === 'adjustment') {
    const amountAdjust = stored && ['manual_deduct_amount', 'manual_add_amount', 'clear_amount', 'transfer'].includes(reason)
    if (amountAdjust) {
      if (amount <= 0) return reason === 'transfer' ? '请输入转让金额' : '请输入调整金额'
      const balance = Number(card?.remainingAmount || student.remainingAmount || 0)
      if (['manual_deduct_amount', 'clear_amount', 'transfer'].includes(reason) && amount > balance + 0.000001) {
        return reason === 'transfer' ? `最多可转¥${balance.toFixed(2)}` : `最多可扣减¥${balance.toFixed(2)}`
      }
      if (reason === 'transfer' && !values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
    } else if (period && reason === 'transfer') {
      if (!values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
    } else {
      if (amount !== 0) return '课时调整金额必须为0'
      if (reason === 'manual_deduct' && hours > regularAvailable) return `最多可扣减${regularAvailable}课时正课`
      if (reason === 'transfer' && hours > regularAvailable) return `最多可转${regularAvailable}课时正课`
      if (reason === 'transfer' && gift > giftAvailable) return `最多可转${giftAvailable}课时赠课`
      if (reason === 'gift_expired' && gift > giftAvailable) return `最多可扣减${giftAvailable}课时赠课`
      if (reason === 'manual_deduct' && hours <= 0) return '请输入要扣减的正课课时'
      if (reason === 'transfer' && hours <= 0 && gift <= 0) return '请输入要转出的正课或赠课课时'
      if (reason === 'transfer' && !values.transferTargetStudentId) return `请选择${transferTargetLabel(category)}`
      if (reason === 'gift_expired' && gift <= 0) return '请输入要扣减的赠课课时'
      if (reason === 'activity_gift' && gift <= 0) return '请输入赠送的赠课课时'
      if (reason === 'clear_hours') {
        if (hours <= 0 && gift <= 0) return '请至少填写要清空的正课或赠课课时'
        if (hours > regularAvailable) return `最多可扣减${regularAvailable}课时正课`
        if (gift > giftAvailable) return `最多可扣减${giftAvailable}课时赠课`
      }
    }
  }
  if ((type === 'new' || type === 'renew' || type === 'supplement') && values.commissionEnabled) {
    if (!values.commissionMemberId) return '请选择提成人员'
    const rate = Number(values.commissionRate || 0)
    const commissionAmount = Number(values.commissionAmount || 0)
    if (!(rate > 0) && !(commissionAmount > 0)) {
      const member = coaches.find((item) => item.id === Number(values.commissionMemberId))
      return `请设置${member ? personName(member) : '提成人员'}的提成`
    }
    if (rate > 100) return '提成比例不能超过100%'
  }
  if (!date) return `请选择${paymentDateLabel(type, reason, category)}`
  const main = payments.find((item) => item.id === Number(values.mainRecordId))
  if (type === 'adjustment' && main?.paymentDate && date < main.paymentDate) return `调整日期不能早于原缴费日期 ${main.paymentDate}`
  if (type === 'refund' && date > todayIso()) return '退费日期不能是未来日期'
  const start = String(values.validStartDate || '')
  const end = String(values.validEndDate || '')
  const deadline = String(values.consumeDeadline || '')
  const periodError = periodValidityError(category, type, start, end, card?.periodType)
  if (periodError) return periodError
  const supplementError = supplementValidityError(type, category, start, end, deadline)
  if (supplementError) return supplementError
  if ((type === 'new' || type === 'renew') && (start || end) && (!start || !end)) return '请选择有效期开始和结束日期'
  if (start && end && end < start) return '有效期结束不能早于开始'
  if ((type === 'supplement' || type === 'adjustment') && !values.mainRecordId) return '缺少主缴费记录，请返回重新点击调整'
  return ''
}

function PaymentEditor(props: {
  open: PayRecord | 'new' | null
  student: Student
  coaches: Named[]
  groups: Named[]
  services: Named[]
  payments: PayRecord[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const [targets, setTargets] = useState<Array<{ id: number; name: string }>>([])
  const payType = Form.useWatch('type', form)
  const reason = Form.useWatch('adjustmentReason', form)
  const cardId = Form.useWatch('studentCardId', form)
  const commissionOn = Form.useWatch('commissionEnabled', form)
  const record = props.open && props.open !== 'new' ? props.open : undefined
  const courseOptions = [
    ...props.groups.map((item) => ({ value: String(item.id), label: item.shortName || personName(item) })),
    ...props.services.map((item) => ({ value: `service:${item.id}`, label: personName(item) })),
  ]
  const selectedCard = (props.student.cards || []).find((card) => card.id === cardId)
  const storedValue = String(selectedCard?.cardCategory || '').toUpperCase() === 'STORED_VALUE'
  async function searchTargets(keyword: string) {
    const page = await getJson<{ records: Array<{ id: number; name: string }> }>('/students/page', {
      campusId: props.student.campusId,
      name: keyword || undefined,
      status: 1,
      page: 1,
      pageSize: 8,
    })
    setTargets((page.records || []).filter((item) => item.id !== props.student.id))
  }
  if (!props.open) return null
  return (
    <Modal title={record ? '编辑缴费' : '缴费'} open onCancel={props.onClose} footer={null} destroyOnClose>
      <Form
        form={form}
        key={record?.id || 'new'}
        layout="vertical"
        onValuesChange={(changed) => {
          if (!selectedCard || String(selectedCard.cardCategory || '').toUpperCase() !== 'PERIOD' || !changed.validStartDate) return
          const end = computePeriodValidityEndDate(String(changed.validStartDate), selectedCard.periodType)
          if (end) form.setFieldValue('validEndDate', end)
        }}
        initialValues={{
          type: record?.type || 'new',
          amount: record?.amount,
          hours: record?.hours,
          giftHours: record?.giftHours,
          paymentDate: record?.paymentDate || todayIso(),
          paymentMethod: record?.paymentMethod || 2,
          courseType: record?.courseType,
          validStartDate: record?.validStartDate,
          validEndDate: record?.validEndDate,
          consumeDeadline: record?.consumeDeadline,
          remark: record?.remark,
          adjustmentReason: record?.adjustmentReason,
          studentCardId: record?.studentCardId || props.student.cards?.[0]?.id,
          mainRecordId: record?.mainRecordId,
          commissionEnabled: record?.commissionEnabled || !!record?.commissionMemberId,
          commissionMemberId: record?.commissionMemberId,
          commissionRate: record?.commissionRate,
          commissionAmount: record?.commissionAmount,
          transferTargetStudentId: record?.transferTargetStudentId,
          storedValueRights: record?.storedValueRights || [],
        }}
        onFinish={async (values) => {
          const blocked = paymentFormError(values, props.student, selectedCard, props.payments, props.coaches)
          if (blocked) {
            message.warning(blocked)
            return
          }
          const payload = {
            ...values,
            studentId: props.student.id,
            hours: values.hours ?? 0,
            giftHours: values.giftHours ?? 0,
            paymentDate: values.paymentDate || todayIso(),
            paymentMethod: values.type === 'adjustment' ? undefined : (values.paymentMethod || 2),
            commissionEnabled: !!values.commissionEnabled,
            transferTargetStudentId: values.adjustmentReason === 'transfer' ? values.transferTargetStudentId : undefined,
            storedValueRights: storedValue
              ? (values.storedValueRights || []).filter((item: { courseType?: string }) => item?.courseType)
              : undefined,
          }
          try {
            if (record) await putJson(`/payment-records/${record.id}`, payload)
            else await postJson('/payment-records', payload)
            message.success('缴费已保存')
            await props.onSaved()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          }
        }}
      >
        <Form.Item name="type" label="类型">
          <Select options={[
            { value: 'new', label: '新增' },
            { value: 'renew', label: '续费' },
            { value: 'supplement', label: '补课时' },
            { value: 'refund', label: '退费' },
            { value: 'adjustment', label: '调整' },
          ]} />
        </Form.Item>
        <Form.Item name="studentCardId" label="课时卡"><Select allowClear options={(props.student.cards || []).map((card) => ({ value: card.id, label: card.cardName || card.studentGroupName || card.cardCategory }))} /></Form.Item>
        <Form.Item name="mainRecordId" label="关联主记录（补缴、退费、调整）"><Select allowClear options={props.payments.filter((item) => item.type === 'new' || item.type === 'renew').map((item) => ({ value: item.id, label: `${item.paymentDate || ''} ${item.courseTypeLabel || item.courseType || ''}` }))} /></Form.Item>
        <Form.Item name="courseType" label="课程或服务"><Select options={courseOptions} /></Form.Item>
        {payType === 'adjustment' ? null : (
          <Form.Item name="paymentMethod" label="支付方式">
            <Select options={[
              { value: 1, label: '支付宝' },
              { value: 2, label: '微信' },
              { value: 3, label: '银行卡' },
              { value: 4, label: '公户' },
              { value: 5, label: '现金' },
            ]} />
          </Form.Item>
        )}
        <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请填写金额' }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <Form.Item name="hours" label="正课"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <Form.Item name="giftHours" label="赠课"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <Form.Item name="paymentDate" label={paymentDateLabel(String(payType || 'new'), String(reason || ''), String(selectedCard?.cardCategory || ''))}><Input type="date" /></Form.Item>
        <Form.Item name="validStartDate" label="限时开始"><Input type="date" /></Form.Item>
        <Form.Item name="validEndDate" label="限时结束"><Input type="date" /></Form.Item>
        <Form.Item name="consumeDeadline" label="有效期至"><Input type="date" /></Form.Item>
        {payType === 'adjustment' ? (
          <Form.Item name="adjustmentReason" label="调整原因" rules={[{ required: true, message: '请选择调整原因' }]}>
            <Select options={[
              { value: 'gift_expired', label: '赠课过期' },
              { value: 'manual_deduct', label: '手动扣课' },
              { value: 'activity_gift', label: '活动赠课' },
              { value: 'clear_hours', label: '清零课时' },
              { value: 'manual_deduct_amount', label: '扣减余额' },
              { value: 'manual_add_amount', label: '增加余额' },
              { value: 'clear_amount', label: '清空余额' },
              { value: 'transfer', label: '转课' },
            ]} />
          </Form.Item>
        ) : null}
        {reason === 'transfer' ? (
          <Form.Item name="transferTargetStudentId" label={transferTargetLabel(String(selectedCard?.cardCategory || ''))} rules={[{ required: true, message: `请选择${transferTargetLabel(String(selectedCard?.cardCategory || ''))}` }]}>
            <Select
              showSearch
              filterOption={false}
              placeholder="搜索学员姓名"
              onDropdownVisibleChange={(open) => { if (open) searchTargets('').catch(() => undefined) }}
              onSearch={(value) => { searchTargets(value).catch(() => undefined) }}
              options={targets.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
        ) : null}
        {storedValue ? (
          <Form.List name="storedValueRights">
            {(fields, { add, remove }) => (
              <div>
                <div className="work-toolbar">
                  <span>储值权益</span>
                  <Button onClick={() => add({ discount: 100 })}>添加课程权益</Button>
                </div>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginTop: 8 }}>
                    <Form.Item name={[field.name, 'courseType']} rules={[{ required: true, message: '请选择课程' }]}>
                      <Select style={{ width: 180 }} placeholder="课程或服务" options={courseOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'discount']}><InputNumber min={0} max={100} placeholder="折扣%" /></Form.Item>
                    <Form.Item name={[field.name, 'unitPrice']}><InputNumber min={0} placeholder="单价" /></Form.Item>
                    <Button type="link" onClick={() => remove(field.name)}>移除</Button>
                  </Space>
                ))}
              </div>
            )}
          </Form.List>
        ) : null}
        <Form.Item name="commissionEnabled" label="提成" valuePropName="checked"><Switch /></Form.Item>
        {commissionOn ? (
          <>
            <Form.Item name="commissionMemberId" label="提成老师" rules={[{ required: true, message: '请选择提成人员' }]}>
              <Select options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} />
            </Form.Item>
            <Form.Item name="commissionRate" label="提成比例（%）"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item>
            <Form.Item name="commissionAmount" label="提成金额"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </>
        ) : null}
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
        <Button type="primary" htmlType="submit">保存</Button>
      </Form>
    </Modal>
  )
}

function CourseRecords(props: { studentId: number; coaches: Named[] }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [coachId, setCoachId] = useState<number | undefined>()
  const [courseName, setCourseName] = useState('')
  async function load(nextCoach = coachId, nextCourse = courseName) {
    const data = await getJson<Array<Record<string, unknown>>>(`/schedules/student/${props.studentId}/records`, {
      coachId: nextCoach,
      courseName: nextCourse.trim() || undefined,
    })
    setRows(data || [])
  }
  useEffect(() => {
    load().catch((error) => message.error(tell(error, '上课记录加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.studentId])
  const totalHours = rows.reduce((sum, row) => sum + lessonHours(row.duration), 0)
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div className="stat-line">
        <span>上课次数<strong>{rows.length}</strong></span>
        <span>消耗课时<strong>{money(totalHours)}</strong></span>
      </div>
      <div className="work-toolbar">
        <Select
          allowClear
          placeholder="老师"
          style={{ width: 160 }}
          value={coachId}
          onChange={(value) => { setCoachId(value); load(value, courseName).catch((error) => message.error(tell(error, '上课记录加载失败'))) }}
          options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))}
        />
        <Input.Search allowClear placeholder="课程名称" style={{ width: 200 }} onSearch={(value) => { setCourseName(value); load(coachId, value).catch((error) => message.error(tell(error, '上课记录加载失败'))) }} />
      </div>
      {!rows.length ? <p>暂无上课记录</p> : null}
      <Table
        rowKey={(row) => String(row.id)}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '日期', render: (_: unknown, row: Record<string, unknown>) => String(row.displayDateStr || row.scheduleDate || row.displayDate || '') },
          { title: '星期', render: (_: unknown, row: Record<string, unknown>) => weekdayOf(String(row.displayDateStr || row.scheduleDate || row.displayDate || '')) },
          { title: '时间', render: (_: unknown, row: Record<string, unknown>) => `${String(row.startTimeStr || row.startTime || '').slice(0, 5)}-${String(row.endTimeStr || row.endTime || '').slice(0, 5)}` },
          { title: '课程', dataIndex: 'courseName' },
          { title: '老师', dataIndex: 'coachName' },
          { title: '课时', render: (_: unknown, row: Record<string, unknown>) => money(lessonHours(row.duration)) },
        ]}
      />
    </Space>
  )
}

function lessonHours(duration: unknown): number {
  const minutes = Number(duration || 0)
  if (!minutes) return 0
  return Math.round(minutes / 60 * 10) / 10
}

function weekdayOf(value: string): string {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

function formatDeleteAmount(value?: number): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0.00'
  const [integerPart, decimalPart] = numeric.toFixed(2).split('.')
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`
}

function formatDeleteHours(value?: number): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Math.abs(numeric - Math.round(numeric)) < 0.000001) return String(Math.round(numeric))
  return String(Number(numeric.toFixed(2)))
}

function consumptionDeleteText(row: CheckRecord): string {
  const service = String(row.courseType || '').startsWith('service:')
  const rollback = service ? `删除后将返还 ¥${formatDeleteAmount(row.amount)}。` : `删除后将返还 ${formatDeleteHours(row.hours)} 课时。`
  const auto = !service && Number(row.autoCheckIn) === 1
    ? '该记录为自动打卡，删除后会同步清理对应课表中的该学员；如果该节课已无其他学员，还会一并删除整条课表。'
    : ''
  return `确定删除 ${row.consumeDate || ''} 的${service ? '服务记录' : '打卡记录'}吗？${rollback}${auto}`
}

function CheckEditor(props: { record: CheckRecord; student: Student; coaches: Named[]; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const service = String(props.record.courseType || '').startsWith('service:')
  const card = (props.student.cards || []).find((item) => item.id === props.record.studentCardId)
  const category = String(card?.cardCategory || props.student.cardCategory || '').toUpperCase()
  return (
    <>
      <Button type="link" onClick={() => setOpen(true)}>编辑</Button>
      <Modal title="编辑打卡" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={props.record}
          onFinish={async (values: { consumeDate?: string; hours?: number; remark?: string; coachId?: number }) => {
            if (!values.consumeDate) {
              message.warning('请选择日期')
              return
            }
            if (values.consumeDate > todayIso()) {
              message.warning('不能选择未来日期')
              return
            }
            const hours = Number(values.hours || 0)
            if (!hours || hours <= 0) {
              message.warning(service ? '请输入正确的次数' : '请输入正确的课时数')
              return
            }
            if (!service && !values.coachId) {
              message.warning('请选择老师')
              return
            }
            const period = category === 'PERIOD'
            const stored = category === 'STORED_VALUE'
            if (!service && !stored && !period) {
              const remaining = Number(card?.remainingHours ?? props.student.remainingHours ?? 0)
              const diff = hours - Number(props.record.hours || 0)
              if (diff > remaining) {
                message.warning(`剩余课时不足（${remaining}）`)
                return
              }
            }
            const coach = props.coaches.find((item) => item.id === values.coachId)
            const originHours = Number(props.record.hours || 0)
            const unitPrice = Number(props.record.unitPrice || 0) > 0
              ? Number(props.record.unitPrice)
              : originHours > 0 ? Number(props.record.amount || 0) / originHours : 0
            try {
              await putJson(`/consumptions/${props.record.id}`, service ? {
                studentId: props.student.id,
                studentCardId: props.record.studentCardId,
                hours,
                paymentRecordId: props.record.paymentRecordId || undefined,
                unitPrice,
                amount: unitPrice * hours,
                courseType: props.record.courseType,
                courseTypeLabel: props.record.courseTypeLabel,
                consumeDate: values.consumeDate,
                remark: String(values.remark || '').trim(),
              } : {
                studentId: props.student.id,
                studentCardId: props.record.studentCardId,
                coachName: coach ? personName(coach) : props.record.coachName,
                coachId: values.coachId,
                hours,
                paymentRecordId: props.record.paymentRecordId || undefined,
                courseType: props.record.courseType,
                consumeDate: values.consumeDate,
                remark: String(values.remark || '').trim(),
              })
              message.success('已保存')
              setOpen(false)
              await props.onSaved()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="consumeDate" label="日期"><Input type="date" max={todayIso()} /></Form.Item>
          {service ? null : <Form.Item name="coachId" label="老师" rules={[{ required: true, message: '请选择老师' }]}><Select options={props.coaches.map((item) => ({ value: item.id, label: personName(item) }))} /></Form.Item>}
          <Form.Item name="hours" label={service ? '次数' : '课时'}><InputNumber min={service ? 1 : 0.5} step={service ? 1 : 0.5} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
    </>
  )
}

function FeeItems(props: { studentId: number; items: Array<Record<string, unknown>>; onChanged: () => Promise<void> }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Form
        layout="inline"
        onFinish={async (values: { name: string; amount: number; hours?: number; courseType?: string }) => {
          try {
            await postJson(`/parent-admin/students/${props.studentId}/fee-items`, {
              name: values.name,
              amount: values.amount,
              charge: { type: 'new', hours: values.hours || 0, courseType: values.courseType, paymentMethod: 2 },
            })
            message.success('已添加可缴项目')
            await props.onChanged()
          } catch (error) {
            message.error(tell(error, '添加失败'))
          }
        }}
      >
        <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="项目名称" /></Form.Item>
        <Form.Item name="amount" rules={[{ required: true }]}><InputNumber placeholder="金额" /></Form.Item>
        <Form.Item name="hours"><InputNumber placeholder="课时" /></Form.Item>
        <Form.Item name="courseType"><Input placeholder="课程" /></Form.Item>
        <Button htmlType="submit">添加</Button>
      </Form>
      {props.items.map((item) => (
        <Space key={String(item.id)}>
          <span>{String(item.name || '')} · {money(item.amount)}</span>
          <Switch
            checked={Boolean(item.enabled)}
            onChange={async (enabled) => {
              try {
                await putJson(`/parent-admin/fee-items/${item.id}/enabled`, { enabled })
                await props.onChanged()
              } catch (error) {
                message.error(tell(error, '更新失败'))
              }
            }}
          />
          <Popconfirm title="删除这个可缴项目？" onConfirm={async () => {
            try {
              await delJson(`/parent-admin/fee-items/${item.id}`)
              await props.onChanged()
            } catch (error) {
              message.error(tell(error, '删除失败'))
            }
          }}>
            <Button type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ))}
      {!props.items.length ? <p>还没有家长可缴项目。</p> : null}
    </Space>
  )
}
