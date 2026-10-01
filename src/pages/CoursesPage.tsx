import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { NeedCampus, PageHead, clampDecimalInput, genderText, money, tell, useShell } from './kit'
import './CoursesPage.css'

interface Course {
  id: number
  name: string
  shortName?: string
  unitPrice?: number
  oneToOne?: boolean
  internal?: boolean
  invalid?: boolean
  inactiveReason?: string
  minOpenCount?: number | null
  coachIds?: number[]
  coachNamesText?: string
  studentCount?: number
  studentIds?: number[]
  studentNames?: string[]
  memberHoursDetails?: Array<Record<string, unknown>>
}

interface CoachStudent {
  id: number
  name?: string
  gender?: number
  status?: number
  remainingHours?: number
  totalHours?: number
  regularHours?: number
  bonusHours?: number
  remainingAmount?: number
  cardCategory?: string
  periodType?: string
  periodValidStartDate?: string
  periodValidEndDate?: string
  cards?: Array<{
    id?: number
    status?: number
    studentGroupId?: number
    courseCategory?: boolean
    cardCategory?: string
    periodType?: string
    remainingAmount?: number | null
    validStartDate?: string
    validEndDate?: string
    cardTypeLabel?: string
  }>
}

function cardDisplayOrder(category?: string, periodType?: string): number {
  const normalized = String(category || '').toUpperCase()
  if (normalized === 'HOURS') return 0
  if (normalized === 'STORED_VALUE') return 1
  if (normalized === 'PERIOD') {
    const order: Record<string, number> = { YEAR: 2, HALF_YEAR: 3, QUARTER: 4, MONTH: 5, WEEK: 6 }
    return order[String(periodType || '').toUpperCase()] ?? 7
  }
  return 99
}

function boundCourseCard(cards: CoachStudent['cards'], groupId: number) {
  const bound = (cards || []).filter((card) => Number(card.studentGroupId || 0) === groupId && Number(card.status ?? 1) === 1 && card.courseCategory !== false)
  if (!bound.length) return undefined
  return bound.slice().sort((left, right) => {
    const order = cardDisplayOrder(left.cardCategory, left.periodType) - cardDisplayOrder(right.cardCategory, right.periodType)
    if (order) return order
    return Number(left.id || Number.MAX_SAFE_INTEGER) - Number(right.id || Number.MAX_SAFE_INTEGER)
  })[0]
}

async function enrichMembers(row: Course, campusId: number): Promise<Array<Record<string, unknown>>> {
  const base = nameOnlyMembers(row)
  const coachIds = (row.coachIds || []).map(Number).filter((id) => id > 0)
  const wanted = new Set((row.studentIds || []).map(Number).filter((id) => id > 0))
  if (!campusId || !coachIds.length || !wanted.size) return base
  const groups = await getJson<Array<{ students?: CoachStudent[] }>>('/students/by-coaches', {
    coachMemberIds: coachIds.join(','),
    campusId,
  }).catch(() => [])
  const found = new Map<number, CoachStudent>()
  ;(groups || []).forEach((group) => {
    ;(group.students || []).forEach((student) => {
      if (wanted.has(Number(student.id))) found.set(Number(student.id), student)
    })
  })
  if (!found.size) return base
  return base.map((member) => {
    const student = found.get(Number(member.studentId))
    if (!student) return member
    const card = boundCourseCard(student.cards, row.id)
    const total = Number(student.totalHours ?? (Number(student.regularHours || 0) + Number(student.bonusHours || 0)))
    const remain = Number(student.remainingHours || 0)
    return {
      ...member,
      studentName: student.name || member.studentName,
      gender: student.gender,
      status: student.status,
      totalHours: total,
      attendedHours: Math.max(total - remain, 0),
      remainingHours: remain,
      cardCategory: String(card?.cardCategory || student.cardCategory || '').toUpperCase(),
      periodType: card?.periodType || student.periodType,
      remainingAmount: card?.remainingAmount != null ? card.remainingAmount : student.remainingAmount,
      validStartDate: card?.validStartDate || student.periodValidStartDate,
      validEndDate: card?.validEndDate || student.periodValidEndDate,
      cardTagLabel: card?.cardTypeLabel,
    }
  })
}

function nameOnlyMembers(row: Course) {
  const ids = row.studentIds || []
  const names = row.studentNames || []
  if (ids.length === 0 && names.length === 0) return []
  const size = Math.max(ids.length, names.length)
  return Array.from({ length: size }, (_, index) => ({
    studentId: ids[index],
    studentName: names[index] || (ids[index] ? `学员${ids[index]}` : ''),
  }))
}

function isOneToOneCourse(item: Pick<Course, 'oneToOne' | 'internal' | 'name'>) {
  if (item.oneToOne) return true
  return !!item.internal && String(item.name || '').trim().endsWith('一对一课程')
}

function courseMinOpenEnabled(course: Pick<Course, 'oneToOne' | 'internal' | 'name' | 'minOpenCount'>) {
  if (isOneToOneCourse(course)) return false
  const count = Number(course.minOpenCount)
  return Number.isInteger(count) && count >= 2 && count <= 99
}

function formatGroupUnitPrice(value: number | string | null | undefined) {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return `${numeric}`.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function courseFormKey(values: Partial<Course> & { minOpenEnabled?: boolean }, locked: boolean, fallback: Course | null) {
  const oneToOne = !!values.oneToOne
  const coachIds = (locked ? (fallback?.coachIds || []) : (values.coachIds || []))
    .map((id) => Number(id))
    .filter((id) => id > 0)
    .sort((left, right) => left - right)
  const enabled = !oneToOne && !!values.minOpenEnabled
  const count = Number(values.minOpenCount)
  return JSON.stringify({
    name: String(values.name || ''),
    shortName: locked ? String(fallback?.shortName || '') : String(values.shortName || ''),
    unitPrice: formatGroupUnitPrice(values.unitPrice),
    coachIds,
    oneToOne,
    minOpenCount: enabled ? count : null,
  })
}

function CourseSaveButton(props: { current: Course | null; saving: boolean }) {
  const form = Form.useFormInstance()
  const name = Form.useWatch('name', form)
  const shortName = Form.useWatch('shortName', form)
  const unitPrice = Form.useWatch('unitPrice', form)
  const oneToOne = Form.useWatch('oneToOne', form)
  const minOpenEnabled = Form.useWatch('minOpenEnabled', form)
  const minOpenCount = Form.useWatch('minOpenCount', form)
  const coachIds = Form.useWatch('coachIds', form)
  const locked = !!props.current?.internal
  const values = { name, shortName, unitPrice, oneToOne, minOpenEnabled, minOpenCount, coachIds }
  const coaches = locked ? (props.current?.coachIds || []) : (coachIds || [])
  const nameOk = String(name || '').trim().length > 0
  const coachOk = coaches.length > 0
  const original = props.current
    ? courseFormKey({
      name: props.current.name,
      shortName: props.current.shortName,
      unitPrice: props.current.unitPrice,
      oneToOne: isOneToOneCourse(props.current),
      minOpenEnabled: courseMinOpenEnabled(props.current),
      minOpenCount: props.current.minOpenCount,
      coachIds: props.current.coachIds,
    }, locked, props.current)
    : ''
  const dirty = !props.current || courseFormKey(values, locked, props.current) !== original
  const canSave = nameOk && coachOk && dirty && !props.saving
  return <Button type="primary" htmlType="submit" disabled={!canSave}>{props.saving ? '保存中...' : '保存'}</Button>
}

function inactiveLabel(reason?: string) {
  if (reason === 'DELETED_TEACHER') return '已删除老师'
  if (reason === 'RESIGNED_TEACHER') return '老师已离职'
  return ''
}

function memberCategory(row: Record<string, unknown>): string {
  return String(row.cardCategory || '').toUpperCase()
}

function memberPeriodLabel(type?: string): string {
  return ({ WEEK: '周卡', MONTH: '月卡', QUARTER: '季卡', HALF_YEAR: '半年卡', YEAR: '年卡' } as Record<string, string>)[String(type || '')] || '时段卡'
}

function memberCardTag(row: Record<string, unknown>): string {
  const category = memberCategory(row)
  if (category === 'STORED_VALUE') return '储值卡'
  if (category === 'PERIOD') return String(row.cardTagLabel || '') || memberPeriodLabel(String(row.periodType || ''))
  return ''
}

function sortCourseMembers(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const rank = (row: Record<string, unknown>) => {
    const category = memberCategory(row)
    if (category === 'PERIOD') return 2
    if (category === 'STORED_VALUE') return 1
    return 0
  }
  return rows.slice().sort((left, right) => {
    const typeDiff = rank(left) - rank(right)
    if (typeDiff) return typeDiff
    const category = memberCategory(left)
    if (category === 'STORED_VALUE') {
      const amountDiff = Number(left.remainingAmount || 0) - Number(right.remainingAmount || 0)
      if (amountDiff) return amountDiff
    } else if (category === 'PERIOD') {
      const dateDiff = String(left.validEndDate || '').localeCompare(String(right.validEndDate || ''))
      if (dateDiff) return dateDiff
    } else {
      const hoursDiff = Number(left.remainingHours || 0) - Number(right.remainingHours || 0)
      if (hoursDiff) return hoursDiff
    }
    return String(left.studentName || left.name || '').localeCompare(String(right.studentName || right.name || ''), 'zh-Hans-CN')
  })
}

function memberHoursCell(row: Record<string, unknown>) {
  const category = memberCategory(row)
  if (category === 'PERIOD') {
    const start = String(row.validStartDate || '')
    const end = String(row.validEndDate || '')
    const range = start && end && start !== end ? `${start} ~ ${end}` : ''
    return <span>有效期至 {end || '未设置'}{range ? ` · ${range}` : ''}</span>
  }
  if (category === 'STORED_VALUE') {
    if (row.remainingAmount == null) return ''
    const low = Number(row.remainingAmount || 0) <= 0
    return <span className={low ? 'hours-low' : undefined}>余额 ¥{money(row.remainingAmount as number)}</span>
  }
  if (row.remainingHours == null && row.attendedHours == null && row.totalHours == null) return ''
  const remain = Number(row.remainingHours ?? 0)
  return (
    <span className={remain < 5 ? 'hours-low' : undefined}>
      已上 {String(row.attendedHours ?? 0)}节 / 总 {String(row.totalHours ?? 0)}节，剩余 {remain}节
    </span>
  )
}

function hasDuplicateOneToOne(courses: Course[], coachIds: number[], editingId?: number) {
  if (!coachIds.length) return false
  return courses.some((item) => item.oneToOne === true
    && Number(item.id) !== Number(editingId || 0)
    && (item.coachIds || []).some((id) => coachIds.some((selected) => Number(selected) === Number(id))))
}

function OneToOneSwitch(props: { locked?: boolean; courses: Course[]; editingId?: number; checked?: boolean; onChange?: (value: boolean) => void }) {
  const form = Form.useFormInstance()
  return (
    <Switch
      disabled={props.locked}
      checked={!!props.checked}
      onChange={(next) => {
        if (props.locked) return
        const coachIds = ((form.getFieldValue('coachIds') || []) as number[]).map((id) => Number(id)).filter((id) => id > 0)
        const nextCoachIds = next ? coachIds.slice(0, 1) : coachIds
        if (next && hasDuplicateOneToOne(props.courses, nextCoachIds, props.editingId)) {
          message.warning('该老师已存在一对一课程')
          return
        }
        if (next) form.setFieldValue('coachIds', nextCoachIds)
        props.onChange?.(next)
      }}
    />
  )
}

function OneToOneCoachSelect(props: { coaches: Coach[]; courses: Course[]; editingId?: number; oneToOne: boolean; value?: number[]; onChange?: (value: number[]) => void }) {
  return (
    <Select
      mode="multiple"
      value={props.value}
      options={props.coaches.map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))}
      onChange={(next: number[]) => {
        if (!props.oneToOne) {
          props.onChange?.(next)
          return
        }
        const current = new Set((props.value || []).map((id) => Number(id)))
        const added = next.map((id) => Number(id)).find((id) => !current.has(id))
        if (!added) {
          props.onChange?.([])
          return
        }
        if (hasDuplicateOneToOne(props.courses, [added], props.editingId)) {
          message.warning('该老师已存在一对一课程')
          return
        }
        props.onChange?.([added])
      }}
    />
  )
}

function CourseOpenFields(props: { coaches: Coach[]; courses: Course[]; editingId?: number; locked: boolean }) {
  const oneToOne = Form.useWatch('oneToOne')
  const minOpenEnabled = Form.useWatch('minOpenEnabled')
  return (
    <>
      <Form.Item name="oneToOne" label="一对一" extra={props.locked ? '该课程为系统自动创建，不可更改类型。' : undefined} valuePropName="checked">
        <OneToOneSwitch locked={props.locked} courses={props.courses} editingId={props.editingId} />
      </Form.Item>
      {oneToOne ? null : (
        <>
          <Form.Item name="minOpenEnabled" label="该课程至少多少人才能开课" extra="开启后选择开课最少人数" valuePropName="checked"><Switch disabled={props.locked} /></Form.Item>
          {minOpenEnabled ? <Form.Item name="minOpenCount" label="最少人数"><InputNumber style={{ width: '100%' }} min={2} max={99} disabled={props.locked} /></Form.Item> : null}
        </>
      )}
      {props.locked ? <p style={{ color: 'var(--muted)' }}>自动创建的一对一课程会随老师自动关联学员。一对一类型固定不可修改，这里仅支持修改课程名称和课程单价。</p> : (
        <Form.Item name="coachIds" label="带班老师" rules={[{ required: true, message: '请选择带班老师' }]}>
          <OneToOneCoachSelect coaches={props.coaches} courses={props.courses} editingId={props.editingId} oneToOne={!!oneToOne} />
        </Form.Item>
      )}
    </>
  )
}

interface Coach {
  id: number
  displayName?: string
  nickname?: string
  phone?: string
  status?: number
  deleted?: boolean | number
}

export function CoursesPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Course[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filter, setFilter] = useState<'all' | 'one' | 'other'>('all')
  const [keyword, setKeyword] = useState('')
  const [coachFilter, setCoachFilter] = useState<number | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [editing, setEditing] = useState<Course | 'new' | null>(null)
  const [savingCourse, setSavingCourse] = useState(false)
  const [members, setMembers] = useState<Course | null>(null)
  const role = String(shell.user?.role || '').trim().toLowerCase()
  const manager = role === 'owner' || role === 'admin' || (shell.user?.campusAdminCampusIds || []).length > 0

  function canModify(show = true) {
    const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
    if (subscriptionBlocksPath(shell.user, '/courses', currentOrg)) {
      if (show) message.warning(subscriptionExpiredText(shell.user))
      return false
    }
    if (!manager) {
      if (show) message.warning('当前账号无课程管理权限')
      return false
    }
    if (readOnly) {
      if (show) message.warning('校区已下线，课程信息仅可查看')
      return false
    }
    return true
  }

  async function openMembers(row: Course) {
    const fallback = nameOnlyMembers(row)
    setMembers({ ...row, memberHoursDetails: fallback })
    try {
      const detail = await getJson<Course>(`/student-groups/${row.id}`)
      const loaded = detail.memberHoursDetails || []
      const merged = {
        ...detail,
        coachIds: detail.coachIds?.length ? detail.coachIds : row.coachIds,
        studentIds: detail.studentIds?.length ? detail.studentIds : row.studentIds,
        studentNames: detail.studentNames?.length ? detail.studentNames : row.studentNames,
      }
      if (loaded.length > 0) {
        setMembers({ ...merged, memberHoursDetails: loaded })
        return
      }
      setMembers({ ...merged, memberHoursDetails: await enrichMembers(merged, shell.campusId || 0) })
    } catch (error) {
      message.error(tell(error, '加载课程失败'))
    }
  }

  async function load() {
    if (!shell.campusId) return
    const [courses, teacherList, campus] = await Promise.all([
      getJson<Course[]>('/student-groups/list', { campusId: shell.campusId, includeInternal: true, selfOnly: true }),
      getJson<Coach[]>(`/campus-teacher/campus/${shell.campusId}`),
      getJson<{ visibleInList?: boolean | number | string }>(`/campus/${shell.campusId}`).catch(() => null),
    ])
    setRows(courses || [])
    setCoaches((teacherList || []).filter((item) => item.status !== 0 && item.deleted !== true && item.deleted !== 1))
    const visible = campus?.visibleInList
    setReadOnly(visible === false || visible === 0 || visible === '0' || visible === 'false')
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '课程加载失败')))
  }, [shell.campusId])

  const text = keyword.trim().toLowerCase()
  const visible = rows.filter((item) => {
    if (coachFilter && !(item.coachIds || []).some((id) => Number(id) === coachFilter)) return false
    const one = isOneToOneCourse(item)
    if (filter === 'one' && !one) return false
    if (filter === 'other' && one) return false
    if (text) {
      const nameHit = String(item.name || '').toLowerCase().includes(text)
      const studentHit = (item.studentNames || []).some((name) => String(name).toLowerCase().includes(text))
      if (!nameHit && !studentHit) return false
    }
    return true
  }).sort((left, right) => Number(!!left.invalid) - Number(!!right.invalid))
  const oneCount = rows.filter((item) => isOneToOneCourse(item)).length

  const columns = [
    { title: '课程', dataIndex: 'name' },
    { title: '简称', render: (_: unknown, row: Course) => row.internal ? '' : (row.shortName || '') },
    { title: '单价', render: (_: unknown, row: Course) => money(row.unitPrice) },
    { title: '类型', render: (_: unknown, row: Course) => row.internal ? '内部一对一' : isOneToOneCourse(row) ? '一对一' : '其它课程' },
    { title: '状态', render: (_: unknown, row: Course) => inactiveLabel(row.inactiveReason) || (row.invalid ? '已删除老师' : '可排课') },
    { title: '最少开课', dataIndex: 'minOpenCount', render: (value: number) => value || '不限' },
    { title: '老师', dataIndex: 'coachNamesText' },
    {
      title: '学员',
      render: (_: unknown, row: Course) => Number(row.studentCount) > 0
        ? <Button type="link" onClick={() => { openMembers(row).catch(() => undefined) }}>{row.studentCount} 名学员</Button>
        : `${row.studentCount || 0} 名学员`,
    },
    {
      title: '操作',
      render: (_: unknown, row: Course) => manager && !readOnly && !row.invalid ? (
        <Space>
          <Button type="link" onClick={() => { if (canModify()) setEditing(row) }}>编辑</Button>
          {row.internal ? null : (
            <Popconfirm title="删除班级" description={`确定删除班级"${row.name}"吗？`} onConfirm={async () => {
              if (!canModify()) return
              try {
                await delJson(`/student-groups/${row.id}`)
                message.success('已删除')
                await load()
              } catch (error) {
                Modal.error({ title: '无法删除课程', content: tell(error, '删除失败') })
              }
            }}>
              <Button type="link" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ) : (inactiveLabel(row.inactiveReason) || null),
    },
  ]

  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead title="课程管理" extra={readOnly ? '校区已下线，课程信息仅可查看' : '简称会优先出现在课表上。一对一和其它课程分开统计。'} />
      <section className="work-card course-list-card">
        <h2>课程列表</h2>
        <div className="course-list-actionbar">
          {manager ? <Button className="course-create-button" type="primary" disabled={readOnly} onClick={() => { if (canModify()) setEditing('new') }}>新建课程</Button> : null}
          <div className="stat-line course-list-stats">
            <span>课程总数<strong>{rows.length}</strong></span>
            <span>一对一<strong>{oneCount}</strong></span>
            <span>其它课程<strong>{rows.length - oneCount}</strong></span>
          </div>
          <div className="work-toolbar course-list-filters">
            {manager ? <Select allowClear placeholder="全部老师" value={coachFilter ?? undefined} onChange={(value) => setCoachFilter(value ?? null)} style={{ width: 160 }} options={coaches.map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))} /> : null}
            <Select value={filter} onChange={setFilter} style={{ width: 140 }} options={[{ value: 'all', label: '全部类型' }, { value: 'one', label: '一对一' }, { value: 'other', label: '其它' }]} />
            <Input allowClear placeholder="搜索学员/课程" value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 220 }} />
            <Button onClick={() => load()}>刷新</Button>
          </div>
        </div>
        <Table rowKey="id" dataSource={visible} columns={columns} pagination={false} locale={{ emptyText: readOnly || !manager ? '暂无课程' : '暂无班级，可创建用于排课或分组管理' }} />
      </section>
      <Modal title={editing === 'new' ? '新建课程' : '编辑课程'} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        <Form
          layout="vertical"
          initialValues={editing && editing !== 'new' ? {
            ...editing,
            oneToOne: isOneToOneCourse(editing),
            minOpenEnabled: courseMinOpenEnabled(editing),
            minOpenCount: courseMinOpenEnabled(editing) ? Number(editing.minOpenCount) : 2,
          } : { oneToOne: false, minOpenEnabled: false, minOpenCount: 2 }}
          onFinish={async (values: Partial<Course> & { minOpenEnabled?: boolean }) => {
            if (!canModify() || savingCourse) return
            const current = editing && editing !== 'new' ? editing : null
            const locked = !!current?.internal
            const coaches = locked ? (current?.coachIds || []) : (values.coachIds || [])
            if (!String(values.name || '').trim() || coaches.length === 0) return
            if (current && courseFormKey(values, locked, current) === courseFormKey({
              name: current.name,
              shortName: current.shortName,
              unitPrice: current.unitPrice,
              oneToOne: isOneToOneCourse(current),
              minOpenEnabled: courseMinOpenEnabled(current),
              minOpenCount: current.minOpenCount,
              coachIds: current.coachIds,
            }, locked, current)) return
            const name = String(values.name || '').trim()
            const shortName = String(values.shortName || '').trim()
            const coachIds = values.coachIds || []
            if (!name) {
              message.warning('请输入课程名称')
              return
            }
            if (name.length > 10) {
              message.warning('课程名称最多10个字')
              return
            }
            if (!current?.internal && shortName.length > 4) {
              message.warning('班级简称最多4个字符')
              return
            }
            if (!current?.internal && coachIds.length === 0) {
              message.warning('请选择带班老师')
              return
            }
            if (values.unitPrice != null && Number(values.unitPrice) <= 0) {
              message.warning('课程单价需大于0')
              return
            }
            if (values.unitPrice != null && Number(values.unitPrice) > 99999999.99) {
              message.warning('课程单价不能超过99999999.99')
              return
            }
            const oneToOne = !!values.oneToOne
            const minOpenCount = oneToOne || !values.minOpenEnabled ? null : Number(values.minOpenCount)
            if (!oneToOne && values.minOpenEnabled && (minOpenCount == null || minOpenCount < 2 || minOpenCount > 99)) {
              message.warning('开课最少人数需在2到99之间')
              return
            }
            if (!current?.internal && rows.some((item) => item.name === name && item.id !== current?.id && (item.coachIds || []).some((id) => coachIds.includes(id)))) {
              message.warning('该老师已存在同名班级')
              return
            }
            if (!current?.internal && oneToOne && rows.some((item) => isOneToOneCourse(item) && item.id !== current?.id && (item.coachIds || []).some((id) => coachIds.includes(id)))) {
              message.warning('该老师已存在一对一课程')
              return
            }
            const payload = {
              name,
              shortName: current?.internal ? current.shortName : shortName,
              campusId: shell.campusId,
              coachId: current?.internal ? undefined : coachIds[0],
              coachIds: current?.internal ? undefined : coachIds,
              unitPrice: values.unitPrice == null ? null : Number(Number(values.unitPrice).toFixed(2)),
              locked: false,
              oneToOne,
              minOpenCount,
            }
            setSavingCourse(true)
            try {
              if (current) await putJson(`/student-groups/${current.id}`, payload)
              else await postJson('/student-groups', payload)
              message.success(current ? '修改成功' : '创建成功')
              setEditing(null)
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            } finally {
              setSavingCourse(false)
            }
          }}
        >
          <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}><Input maxLength={10} placeholder={editing && editing !== 'new' && editing.oneToOne ? '如：一对一A' : '如：一对二A'} /></Form.Item>
          {editing && editing !== 'new' && editing.internal ? null : <Form.Item name="shortName" label="简称" extra="简称会优先显示在课表内，方便排课时快速识别班级。"><Input maxLength={4} placeholder="如：二A" /></Form.Item>}
          <Form.Item name="unitPrice" label="课程单价" getValueFromEvent={(value) => clampDecimalInput(value, 8)}><InputNumber style={{ width: '100%' }} min={0.01} /></Form.Item>
          <CourseOpenFields coaches={coaches} courses={rows} editingId={editing && editing !== 'new' ? editing.id : undefined} locked={!!(editing && editing !== 'new' && editing.internal)} />
          <CourseSaveButton current={editing && editing !== 'new' ? editing : null} saving={savingCourse} />
        </Form>
      </Modal>
      <Modal title="课程学员" open={!!members} onCancel={() => setMembers(null)} footer={null} width={760}>
        <Table
          rowKey={(row) => String(row.studentId)}
          dataSource={sortCourseMembers(members?.memberHoursDetails || [])}
          pagination={false}
          locale={{ emptyText: '暂无学员' }}
          columns={[
            { title: '姓名', render: (_: unknown, row: Record<string, unknown>) => {
              const name = String(row.studentName || row.name || '')
              const tag = memberCardTag(row)
              const content = <>{name}{tag ? ` · ${tag}` : ''}</>
              return row.studentId ? <Button type="link" onClick={() => { setMembers(null); navigate(`/students?studentId=${row.studentId}`) }}>{content}</Button> : content
            } },
            { title: '性别', render: (_: unknown, row: Record<string, unknown>) => genderText(row.gender) },
            { title: '状态', render: (_: unknown, row: Record<string, unknown>) => row.status == null ? '' : Number(row.status) === 2 ? '结业' : '在学' },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => memberHoursCell(row) },
          ]}
        />
      </Modal>
    </NeedCampus>
  )
}
