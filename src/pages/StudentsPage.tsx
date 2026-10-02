import { Button, Drawer, Form, Input, Modal, Select, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getJson, putJson } from '../api/biz'
import { AppIcon, NeedCampus, PageHead, genderText, money, studentStatusText, tell, useShell } from './kit'
import { StudentDetail } from './student-detail'
import { AddStudent, CoachTransfer } from './student-profile'
import { QuickCheckIn } from './student-quick-checkin'
import type { CheckRecord, Named, PayLaunch, PayRecord, Student } from './students-model'
import {
  CatalogHold, CatalogLoadContext, assignBlock, campusOffline, cardBalanceView,
  hasTeacherVisibleStudentCard, listBalanceText, listCardCategory, listCoachText,
  listDisplayCard, listServiceOnly, managesStudents, orderedStudentCards, personName, studentQuotaBlock,
  teacherVisibleStudent, type CatalogLoad, type CatalogStatus,
} from './students-domain'

const KEYWORD_KEY = 'pc-students-keyword'
type StudentSortField = 'remainingHours' | 'totalHours' | 'paymentDate' | 'createTime'
type StudentSortOrder = 'asc' | 'desc'

const STUDENT_SORT_FIELDS: Array<{ value: StudentSortField; label: string }> = [
  { value: 'remainingHours', label: '剩余课时' },
  { value: 'totalHours', label: '总课时' },
  { value: 'paymentDate', label: '缴费时间' },
  { value: 'createTime', label: '建档时间' },
]

function CoachTransferLauncher(props: { coaches: Named[]; campusId: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>批量更换老师</Button>
      <CoachTransfer
        open={open}
        coaches={props.coaches}
        campusId={props.campusId}
        studentIds={[]}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          props.onSaved()
        }}
      />
    </>
  )
}

export function StudentsPage() {
  const shell = useShell()
  const [params, setParams] = useSearchParams()
  const [keyword, setKeyword] = useState(() => sessionStorage.getItem(KEYWORD_KEY) || '')
  const [draft, setDraft] = useState(keyword)
  const [status, setStatus] = useState<string>('active')
  const [cardCategory, setCardCategory] = useState('')
  const [coachId, setCoachId] = useState<number | undefined>()
  const [sortField, setSortField] = useState<StudentSortField>('remainingHours')
  const [sortOrder, setSortOrder] = useState<StudentSortOrder>('asc')
  const [assignStudent, setAssignStudent] = useState<Student | null>(null)
  const [rows, setRows] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [coaches, setCoaches] = useState<Named[]>([])
  const [groups, setGroups] = useState<Named[]>([])
  const [services, setServices] = useState<Named[]>([])
  const [groupsStatus, setGroupsStatus] = useState<CatalogStatus>('loading')
  const [coachesStatus, setCoachesStatus] = useState<CatalogStatus>('loading')
  const [servicesStatus, setServicesStatus] = useState<CatalogStatus>('loading')
  const catalogSeq = useRef({ groups: 0, coaches: 0, services: 0 })
  const [campuses, setCampuses] = useState<Named[]>([])
  const [detail, setDetail] = useState<Student | null>(null)
  const [payments, setPayments] = useState<PayRecord[]>([])
  const [checks, setChecks] = useState<CheckRecord[]>([])
  const [financialHidden, setFinancialHidden] = useState(false)
  const [accessOn, setAccessOn] = useState(false)
  const [accessVisible, setAccessVisible] = useState(false)
  const [feeItems, setFeeItems] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [parentPaidIds, setParentPaidIds] = useState<number[]>([])
  const [adding, setAdding] = useState(false)
  const [checkStudent, setCheckStudent] = useState<Student | null>(null)
  const [checkCardId, setCheckCardId] = useState<number | undefined>()
  const [checkCardLocked, setCheckCardLocked] = useState(false)
  const [payOpen, setPayOpen] = useState<PayLaunch | null>(null)
  const [campusHidden, setCampusHidden] = useState(false)

  const campusId = shell.campusId
  const reloadGroups = useCallback(() => {
    const id = campusId
    const seq = ++catalogSeq.current.groups
    if (!id) {
      setGroups([])
      setGroupsStatus('ready')
      return
    }
    setGroupsStatus('loading')
    getJson<Named[]>('/student-groups/list', { campusId: id, includeInternal: true }).then((rows) => {
      if (seq !== catalogSeq.current.groups) return
      setGroups(rows || [])
      setGroupsStatus('ready')
    }).catch(() => {
      if (seq !== catalogSeq.current.groups) return
      setGroupsStatus('failed')
      message.warning('加载课程失败')
    })
  }, [campusId])
  const reloadCoaches = useCallback(() => {
    const id = campusId
    const seq = ++catalogSeq.current.coaches
    if (!id) {
      setCoaches([])
      setCoachesStatus('ready')
      return
    }
    setCoachesStatus('loading')
    getJson<Named[]>(`/campus-teacher/campus/${id}`).then((rows) => {
      if (seq !== catalogSeq.current.coaches) return
      setCoaches(rows || [])
      setCoachesStatus('ready')
    }).catch(() => {
      if (seq !== catalogSeq.current.coaches) return
      setCoachesStatus('failed')
      message.warning('加载老师失败')
    })
  }, [campusId])
  const reloadServices = useCallback(() => {
    const id = campusId
    const seq = ++catalogSeq.current.services
    if (!id) {
      setServices([])
      setServicesStatus('ready')
      return
    }
    setServicesStatus('loading')
    getJson<Named[]>(`/campus-services/${id}/items`).then((rows) => {
      if (seq !== catalogSeq.current.services) return
      setServices(rows || [])
      setServicesStatus('ready')
    }).catch(() => {
      if (seq !== catalogSeq.current.services) return
      setServicesStatus('failed')
      message.warning('加载服务失败')
    })
  }, [campusId])
  const catalogLoad = useMemo<CatalogLoad>(() => ({
    groups: groupsStatus,
    coaches: coachesStatus,
    services: servicesStatus,
    retryGroups: reloadGroups,
    retryCoaches: reloadCoaches,
    retryServices: reloadServices,
  }), [groupsStatus, coachesStatus, servicesStatus, reloadGroups, reloadCoaches, reloadServices])
  const userReady = Number(shell.user?.id || 0) > 0
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const canManageRole = userReady && managesStudents(shell.user, currentOrg, campusId)
  const canManage = canManageRole && !campusHidden
  const scopedCoachId = canManageRole ? coachId : (Number(shell.user?.orgMemberId || 0) || undefined)
  const readOnlyText = campusHidden ? '校区已下线，学员信息仅可查看' : '当前账号仅可查看学员信息'

  async function load(nextPage = page, nextKeyword = keyword) {
    if (!campusId) return
    setLoading(true)
    try {
      const queryStatus = status === 'graduated' ? 2 : status === 'active' ? 1 : status === 'pending' ? 3 : undefined
      const [data, summaryData, campus] = await Promise.all([
        getJson<{ records: Student[]; total: number }>('/students/page', {
          campusId,
          name: nextKeyword,
          status: queryStatus,
          cardCategory: cardCategory || undefined,
          coachMemberId: scopedCoachId,
          sortField,
          sortOrder,
          page: nextPage,
          pageSize: 20,
        }),
        getJson<Record<string, unknown>>('/students/campus-summary', { campusId, coachMemberId: scopedCoachId, includeDetail: true }),
        getJson<{ visibleInList?: boolean | number | string }>(`/campus/${campusId}`).catch(() => null),
      ])
      const source = data.records || []
      const visible = canManageRole ? source : source.filter(hasTeacherVisibleStudentCard).map(teacherVisibleStudent)
      setRows(visible)
      setTotal(Number(data.total || 0))
      setSummary(summaryData)
      setCampusHidden(campusOffline(campus?.visibleInList))
    } catch (error) {
      message.error(tell(error, '学员加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!campusId || !userReady) return
    setPage(1)
    load(1, keyword).catch(() => undefined)
    reloadCoaches()
    reloadGroups()
    reloadServices()
    getJson<Named[]>('/campus/list').then(setCampuses).catch(() => setCampuses([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, status, cardCategory, coachId, sortField, sortOrder, canManageRole, userReady, reloadCoaches, reloadGroups, reloadServices])

  useEffect(() => {
    const studentId = Number(params.get('studentId') || 0)
    if (studentId) openDetail(studentId).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function openDetail(id: number) {
    const student = await getJson<Student>(`/students/${id}`)
    setDetail(student)
    const [bootstrap, listed] = await Promise.all([
      getJson<{ paymentRecords?: PayRecord[]; consumptions?: CheckRecord[]; financialDetailsHidden?: boolean }>('/consumptions/course-tab-bootstrap', { studentId: id }).catch(() => null),
      getJson<PayRecord[]>(`/payment-records/student/${id}`).catch(() => [] as PayRecord[]),
    ])
    const fresh = new Map((listed || []).map((item) => [Number(item.id), item]))
    const base = bootstrap?.paymentRecords?.length ? bootstrap.paymentRecords : (listed || [])
    const seen = new Set(base.map((item) => Number(item.id)))
    const merged = base.map((item) => {
      const next = fresh.get(Number(item.id))
      return next ? { ...item, remainingHours: next.remainingHours ?? item.remainingHours, createTime: item.createTime || next.createTime } : item
    })
    setPayments([...merged, ...(listed || []).filter((item) => !seen.has(Number(item.id)))])
    setChecks(bootstrap?.consumptions || [])
    setFinancialHidden(bootstrap?.financialDetailsHidden === true)
    const access = await getJson<{ enabled?: boolean; visible?: boolean }>(`/parent-admin/students/${id}/access`).catch(() => null)
    setAccessVisible(Boolean(access?.visible))
    setAccessOn(Boolean(access?.enabled))
    setFeeItems(await getJson<Array<Record<string, unknown>>>(`/parent-admin/students/${id}/fee-items`).catch(() => []))
    const marks = await getJson<{ unbookedOrders?: Array<Record<string, unknown>>; paymentRecordIds?: number[] }>(`/parent-admin/students/${id}/pay-marks`).catch(() => null)
    setOrders(marks?.unbookedOrders || [])
    setParentPaidIds((marks?.paymentRecordIds || []).map((item) => Number(item)).filter((item) => item > 0))
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

  function openAssign(row: Student) {
    if (!canManage) {
      message.warning(readOnlyText)
      return
    }
    const card = listDisplayCard(row, cardCategory)
    if (listServiceOnly(row, card)) return
    const reason = assignBlock(row, groups, coaches, card)
    if (reason) {
      message.warning(reason)
      return
    }
    setAssignStudent(row)
  }

  function openQuick(row: Student, preferredCardId?: number) {
    if (!canManage) {
      message.warning(readOnlyText)
      return
    }
    if (Number(row.status || 0) === 2) {
      message.warning('该学员已结业，不能打卡')
      return
    }
    setCheckCardId(preferredCardId || listDisplayCard(row, cardCategory)?.id)
    setCheckCardLocked(Number(preferredCardId || 0) > 0)
    setCheckStudent(row)
  }

  const columns = useMemo(() => [
    { title: '姓名', align: 'center' as const, render: (_: unknown, row: Student) => (
      <button type="button" className="cell-link name-with-icon" onClick={() => openDetail(row.id)}>
        <AppIcon name={row.gender === 2 ? 'icon-gender-female' : row.gender === 1 ? 'icon-gender-male' : 'icon-person-neutral'} size={16} />
        {row.name}
      </button>
    ) },
    { title: '性别', align: 'center' as const, render: (_: unknown, row: Student) => genderText(row.gender) || '未填' },
    { title: '老师', align: 'center' as const, render: (_: unknown, row: Student) => {
      const card = listDisplayCard(row, cardCategory)
      const text = listCoachText(row, card, coaches)
      const pending = canManage && !listServiceOnly(row, card) && text === '待分配'
      return pending ? (
        <button type="button" className="cell-link" onClick={() => openAssign(row)}>{text}</button>
      ) : text
    } },
    { title: <span className="students-hours-column-title">课时</span>, align: 'left' as const, render: (_: unknown, row: Student) => {
      const cards = orderedStudentCards((row.cards || []).filter((card) => card.status == null || Number(card.status) === 1))
      if (cards.length) {
        return (
          <div className="student-card-balances">
            {cards.map((card) => {
              const balance = cardBalanceView(card)
              const category = String(card.cardCategory || 'HOURS').toUpperCase()
              const pending = balance.value === '待缴费'
              const lowHours = category === 'HOURS' && Number(card.remainingHours || 0) < 5
              const emptyStoredValue = category === 'STORED_VALUE' && Number(card.remainingAmount || 0) <= 0
              const balanceClass = [category === 'HOURS' ? 'is-hours-card' : '', category === 'PERIOD' ? 'is-period-card' : '', category === 'STORED_VALUE' ? 'is-stored-card' : '', pending ? 'is-pending' : '', pending || lowHours || emptyStoredValue ? 'is-warning' : ''].filter(Boolean).join(' ')
              const content = <>
                <small className="student-card-kind">{balance.tag}</small>
                <span className="student-card-balance-separator" aria-hidden="true">|</span>
                <span className="student-card-balance-value">{balance.value}</span>
              </>
              return canManage ? (
                <button key={card.id} className={balanceClass || undefined} type="button" title={`${balance.tag} · ${balance.value}`} onClick={() => openQuick(row, card.id)}>{content}</button>
              ) : (
                <span key={card.id} className={balanceClass || undefined} title={`${balance.tag} · ${balance.value}`}>{content}</span>
              )
            })}
          </div>
        )
      }
      const balance = listBalanceText(row, listDisplayCard(row, cardCategory))
      if (!canManage) return <span className={balance.low ? 'hours-low' : undefined}>{balance.text}</span>
      return <button type="button" className={balance.low ? 'cell-link hours-low' : 'cell-link'} onClick={() => openQuick(row)}>{balance.text}</button>
    } },
    { title: <span className="students-status-column-title">状态</span>, align: 'center' as const, render: (_: unknown, row: Student) => {
      const text = studentStatusText(row)
      const tone = text === '待缴费' ? 'status-warn' : text === '结业' ? 'status-muted' : 'status-ok'
      return <div className="students-status-cell"><Tag className={tone}>{text}</Tag></div>
    } },
    {
      title: '操作',
      align: 'center' as const,
      render: (_: unknown, row: Student) => (
        <div className="student-row-actions">
          <Button type="link" onClick={() => openDetail(row.id)}>详情</Button>
          {canManage ? <Button type="link" onClick={() => openQuick(row)}>打卡</Button> : <span aria-hidden="true" />}
        </div>
      ),
    },
  ], [groups, coaches, cardCategory, canManage, readOnlyText])

  return (
    <CatalogLoadContext.Provider value={catalogLoad}>
    <NeedCampus campusId={campusId}>
      <PageHead title={!userReady || canManageRole ? '学员管理' : '我的学员'} extra={!userReady ? '正在加载学员' : canManage ? '搜索、打卡、缴费、转校区和更换老师，与小程序使用同一套学员数据。' : readOnlyText} />
      <section className="work-card">
        <div className="students-overview-line">
          <div className="stat-line">
            <button type="button" className={status === 'active' && !cardCategory ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('active'); setCardCategory('') }}>活跃学员<strong>{Number(summary?.activeStudentCount || 0)}</strong></button>
            <button type="button" className={status === 'all' && !cardCategory ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('') }}>学员人数<strong>{Number(summary?.studentCount || 0)}</strong></button>
            <button type="button" className={status === 'all' && cardCategory === 'STORED_VALUE' ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('STORED_VALUE') }}>储值卡<strong>{Number(summary?.storedValueCardCount || 0)}</strong></button>
            <button type="button" className={status === 'all' && cardCategory === 'PERIOD' ? 'stat-link is-current' : 'stat-link'} onClick={() => { setStatus('all'); setCardCategory('PERIOD') }}>时段卡<strong>{Number(summary?.periodCardCount || 0)}</strong></button>
            <span className="stat-readonly is-regular">剩余正课<strong>{money(summary?.remainingRegularHours)}</strong></span>
            <span className="stat-readonly is-bonus">剩余赠课<strong>{money(summary?.remainingBonusHours)}</strong></span>
          </div>
          {canManage ? <div className="students-overview-actions">
            <Button type="primary" onClick={() => {
              const content = studentQuotaBlock(summary)
              if (content) {
                Modal.info({ title: '学员人数已达上限', content, okText: '我知道了' })
                return
              }
              setAdding(true)
            }}>新增学员</Button>
            <CoachTransferLauncher coaches={coaches} campusId={campusId || 0} onSaved={() => load()} />
          </div> : null}
        </div>
        <div className="work-toolbar">
          <Input
            style={{ width: 220 }}
            allowClear
            placeholder="搜索姓名/电话"
            value={draft}
            onChange={(event) => {
              const value = event.target.value
              setDraft(value)
              if (!value && keyword) {
                sessionStorage.setItem(KEYWORD_KEY, '')
                setKeyword('')
                setPage(1)
                load(1, '').catch(() => undefined)
              }
            }}
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
          <div className="students-sort-control" role="group" aria-label="学员排序">
            <span className="students-sort-control__label">排序</span>
            <Select<StudentSortField>
              className="students-sort-control__field"
              popupClassName="students-sort-field-dropdown"
              variant="borderless"
              aria-label="排序依据"
              value={sortField}
              onChange={setSortField}
              options={STUDENT_SORT_FIELDS}
            />
            <button
              type="button"
              className="students-sort-control__direction"
              aria-label={`当前${sortOrder === 'asc' ? '升序' : '降序'}，点击切换为${sortOrder === 'asc' ? '降序' : '升序'}`}
              title={sortOrder === 'asc' ? '升序，点击切换为降序' : '降序，点击切换为升序'}
              onClick={() => setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
            >
              <span className={`students-sort-arrow is-up${sortOrder === 'asc' ? ' is-active' : ''}`} aria-hidden="true" />
              <span className={`students-sort-arrow is-down${sortOrder === 'desc' ? ' is-active' : ''}`} aria-hidden="true" />
            </button>
          </div>
          {canManageRole ? (
            <Select
              allowClear
              placeholder="全部老师"
              style={{ width: 160 }}
              value={coachId}
              onChange={setCoachId}
              options={coaches.map((item) => ({ value: item.id, label: personName(item) }))}
            />
          ) : null}
          <Button onClick={() => load()}>刷新</Button>
        </div>
        <Table
          className="students-table"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ current: page, pageSize: 20, total, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
        />
      </section>
      <Modal title={assignStudent ? `为 ${assignStudent.name} 分配老师` : '分配老师'} open={!!assignStudent} onCancel={() => setAssignStudent(null)} footer={null} destroyOnHidden>
        {assignStudent ? (
          <Form
            layout="vertical"
            initialValues={{ coachMemberIds: (listDisplayCard(assignStudent, cardCategory)?.coachMemberIds || assignStudent.coachMemberIds || []) }}
            onFinish={async (values: { coachMemberIds?: number[] }) => {
              const coachMemberIds = Array.from(new Set((values.coachMemberIds || []).map(Number).filter((id) => id > 0)))
              if (!assignStudent.id) {
                message.warning('数据异常，请重试')
                return
              }
              if (!coachMemberIds.length) {
                message.warning('请至少选择一位老师')
                return
              }
              try {
                const activeCards = (assignStudent.cards || []).filter((card) => card.status == null || Number(card.status) === 1)
                const shown = listDisplayCard(assignStudent, cardCategory)
                if (shown?.id) {
                  if (!shown.cardCategory && !assignStudent.cardCategory) {
                    message.warning('卡类型缺失，请刷新后重试')
                    return
                  }
                  await putJson(`/student-cards/${shown.id}`, {
                    cardCategory: shown.cardCategory || assignStudent.cardCategory,
                    periodType: shown.periodType || assignStudent.periodType,
                    courseCategory: shown.courseCategory !== false,
                    cardName: shown.cardName,
                    studentGroupId: shown.studentGroupId,
                    coachMemberIds,
                  })
                  const unionIds = Array.from(new Set(activeCards
                    .filter((card) => listCardCategory(card) === 'HOURS' || card.courseCategory !== false)
                    .flatMap((card) => (card.id === shown.id ? coachMemberIds : (card.coachMemberIds || [])))
                    .map(Number)
                    .filter((id) => id > 0)))
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
              {coachesStatus === 'loading' ? <CatalogHold text="正在加载老师..." /> : coachesStatus === 'failed' ? <CatalogHold text="老师加载失败，点击重试" onRetry={reloadCoaches} /> : coaches.filter((item) => Number(item.status ?? 1) !== 0).length ? (
                <Select mode="multiple" options={coaches.filter((item) => Number(item.status ?? 1) !== 0).map((item) => ({ value: item.id, label: personName(item) }))} />
              ) : <CatalogHold text="当前校区暂无老师，请先配置校区老师" />}
            </Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Drawer rootClassName="student-detail-drawer" title={detail ? `${detail.name} · 学员详情` : '学员详情'} width={680} open={!!detail} onClose={() => { setDetail(null); setParams({}) }}>
        {detail ? (
          <StudentDetail
            tab={params.get('tab') || ''}
            student={detail}
            coaches={coaches}
            campuses={campuses}
            groups={groups}
            services={services}
            payments={payments}
            checks={checks}
            financialHidden={financialHidden}
            accessOn={accessOn}
            accessVisible={accessVisible}
            feeItems={feeItems}
            orders={orders}
            parentPaidIds={parentPaidIds}
            payOpen={payOpen}
            setPayOpen={setPayOpen}
            manage={canManage}
            readOnlyText={readOnlyText}
            onChanged={() => openDetail(detail.id)}
            onAccess={async (enabled) => {
              if (!canManage) {
                message.warning(readOnlyText)
                return
              }
              await putJson(`/parent-admin/students/${detail.id}/access`, { enabled })
              setAccessOn(enabled)
            }}
            onLocal={(patch) => patchStudent(detail.id, patch)}
            onDeleted={() => {
              setDetail(null)
              setParams({})
              load().catch(() => undefined)
            }}
            onCheckIn={(preferredCardId) => {
              if (!canManage) {
                message.warning(readOnlyText)
                return
              }
              if (Number(detail.status || 0) === 2) {
                message.warning('该学员已结业，不能打卡')
                return
              }
              setCheckCardId(preferredCardId)
              setCheckCardLocked(Number(preferredCardId || 0) > 0)
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
      <QuickCheckIn
        key={checkStudent?.id || 'closed'}
        student={checkStudent}
        preferredCardId={checkCardId}
        cardSelectionLocked={checkCardLocked}
        coaches={coaches}
        services={services}
        groups={groups}
        onClose={() => { setCheckStudent(null); setCheckCardId(undefined); setCheckCardLocked(false) }}
        onDone={(studentId, hours, amount) => {
          const current = rows.find((item) => item.id === studentId)
          if (current) {
            patchStudent(studentId, {
              remainingHours: Math.max(0, Number(current.remainingHours || 0) - hours),
              remainingAmount: Math.max(0, Number(current.remainingAmount || 0) - amount),
            })
          }
          setCheckStudent(null)
          setCheckCardId(undefined)
          setCheckCardLocked(false)
          load().catch(() => undefined)
        }}
      />
    </NeedCampus>
    </CatalogLoadContext.Provider>
  )
}
