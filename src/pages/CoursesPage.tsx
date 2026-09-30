import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { NeedCampus, PageHead, genderText, money, tell, useShell } from './kit'

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

function inactiveLabel(reason?: string) {
  if (reason === 'DELETED_TEACHER') return '已删除老师'
  if (reason === 'RESIGNED_TEACHER') return '老师已离职'
  return ''
}

function CourseOpenFields(props: { coaches: Coach[]; locked: boolean }) {
  const oneToOne = Form.useWatch('oneToOne')
  const minOpenEnabled = Form.useWatch('minOpenEnabled')
  return (
    <>
      <Form.Item name="oneToOne" label="一对一" extra={props.locked ? '该课程为系统自动创建，不可更改类型。' : undefined} valuePropName="checked"><Switch disabled={props.locked} /></Form.Item>
      {oneToOne ? null : (
        <>
          <Form.Item name="minOpenEnabled" label="该课程至少多少人才能开课" valuePropName="checked"><Switch disabled={props.locked} /></Form.Item>
          {minOpenEnabled ? <Form.Item name="minOpenCount" label="最少人数"><InputNumber style={{ width: '100%' }} min={2} max={99} disabled={props.locked} /></Form.Item> : null}
        </>
      )}
      {props.locked ? <p style={{ color: 'var(--muted)' }}>自动创建的一对一课程会随老师自动关联学员。一对一类型固定不可修改，这里仅支持修改课程名称和课程单价。</p> : (
        <Form.Item name="coachIds" label="带班老师" rules={[{ required: true, message: '请选择带班老师' }]}>
          <Select mode="multiple" options={props.coaches.map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))} />
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
      if (loaded.length > 0) {
        setMembers(detail)
        return
      }
      const names = detail.studentNames?.length ? detail.studentNames : row.studentNames
      const ids = detail.studentIds?.length ? detail.studentIds : row.studentIds
      setMembers({ ...detail, studentIds: ids, studentNames: names, memberHoursDetails: nameOnlyMembers({ ...detail, studentIds: ids, studentNames: names }) })
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
      <PageHead title="课程" extra={readOnly ? '校区已下线，课程信息仅可查看' : '简称会优先出现在课表上。一对一和其它课程分开统计。'}>
        {manager ? <Button type="primary" disabled={readOnly} onClick={() => { if (canModify()) setEditing('new') }}>新建课程</Button> : null}
      </PageHead>
      <section className="work-card">
        <div className="stat-line">
          <span>课程总数<strong>{rows.length}</strong></span>
          <span>一对一<strong>{oneCount}</strong></span>
          <span>其它课程<strong>{rows.length - oneCount}</strong></span>
        </div>
        <div className="work-toolbar">
          {manager ? <Select allowClear placeholder="全部老师" value={coachFilter ?? undefined} onChange={(value) => setCoachFilter(value ?? null)} style={{ width: 160 }} options={coaches.map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))} /> : null}
          <Select value={filter} onChange={setFilter} style={{ width: 140 }} options={[{ value: 'all', label: '全部类型' }, { value: 'one', label: '一对一' }, { value: 'other', label: '其它' }]} />
          <Input allowClear placeholder="搜索学员/课程" value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 220 }} />
          <Button onClick={() => load()}>刷新</Button>
        </div>
        <Table rowKey="id" dataSource={visible} columns={columns} pagination={false} locale={{ emptyText: readOnly || !manager ? '暂无课程' : '暂无班级，可创建用于排课或分组管理' }} />
      </section>
      <Modal title={editing === 'new' ? '新建课程' : '编辑课程'} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={editing && editing !== 'new' ? { ...editing, minOpenEnabled: editing.minOpenCount != null } : { oneToOne: false, minOpenEnabled: false, minOpenCount: 2 }}
          onFinish={async (values: Partial<Course> & { minOpenEnabled?: boolean }) => {
            if (!canModify()) return
            const current = editing && editing !== 'new' ? editing : null
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
            try {
              if (current) await putJson(`/student-groups/${current.id}`, payload)
              else await postJson('/student-groups', payload)
              message.success(current ? '修改成功' : '创建成功')
              setEditing(null)
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}><Input maxLength={10} placeholder={editing && editing !== 'new' && editing.oneToOne ? '如：一对一A' : '如：一对二A'} /></Form.Item>
          {editing && editing !== 'new' && editing.internal ? null : <Form.Item name="shortName" label="简称" extra="简称会优先显示在课表内，方便排课时快速识别班级。"><Input maxLength={4} placeholder="如：二A" /></Form.Item>}
          <Form.Item name="unitPrice" label="课程单价"><InputNumber style={{ width: '100%' }} min={0.01} max={99999999.99} /></Form.Item>
          <CourseOpenFields coaches={coaches} locked={!!(editing && editing !== 'new' && editing.internal)} />
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
      <Modal title="课程学员" open={!!members} onCancel={() => setMembers(null)} footer={null} width={760}>
        <Table
          rowKey={(row) => String(row.studentId)}
          dataSource={members?.memberHoursDetails || []}
          pagination={false}
          locale={{ emptyText: '暂无学员' }}
          columns={[
            { title: '姓名', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => { setMembers(null); navigate(`/students?studentId=${row.studentId}`) }}>{String(row.studentName || row.name || '')}</Button> : String(row.studentName || row.name || '') },
            { title: '性别', render: (_: unknown, row: Record<string, unknown>) => genderText(row.gender) },
            { title: '状态', render: (_: unknown, row: Record<string, unknown>) => row.status == null ? '' : Number(row.status) === 2 ? '结业' : '在学' },
            { title: '卡类型', dataIndex: 'cardTypeLabel' },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => {
              const category = String(row.cardCategory || '').toUpperCase()
              if (category === 'PERIOD') return [row.validStartDate, row.validEndDate].filter(Boolean).join(' ~ ') || '未设置'
              if (row.remainingHours == null && row.attendedHours == null && row.totalHours == null) return ''
              if (category === 'STORED_VALUE') return row.remainingAmount == null ? '' : money(row.remainingAmount as number)
              return `已上 ${row.attendedHours ?? 0} / 总 ${row.totalHours ?? 0}，剩余 ${row.remainingHours ?? 0}`
            } },
          ]}
        />
      </Modal>
    </NeedCampus>
  )
}
