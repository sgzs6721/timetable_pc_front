import { Button, Form, Input, Modal, Select, Space, Switch, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { PhoneCopyButton, copyPlainText, tell } from './kit'
import type { Campus, Person, Position } from './campus-model'
function isIdCard(value: string) {
  const text = value.trim().toUpperCase()
  if (!text) return true
  if (!/^\d{17}[\dX]$/.test(text)) return false
  const year = Number(text.slice(6, 10))
  const month = Number(text.slice(10, 12))
  const day = Number(text.slice(12, 14))
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  const sum = text.slice(0, 17).split('').reduce((total, char, index) => total + Number(char) * weights[index], 0)
  return codes[sum % 11] === text[17]
}

function birthDateFromIdCard(idCard?: string) {
  const text = String(idCard || '').trim().toUpperCase()
  if (!text || !isIdCard(text)) return ''
  return `${text.slice(6, 10)}-${text.slice(10, 12)}-${text.slice(12, 14)}`
}

function defaultOneToOneName(name?: string) {
  const trimmed = String(name || '').trim()
  return trimmed ? `${trimmed}一对一课程` : '一对一课程'
}

function roleChoices(positions: Position[], people: Person[], currentId?: number, currentPositionId?: number) {
  const adminCount = people.filter((item) => item.id !== currentId && item.status !== 0 && (item.campusAdmin || positions.some((position) => position.campusAdmin && position.id === item.positionId))).length
  return positions.map((item) => ({
    value: item.id,
    label: item.name,
    disabled: !!item.campusAdmin && adminCount >= 2 && item.id !== currentPositionId,
  }))
}

function staffFormError(values: { nickname?: string; phone?: string; gender?: string; positionId?: number; hireDate?: string; idCard?: string; isSubstituteTeacher?: boolean; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string }, people: Person[], positions: Position[], currentId?: number) {
  const name = String(values.nickname || '').trim()
  const phone = String(values.phone || '').trim()
  if (!values.hireDate) return '请选择入职日期'
  if (!name) return '请输入姓名'
  if (Array.from(name).length > 6) return '姓名不能超过6个字'
  if (!phone) return '请输入联系方式'
  if (!/^1\d{10}$/.test(phone)) return '手机号格式不正确'
  if (values.gender !== 'male' && values.gender !== 'female') return '请选择性别'
  if (values.idCard && !isIdCard(values.idCard)) return '身份证号格式不正确'
  const card = String(values.idCard || '').trim().toUpperCase()
  if (people.some((item) => item.id !== currentId && String(item.phone || '').trim() === phone)) return '联系方式不能重复'
  if (card && people.some((item) => item.id !== currentId && String(item.idCard || '').trim().toUpperCase() === card)) return '身份证号不能重复'
  if (!positions.length) return '请先在当前校区配置职位'
  if (!values.positionId) return '请选择角色'
  const selected = positions.find((item) => item.id === values.positionId)
  const adminCount = people.filter((item) => item.id !== currentId && (item.campusAdmin || positions.some((position) => position.campusAdmin && position.id === item.positionId))).length
  if (selected?.campusAdmin && adminCount >= 2) return '一个校区最多设置两名校区管理员'
  if (values.isSubstituteTeacher && values.autoCreateOneToOneCourse && !String(values.oneToOneCourseName || '').trim()) return '请输入一对一课程名称'
  return ''
}

function staffEditSnapshot(values: { idCard?: string; gender?: string; positionId?: number; status?: number; isSubstituteTeacher?: boolean; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string; hireDate?: string }) {
  const substitute = values.isSubstituteTeacher === true
  return {
    idCard: String(values.idCard || '').trim().toUpperCase(),
    gender: values.gender === 'male' || values.gender === 'female' ? values.gender : '',
    positionId: String(values.positionId ?? ''),
    isSubstituteTeacher: substitute,
    autoCreateOneToOneCourse: substitute && values.autoCreateOneToOneCourse === true,
    oneToOneCourseName: substitute && values.autoCreateOneToOneCourse === true ? String(values.oneToOneCourseName || '').trim() : '',
    status: Number(values.status) === 0 ? 0 : 1,
    hireDate: String(values.hireDate || '').slice(0, 10),
  }
}

function staffEditBaseline(person: Person, origin: { auto: boolean; name: string }) {
  return staffEditSnapshot({
    idCard: person.idCard,
    gender: person.gender,
    positionId: person.positionId,
    status: person.status ?? 1,
    isSubstituteTeacher: !!person.isSubstituteTeacher,
    autoCreateOneToOneCourse: origin.auto,
    oneToOneCourseName: origin.name,
    hireDate: person.hireDate,
  })
}

function StaffEditSaveButton(props: { person: Person; origin: { auto: boolean; name: string }; loading: boolean }) {
  const form = Form.useFormInstance()
  const idCard = Form.useWatch('idCard', form)
  const gender = Form.useWatch('gender', form)
  const positionId = Form.useWatch('positionId', form)
  const status = Form.useWatch('status', form)
  const isSubstituteTeacher = Form.useWatch('isSubstituteTeacher', form)
  const autoCreateOneToOneCourse = Form.useWatch('autoCreateOneToOneCourse', form)
  const oneToOneCourseName = Form.useWatch('oneToOneCourseName', form)
  const hireDate = Form.useWatch('hireDate', form)
  const same = JSON.stringify(staffEditSnapshot({ idCard, gender, positionId, status, isSubstituteTeacher, autoCreateOneToOneCourse, oneToOneCourseName, hireDate })) === JSON.stringify(staffEditBaseline(props.person, props.origin))
  return <Button type="primary" htmlType="submit" disabled={props.loading || same}>保存</Button>
}

function handoverCandidates(people: Person[], sourceId: number): Person[] {
  return people.filter((item) => item.id !== sourceId && item.status !== 0 && item.isSubstituteTeacher)
}

function handoverLines(check: Record<string, unknown>): string[] {
  const rows = [
    ['在读学员', check.activeStudentCount],
    ['一对一', check.oneToOneStudentCount],
    ['未来课次', check.futureScheduleCount],
    ['固定课表', check.templateScheduleCount],
    ['有效学员卡', check.activeCardCount],
    ['课程', check.activeGroupCount],
  ]
  return rows.filter((item) => Number(item[1] || 0) > 0).map((item) => `${item[0]} ${item[1]}`)
}

export function Teachers({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Person[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [keyword, setKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sourceId, setSourceId] = useState<number | undefined>()
  const [roleName, setRoleName] = useState('')
  const [sourceStaff, setSourceStaff] = useState<Person[]>([])
  const [editing, setEditing] = useState<Person | null>(null)
  const [addForm] = Form.useForm()
  const [importForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [courseLocked, setCourseLocked] = useState(false)
  const [courseLoading, setCourseLoading] = useState(false)
  const [originCourse, setOriginCourse] = useState({ auto: false, name: '' })
  const [offboard, setOffboard] = useState<{ person: Person; action: 'RESIGN' | 'DELETE'; check: Record<string, unknown> } | null>(null)
  async function load() {
    if (!campusId) return
    setRows(await getJson(`/campus-teacher/campus/${campusId}`))
    setPositions(await getJson('/org-positions/list', { campusId }))
    setCampuses(await getJson('/campus/list'))
  }
  useEffect(() => { load().catch((error) => message.error(tell(error, '老师加载失败'))) }, [campusId])
  useEffect(() => {
    if (!sourceId) {
      setSourceStaff([])
      return
    }
    getJson<Person[]>(`/campus-teacher/campus/${sourceId}`).then(setSourceStaff).catch(() => setSourceStaff([]))
  }, [sourceId])
  useEffect(() => {
    if (!editing || !campusId || !editing.isSubstituteTeacher) {
      setCourseLocked(false)
      setCourseLoading(false)
      setOriginCourse({ auto: false, name: '' })
      return
    }
    let alive = true
    setCourseLoading(true)
    setCourseLocked(false)
    getJson<Array<{ internal?: boolean; name?: string }>>('/student-groups/list', {
      campusId,
      coachId: editing.id,
      includeInternal: true,
    }).then((groups) => {
      if (!alive) return
      const course = (groups || []).find((item) => item.internal)
      const name = course ? (String(course.name || '').trim() || defaultOneToOneName(editing.nickname || editing.displayName)) : ''
      const next = { auto: !!course, name }
      setOriginCourse(next)
      setCourseLocked(!!course)
      if (course) editForm.setFieldsValue({ autoCreateOneToOneCourse: true, oneToOneCourseName: name })
    }).catch(() => {
      if (alive) {
        setCourseLocked(false)
        setOriginCourse({ auto: false, name: '' })
      }
    }).finally(() => {
      if (alive) setCourseLoading(false)
    })
    return () => { alive = false }
  }, [editing, campusId])
  async function finishOffboard(person: Person, action: 'RESIGN' | 'DELETE', replacementMemberId?: number) {
    await postJson(`/org-members/coaches/${person.id}/offboard`, { campusId, action, replacementMemberId })
    message.success(action === 'DELETE' ? '已删除' : '已办理离职')
    setOffboard(null)
    setEditing(null)
    await load()
  }
  async function startOffboard(person: Person, action: 'RESIGN' | 'DELETE') {
    const deleting = action === 'DELETE'
    try {
      const result = await postJson<Record<string, unknown>>(`/org-members/coaches/${person.id}/handover-check`, { campusId, action })
      if (result?.replacementRequired) {
        setOffboard({ person, action, check: result || {} })
        return
      }
      const name = person.displayName || person.nickname || '该人员'
      Modal.confirm({
        title: deleting ? '确认删除人员' : '确认办理离职',
        content: deleting
          ? `确定删除“${name}”吗？人员权限将被移除，历史记录仍会保留。`
          : `确定将“${name}”设为离职吗？历史记录仍会保留。`,
        okText: deleting ? '确认删除' : '确认离职',
        okButtonProps: deleting ? { danger: true } : undefined,
        onOk: () => finishOffboard(person, action).catch((error) => message.error(tell(error, deleting ? '删除失败' : '离职失败'))),
      })
    } catch (error) {
      const text = tell(error, '')
      if (text) Modal.info({ title: deleting ? '不能删除' : '不能离职', content: text, okText: '我知道了' })
      else message.warning('交接检查失败')
    }
  }
  if (!campusId) return <p>请先选择校区。</p>
  const visibleRows = rows.filter((item) => {
    const query = keyword.trim().toLowerCase()
    if (!query) return true
    return [item.displayName, item.nickname, item.phone, item.positionName].some((value) => String(value || '').toLowerCase().includes(query))
  })
  return (
    <section className="work-card staff-settings-card">
      <header className="staff-list-head">
        <div className="staff-list-title">
          <h2>老师列表</h2>
          <span>共 {rows.length} 人</span>
        </div>
        <div className="staff-list-tools">
          <Input.Search allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名/电话" />
          {campuses.some((item) => item.id !== campusId) ? <Button onClick={() => setImporting(true)}>从其他校区导入</Button> : null}
          <Button type="primary" onClick={() => setAdding(true)}>添加老师</Button>
        </div>
      </header>
      <Table
        rowKey="id"
        dataSource={visibleRows}
        pagination={false}
        locale={{ emptyText: keyword ? '没有匹配的老师' : '暂无老师，请先添加' }}
        columns={[
          { title: '姓名', render: (_: unknown, row: Person) => row.displayName || row.nickname },
          { title: '手机号', render: (_: unknown, row: Person) => row.phone ? <Space size={4}><span>{row.phone}</span><PhoneCopyButton onClick={async () => { if (await copyPlainText(String(row.phone || ''))) message.success('已复制') }} /></Space> : '—' },
          { title: '职位', render: (_: unknown, row: Person) => row.positionName || '—' },
          { title: '状态', render: (_: unknown, row: Person) => <span className={row.status === 0 ? 'status-pill is-muted' : 'status-pill is-ok'}>{row.status === 0 ? '离职' : '在职'}</span> },
          { title: '带课老师', render: (_: unknown, row: Person) => row.isSubstituteTeacher ? '是' : '否' },
          {
            title: '操作',
            render: (_: unknown, row: Person) => (
              <div className="staff-row-actions">
                <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
                {row.status === 0 ? <span aria-hidden="true" /> : <Button type="link" onClick={() => startOffboard(row, 'RESIGN')}>离职</Button>}
                <Button type="link" danger onClick={() => startOffboard(row, 'DELETE')}>移出校区</Button>
              </div>
            ),
          },
        ]}
      />
      <Modal title="添加老师" open={adding} onCancel={() => setAdding(false)} footer={null} destroyOnHidden width={720}>
      <Form form={addForm} layout="vertical" className="staff-form-grid" onFinish={async (values: { phone: string; nickname?: string; gender?: string; positionId?: number; isSubstituteTeacher?: boolean; hireDate?: string; idCard?: string; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string }) => {
        const error = staffFormError(values, rows, positions)
        if (error) {
          message.warning(error)
          return
        }
        try {
          await postJson('/org-members/coaches', {
            ...values,
            campusId,
            nickname: String(values.nickname || '').trim(),
            phone: String(values.phone || '').trim(),
            idCard: String(values.idCard || '').trim().toUpperCase() || undefined,
            autoCreateOneToOneCourse: !!values.isSubstituteTeacher && !!values.autoCreateOneToOneCourse,
            oneToOneCourseName: values.isSubstituteTeacher && values.autoCreateOneToOneCourse ? String(values.oneToOneCourseName || '').trim() : undefined,
          })
          message.success('添加成功')
          setAdding(false)
          addForm.resetFields()
          await load()
        } catch (error) {
          message.error(tell(error, '保存失败'))
        }
      }}>
        <Form.Item name="nickname" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input placeholder="请输入姓名" maxLength={6} /></Form.Item>
        <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}><Select placeholder="请选择性别" options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} /></Form.Item>
        <Form.Item name="idCard" label="身份证号"><Input placeholder="请输入身份证号" maxLength={18} /></Form.Item>
        <Form.Item name="phone" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}><Input placeholder="请输入手机号" maxLength={11} /></Form.Item>
        <Form.Item noStyle shouldUpdate>
          {(form) => <Form.Item label="出生日期"><Input disabled placeholder="输入身份证号后自动带出" value={birthDateFromIdCard(form.getFieldValue('idCard'))} /></Form.Item>}
        </Form.Item>
        <Form.Item name="hireDate" label="入职日期" rules={[{ required: true, message: '请选择入职日期' }]}><BusinessDatePicker /></Form.Item>
        <Form.Item name="positionId" label="职位" className="staff-form-full" rules={[{ required: true, message: '请选择职位' }]}><Select allowClear placeholder="请选择职位" options={roleChoices(positions, rows)} /></Form.Item>
        <div className="staff-form-full staff-switch-form-item">
          <div className="staff-switch-copy"><strong>是否为带课老师</strong><span>开启后可继续设置是否自动创建一对一课程</span></div>
          <Form.Item name="isSubstituteTeacher" noStyle valuePropName="checked">
            <Switch onChange={(checked) => {
              if (!checked) addForm.setFieldsValue({ autoCreateOneToOneCourse: false, oneToOneCourseName: '' })
            }} />
          </Form.Item>
        </div>
        <Form.Item noStyle shouldUpdate>
          {(form) => form.getFieldValue('isSubstituteTeacher') ? (
            <>
              <div className="staff-form-full staff-switch-form-item">
                <div className="staff-switch-copy"><strong>自动创建一对一课程</strong><span>保存老师后同步创建课程</span></div>
                <Form.Item name="autoCreateOneToOneCourse" noStyle valuePropName="checked">
                  <Switch onChange={(checked) => {
                    form.setFieldValue('oneToOneCourseName', checked ? (String(form.getFieldValue('oneToOneCourseName') || '').trim() || defaultOneToOneName(form.getFieldValue('nickname'))) : '')
                  }} />
                </Form.Item>
              </div>
              {form.getFieldValue('autoCreateOneToOneCourse') ? <Form.Item className="staff-form-full" name="oneToOneCourseName" label="一对一课程名称"><Input maxLength={30} placeholder="请输入课程名称" /></Form.Item> : null}
            </>
          ) : null}
        </Form.Item>
        <div className="staff-form-actions staff-form-full"><Button onClick={() => setAdding(false)}>取消</Button><Button type="primary" htmlType="submit">保存</Button></div>
      </Form>
      </Modal>
      <Modal title="从其他校区导入老师" open={importing} onCancel={() => setImporting(false)} footer={null} destroyOnHidden width={640}>
      <Form
        form={importForm}
        layout="vertical"
        onFinish={async (values: { teacherIds: number[]; positionId: number; importSourceCampusId: number }) => {
          if (!campuses.some((item) => item.id !== campusId)) {
            message.warning('暂无可导入的校区')
            return
          }
          if (!(values.teacherIds || []).length) {
            message.warning('请选择要导入的人员')
            return
          }
          if (!values.positionId) {
            message.warning('请选择导入后职位')
            return
          }
          const here = new Set(rows.map((item) => item.id))
          const ids = (values.teacherIds || []).filter((id) => !here.has(id))
          if (!ids.length) {
            message.warning('所选人员已存在当前校区')
            return
          }
          const targetPosition = positions.find((item) => item.id === values.positionId)
          const adminCount = rows.filter((item) => item.campusAdmin || positions.some((position) => position.campusAdmin && position.id === item.positionId)).length
          if (targetPosition?.campusAdmin && adminCount + ids.length > 2) {
            message.warning('一个校区最多设置两名校区管理员')
            return
          }
          try {
            for (const teacherId of ids) {
              const person = sourceStaff.find((item) => item.id === teacherId)
              await postJson('/campus-teacher', {
                campusId,
                teacherId,
                positionId: values.positionId,
                status: 1,
                importSourceCampusId: values.importSourceCampusId,
                nickname: person?.nickname || person?.displayName,
                phone: person?.phone,
                idCard: person?.idCard,
                gender: person?.gender,
              })
            }
            message.success('导入成功')
            setImporting(false)
            importForm.resetFields()
            setSourceId(undefined)
            await load()
          } catch (error) {
            message.error(tell(error, '导入失败'))
            await load()
          }
        }}
      >
        <Form.Item name="importSourceCampusId" rules={[{ required: true }]}>
          <Select
            placeholder="来源校区"
            options={campuses.filter((item) => item.id !== campusId).map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setSourceId(value)}
          />
        </Form.Item>
        <Form.Item name="teacherIds" rules={[{ required: true, message: '请选择要导入的人员' }]}>
          <Select
            mode="multiple"
            placeholder={sourceId ? '选择要导入的人员' : '先选择来源校区'}
            options={sourceStaff.filter((item) => !rows.some((row) => row.id === item.id)).map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))}
          />
        </Form.Item>
        <Form.Item name="positionId" label="导入后职位" rules={[{ required: true, message: '请选择导入后职位' }]}><Select placeholder="请选择职位" options={positions.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <div className="staff-create-role"><Input maxLength={6} placeholder="没有合适职位？输入新职位" value={roleName} onChange={(event) => setRoleName(event.target.value)} /><Button onClick={async () => {
          const name = roleName.trim()
          if (!name) {
            message.warning('请输入新职位')
            return
          }
          if (Array.from(name).length > 6) {
            message.warning('职位名称最多6个字')
            return
          }
          const existing = positions.find((item) => String(item.name || '').trim() === name)
          if (existing) {
            importForm.setFieldValue('positionId', existing.id)
            setRoleName('')
            message.info('已选择已有职位')
            return
          }
          try {
            const saved = await postJson<{ id?: number }>('/org-positions', { name, campusId })
            message.success('已新增职位')
            setRoleName('')
            await load()
            if (saved?.id) importForm.setFieldValue('positionId', saved.id)
          } catch (error) {
            message.error(tell(error, '新增失败'))
          }
        }} htmlType="button">新增并选中</Button></div>
        <div className="staff-form-actions"><Button onClick={() => setImporting(false)}>取消</Button><Button type="primary" htmlType="submit">确认导入</Button></div>
      </Form>
      </Modal>
      <Modal title="编辑老师" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing ? (
          <Form
            form={editForm}
            layout="vertical"
            initialValues={{
              nickname: editing.nickname || editing.displayName,
              phone: editing.phone,
              gender: editing.gender,
              positionId: editing.positionId,
              status: editing.status ?? 1,
              isSubstituteTeacher: editing.isSubstituteTeacher,
              hireDate: String(editing.hireDate || '').slice(0, 10),
              idCard: editing.idCard,
              autoCreateOneToOneCourse: false,
              oneToOneCourseName: '',
            }}
            onFinish={async (values: { nickname?: string; phone?: string; positionId?: number; hireDate?: string; idCard?: string; status?: number; isSubstituteTeacher?: boolean; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string; gender?: string }) => {
              if (courseLoading) return
              if (JSON.stringify(staffEditSnapshot(values)) === JSON.stringify(staffEditBaseline(editing, originCourse))) return
              const resigning = (editing.status ?? 1) !== 0 && values.status === 0
              const active = Number(values.status ?? 1) === 1
              const substitute = active && !!values.isSubstituteTeacher
              const otherChanged = String(values.nickname || '').trim() !== String(editing.nickname || editing.displayName || '').trim()
                || String(values.phone || '').trim() !== String(editing.phone || '').trim()
                || values.positionId !== editing.positionId
                || !!values.isSubstituteTeacher !== !!editing.isSubstituteTeacher
                || String(values.gender || '') !== String(editing.gender || '')
                || String(values.hireDate || '').slice(0, 10) !== String(editing.hireDate || '').slice(0, 10)
                || String(values.idCard || '').trim().toUpperCase() !== String(editing.idCard || '').trim().toUpperCase()
                || !!values.autoCreateOneToOneCourse !== originCourse.auto
                || String(values.oneToOneCourseName || '').trim() !== originCourse.name
              if (resigning && otherChanged) {
                Modal.info({ title: '请先保存其它修改', content: '离职不能与其它资料修改同时提交。请先恢复为在职并保存其它修改，再单独办理离职。', okText: '我知道了' })
                return
              }
              const wasAdmin = !!editing.campusAdmin || positions.some((item) => item.campusAdmin && item.id === editing.positionId)
              const stillAdmin = positions.some((item) => item.campusAdmin && item.id === values.positionId)
              const activeAdmins = rows.filter((item) => item.id !== editing.id && item.status !== 0 && (item.campusAdmin || positions.some((position) => position.campusAdmin && position.id === item.positionId)))
              if (wasAdmin && !stillAdmin && activeAdmins.length === 0) {
                message.warning('当前校区至少需要一名在职校区管理员')
                return
              }
              const error = staffFormError(values, rows, positions, editing.id)
              if (error) {
                message.warning(error)
                return
              }
              if (resigning) {
                await startOffboard(editing, 'RESIGN')
                return
              }
              if (editing.isSubstituteTeacher && !values.isSubstituteTeacher) {
                try {
                  const check = await postJson<{ allowed?: boolean; message?: string }>(`/org-members/coaches/${editing.id}/status-check`, {
                    campusId,
                    status: values.status ?? 1,
                    isSubstituteTeacher: false,
                  })
                  if (check && check.allowed === false) {
                    Modal.info({ title: '无法修改带课状态', content: check.message || '该老师仍有关联的有效学员权益或未来排课', okText: '我知道了' })
                    return
                  }
                } catch (error) {
                  message.error(tell(error, '状态校验失败'))
                  return
                }
              }
              try {
                await putJson(`/org-members/coaches/${editing.id}`, {
                  ...values,
                  campusId,
                  nickname: String(editing.nickname || editing.displayName || '').trim(),
                  phone: String(editing.phone || '').trim(),
                  idCard: String(values.idCard || '').trim().toUpperCase() || undefined,
                  autoCreateOneToOneCourse: substitute && !!values.autoCreateOneToOneCourse,
                  oneToOneCourseName: substitute && values.autoCreateOneToOneCourse ? String(values.oneToOneCourseName || '').trim() : undefined,
                })
                message.success('修改成功')
                setEditing(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="nickname" label="姓名"><Input maxLength={6} disabled /></Form.Item>
            <Form.Item name="phone" label="手机号"><Input maxLength={11} disabled /></Form.Item>
            <Form.Item name="hireDate" label="入职日期" extra="用于按记薪周期统计固定工资" rules={[{ required: true, message: '请选择入职日期' }]}><BusinessDatePicker /></Form.Item>
            <Form.Item name="idCard" label="身份证号"><Input maxLength={18} /></Form.Item>
            <Form.Item label="出生日期" shouldUpdate>
              {() => <Input disabled placeholder="输入身份证号后自动带出" value={birthDateFromIdCard(editForm.getFieldValue('idCard'))} />}
            </Form.Item>
            <Form.Item name="gender" label="性别"><Select options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} /></Form.Item>
            <Form.Item name="positionId" label="职位"><Select options={roleChoices(positions, rows, editing.id, editing.positionId)} /></Form.Item>
            <Form.Item name="status" label="在职状态"><Select options={[{ value: 1, label: '在职' }, { value: 0, label: '离职' }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate>
              {(form) => {
                const employed = Number(form.getFieldValue('status') ?? 1) === 1
                const substitute = employed && !!form.getFieldValue('isSubstituteTeacher')
                return (
                  <>
                    <Form.Item name="isSubstituteTeacher" label="是否为带课老师" valuePropName="checked" hidden={!employed} preserve>
                      <Switch onChange={(checked) => {
                        if (!checked && !courseLocked) form.setFieldsValue({ autoCreateOneToOneCourse: false, oneToOneCourseName: '' })
                      }} />
                    </Form.Item>
                    {substitute ? (
                      courseLoading ? <p>正在加载老师的一对一课程设置...</p> : (
                        <>
                          <Form.Item name="autoCreateOneToOneCourse" label="是否自动创建一对一课程" valuePropName="checked" extra={courseLocked ? '已创建的一对一课程不能关闭或改名。' : '仅当此开关开启时，保存人员后才会自动建课。'}>
                            <Switch disabled={courseLocked} onChange={(checked) => {
                              if (courseLocked) return
                              form.setFieldValue('oneToOneCourseName', checked ? (String(form.getFieldValue('oneToOneCourseName') || '').trim() || defaultOneToOneName(form.getFieldValue('nickname'))) : '')
                            }} />
                          </Form.Item>
                          {form.getFieldValue('autoCreateOneToOneCourse') ? (
                            <Form.Item name="oneToOneCourseName" label="一对一课程名称" extra={courseLocked ? '如需修改请到课程管理页面进行修改' : '默认会使用“姓名 + 一对一课程”，也可以改成自定义名称。'}>
                              <Input maxLength={30} disabled={courseLocked} />
                            </Form.Item>
                          ) : null}
                        </>
                      )
                    ) : null}
                  </>
                )
              }}
            </Form.Item>
            <StaffEditSaveButton person={editing} origin={originCourse} loading={courseLoading} />
          </Form>
        ) : null}
      </Modal>
      <Modal title={offboard?.action === 'DELETE' ? '删除人员并交接' : '办理离职交接'} open={!!offboard} onCancel={() => setOffboard(null)} footer={null} destroyOnHidden>
        {offboard ? (
          <>
            <p>原带课老师：{offboard.person.displayName || offboard.person.nickname || '该人员'}</p>
            <p>本次交接会将以下业务统一转交给接替老师，请确认后再继续。</p>
            <p>{offboard.action === 'DELETE' ? '交接完成后，该人员将移出当前校区并移除相关权限；历史记录仍会保留。' : '交接完成后，该人员将标记为离职；历史记录仍会保留。'}</p>
            <div className="stat-line">
              <span>待交接业务<strong>共 {Number(offboard.check.totalCount || 0)} 项</strong></span>
            </div>
            <ul>
              {handoverLines(offboard.check).map((line) => <li key={line}>{line}</li>)}
            </ul>
            <Form layout="vertical" onFinish={async (values: { replacementMemberId?: number }) => {
              if (!values.replacementMemberId) {
                message.warning('请选择接替老师')
                return
              }
              try {
                await finishOffboard(offboard.person, offboard.action, values.replacementMemberId)
              } catch (error) {
                message.error(tell(error, offboard.action === 'DELETE' ? '删除失败' : '离职失败'))
              }
            }}>
              <Form.Item name="replacementMemberId" label="选择接替老师" extra="必选" rules={[{ required: true, message: '请选择接替老师' }]}>
                <Select options={handoverCandidates(rows, offboard.person.id).map((item) => ({ value: item.id, label: [item.displayName || item.nickname || item.phone, item.positionName || '带课老师'].filter(Boolean).join(' · ') }))} />
              </Form.Item>
              {!handoverCandidates(rows, offboard.person.id).length ? <p>暂无可接替的在职带课老师。请先添加或启用其他带课老师后再办理交接。</p> : null}
              <Button danger={offboard.action === 'DELETE'} type="primary" htmlType="submit">确认交接</Button>
            </Form>
          </>
        ) : null}
      </Modal>
    </section>
  )
}

function PositionRenameButton(props: { original?: string }) {
  const name = Form.useWatch('name')
  const dirty = String(name || '').trim() !== String(props.original || '').trim()
  return <Button type="primary" htmlType="submit" disabled={!dirty}>保存</Button>
}

export function Positions({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Position[]>([])
  const [editing, setEditing] = useState<Position | null>(null)
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [createForm] = Form.useForm()
  async function load() {
    if (!campusId) return
    setRows(await getJson('/org-positions/list', { campusId }))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card staff-settings-card">
      <header className="service-list-head">
        <div>
          <h2>职位设置</h2>
          <span>配置当前校区人员可选择的职位</span>
        </div>
        <Button type="primary" onClick={() => {
          createForm.resetFields()
          setCreating(true)
        }}>新增职位</Button>
      </header>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '还没有职位，请先新增' }}
        columns={[
          { title: '职位', dataIndex: 'name' },
          { title: '说明', render: (_: unknown, row: Position) => row.campusAdmin ? '系统管理职位，不可删除' : '' },
          {
            title: '操作',
            render: (_: unknown, row: Position) => (
              <Space>
                <Button type="link" onClick={() => setEditing(row)}>改名</Button>
                <Button type="link" danger onClick={async () => {
                  if (row.campusAdmin) {
                    message.warning('校区管理员职位不能删除')
                    return
                  }
                  if (rows.length <= 1) {
                    message.warning('至少保留一项')
                    return
                  }
                  const people = await getJson<Person[]>(`/campus-teacher/campus/${campusId}`).catch(() => [])
                  const assigned = (people || []).filter((item) => item.positionId === row.id)
                  if (assigned.length > 0) {
                    message.warning(`该职位下有${assigned.length}人，不能删除`)
                    return
                  }
                  Modal.confirm({
                    title: '确认删除',
                    content: `确定删除“${row.name || '该职位'}”吗？`,
                    okText: '删除',
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      try {
                        await delJson(`/org-positions/${row.id}`, { campusId })
                        message.success('删除成功')
                        await load()
                      } catch (error) {
                        message.error(tell(error, '删除失败'))
                      }
                    },
                  })
                }}>删除</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="新增职位"
        open={creating}
        onCancel={() => {
          if (savingCreate) return
          setCreating(false)
          createForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={async (values: { name: string }) => {
          if (savingCreate) return
          const name = String(values.name || '').trim()
          if (!name) {
            message.warning('请输入新职位')
            return
          }
          if (Array.from(name).length > 6) {
            message.warning('职位名称最多6个字')
            return
          }
          if (rows.some((item) => item.name === name)) {
            message.warning('职位名称不能重复')
            return
          }
          setSavingCreate(true)
          try {
            await postJson('/org-positions', { name, campusId })
            message.success('已新增职位')
            setCreating(false)
            createForm.resetFields()
            await load()
          } catch (error) {
            message.error(tell(error, '新增失败'))
          } finally {
            setSavingCreate(false)
          }
        }}>
          <Form.Item name="name" label="职位名称" rules={[{ required: true, message: '请输入新职位' }]} extra="最多6个字，同一校区内不能重复">
            <Input placeholder="请输入职位名称" maxLength={6} showCount autoFocus />
          </Form.Item>
          <div className="staff-form-actions">
            <Button disabled={savingCreate} onClick={() => {
              setCreating(false)
              createForm.resetFields()
            }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={savingCreate}>确认新增</Button>
          </div>
        </Form>
      </Modal>
      <Modal title="修改职位名称" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{ name: editing.name }}
            onFinish={async (values: { name: string }) => {
              const name = String(values.name || '').trim()
              if (name === String(editing.name || '').trim()) return
              if (!name) {
                message.warning('请输入职位名称')
                return
              }
              if (Array.from(name).length > 6) {
                message.warning('职位名称最多6个字')
                return
              }
              if (rows.some((item) => item.id !== editing.id && item.name === name)) {
                message.warning('职位名称不能重复')
                return
              }
              try {
                await postJson('/org-positions', { ...editing, name, campusId })
                message.success('保存成功')
                setEditing(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入职位名称' }]}><Input maxLength={6} /></Form.Item>
            <PositionRenameButton original={editing.name} />
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

export function Permissions({ campusId }: { campusId: number | null }) {
  const [preset, setPreset] = useState('standard')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!campusId) return
    getJson<{ permissionPreset?: string }>(`/campus-staff/${campusId}/settings`).then((data) => setPreset(data?.permissionPreset || 'standard')).catch(() => undefined)
  }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  const options = [
    { value: 'admin', label: '管理员' },
    { value: 'standard', label: '标准' },
    { value: 'limited', label: '受限' },
  ]
  async function choose(value: string) {
    if (!campusId || value === preset || saving) return
    const previous = preset
    setPreset(value)
    setSaving(true)
    try {
      await postJson(`/campus-staff/${campusId}/settings`, { permissionPreset: value })
      message.success('权限预设已保存')
    } catch (error) {
      setPreset(previous)
      message.error(tell(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="work-card">
      <p>为当前校区选择默认权限预设。</p>
      <div className="permission-options">
        {options.map((item) => (
          <button key={item.value} type="button" className={preset === item.value ? 'is-on' : ''} disabled={saving} onClick={() => { choose(item.value).catch(() => undefined) }}>{item.label}</button>
        ))}
      </div>
    </section>
  )
}
