import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedOrg, PageHead, money, tell, useShell } from './kit'

interface Campus {
  id: number
  name: string
  address?: string
  contactPerson?: string
  contactPhone?: string
  visibleInList?: boolean
  status?: number
}

interface Person {
  id: number
  phone?: string
  nickname?: string
  displayName?: string
  gender?: string
  status?: number
  isSubstituteTeacher?: boolean
  positionId?: number
  positionName?: string
  campusAdmin?: boolean
  hireDate?: string
  idCard?: string
}

interface Position {
  id?: number
  name: string
  campusAdmin?: boolean
  campusId?: number
}

function canManageCampusSalary(user: { id?: number; role?: string; campusAdminCampusIds?: number[] } | null, org: { ownerId?: number; campusAdminManageSalary?: number } | null, campusId: number | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  if (role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId)) return true
  const scope = (user?.campusAdminCampusIds || []).map((id) => Number(id || 0))
  return Number(org?.campusAdminManageSalary) === 1 && !!campusId && scope.includes(Number(campusId))
}

export function CampusPage() {
  const shell = useShell()
  const campusId = shell.campusId
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const salaryAllowed = canManageCampusSalary(shell.user, currentOrg, campusId)
  return (
    <NeedOrg orgId={shell.currentOrgId}>
      <PageHead title="校区与老师" extra="校区资料、服务、老师、职位、权限和工资。" />
      <Tabs
        onChange={(key) => {
          if (key === 'salary' && !salaryAllowed) message.warning('当前不能设置员工工资')
        }}
        items={[
          { key: 'campus', label: '校区', children: <CampusList /> },
          { key: 'service', label: '服务项目', children: <Services campusId={campusId} /> },
          { key: 'teacher', label: '老师', children: <Teachers campusId={campusId} /> },
          { key: 'position', label: '职位', children: <Positions campusId={campusId} /> },
          { key: 'permission', label: '权限', children: <Permissions campusId={campusId} /> },
          { key: 'salary', label: '工资设置', children: salaryAllowed ? <CampusSalary campusId={campusId} /> : <p>当前不能设置员工工资</p> },
          { key: 'academic', label: '教务设置', children: <AcademicSettings campusId={campusId} /> },
        ]}
      />
    </NeedOrg>
  )
}

function campusFormError(values: Partial<Campus>) {
  const name = String(values.name || '').trim()
  const address = String(values.address || '').trim()
  const manager = String(values.contactPerson || '').trim()
  const phone = String(values.contactPhone || '').replace(/\D+/g, '').slice(0, 11)
  if (!name) return '请输入校区名称'
  if (Array.from(name).length > 15) return '校区名称最多15字'
  if (!address) return '请输入详细地址'
  if (Array.from(address).length > 30) return '地址最多30字'
  if (!manager) return '请输入负责人'
  if (Array.from(manager).length > 6) return '负责人最多6字'
  if (!phone) return '请输入联系电话'
  if (!/^1[3-9]\d{9}$/.test(phone)) return '请输入正确的联系电话'
  return ''
}

function sameCampus(left: Partial<Campus>, right: Partial<Campus>) {
  return String(left.name || '').trim() === String(right.name || '').trim()
    && String(left.address || '').trim() === String(right.address || '').trim()
    && String(left.contactPerson || '').trim() === String(right.contactPerson || '').trim()
    && String(left.contactPhone || '').replace(/\D+/g, '') === String(right.contactPhone || '').replace(/\D+/g, '')
}

function CampusList() {
  const shell = useShell()
  const [rows, setRows] = useState<Campus[]>([])
  const [online, setOnline] = useState('all')
  const [editing, setEditing] = useState<Campus | 'new' | null>(null)
  const [quota, setQuota] = useState<{ canCreate?: boolean; campusCount?: number; campusLimit?: number } | null>(null)
  const role = String(shell.user?.role || '').trim().toLowerCase()
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const orgManager = role === 'owner' || role === 'admin' || (shell.user?.id != null && currentOrg?.ownerId === shell.user.id)
  const managedIds = shell.user?.campusAdminCampusIds || []
  async function load() {
    const list = await getJson<Campus[]>('/campus/list')
    const visible = orgManager ? list : list.filter((item) => managedIds.includes(item.id))
    setRows(visible || [])
    if (orgManager) {
      setQuota(await getJson<{ canCreate?: boolean; campusCount?: number; campusLimit?: number }>('/campus/quota').catch(() => null))
    } else {
      setQuota(null)
    }
    shell.reload()
  }
  useEffect(() => { load().catch((error) => message.error(tell(error, '校区加载失败'))) }, [shell.currentOrgId])
  function openCreate() {
    if (!orgManager) {
      message.warning('校区管理员不可新增校区')
      return
    }
    if (!quota) {
      message.warning('创建额度加载失败，请稍后重试')
      return
    }
    if (quota.canCreate !== true) {
      message.warning('当前会员校区数量已达上限')
      return
    }
    setEditing('new')
  }
  const onlineCount = rows.filter((row) => row.visibleInList !== false).length
  return (
    <section className="work-card">
      <div className="stat-line">
        <span>校区<strong>{rows.length}</strong></span>
        <span>已上线<strong>{onlineCount}</strong></span>
        <span>已下线<strong>{rows.length - onlineCount}</strong></span>
        {quota ? <span>额度<strong>{quota.campusCount ?? 0}/{quota.campusLimit ?? 0}</strong></span> : null}
      </div>
      <div className="work-toolbar">
        {orgManager ? <Button type="primary" onClick={openCreate}>新建校区</Button> : null}
        <Select
          style={{ width: 140 }}
          value={online}
          onChange={setOnline}
          options={[
            { value: 'all', label: '全部校区' },
            { value: 'online', label: '已上线' },
            { value: 'offline', label: '已下线' },
          ]}
        />
      </div>
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        dataSource={rows.filter((row) => online === 'all' || (online === 'offline' ? row.visibleInList === false : row.visibleInList !== false))}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '地址', dataIndex: 'address' },
          { title: '校区管理员', dataIndex: 'contactPerson' },
          { title: '电话', dataIndex: 'contactPhone' },
          { title: '上线', render: (_: unknown, row: Campus) => <span className={row.visibleInList === false ? 'status-pill is-muted' : 'status-pill is-ok'}>{row.visibleInList === false ? '下线' : '上线'}</span> },
          {
            title: '操作',
            render: (_: unknown, row: Campus) => (
              <Space>
                <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
                {orgManager ? (
                  <Button type="link" onClick={async () => {
                    const goingOffline = row.visibleInList !== false
                    try {
                      if (goingOffline) {
                        const check = await getJson<{ offlinable?: boolean; activeStudentCount?: number }>(`/campus/${row.id}/offline-check`)
                        if (check && check.offlinable === false) {
                          const count = Number(check.activeStudentCount || 0)
                          Modal.info({ title: '不能下线', content: count > 0 ? `该校区已有${count}名学员出现在活动课表中，不能下线` : '该校区已有学员出现在活动课表中，不能下线', okText: '我知道了' })
                          return
                        }
                      }
                      await putJson('/campus', { id: row.id, name: row.name, visibleInList: !goingOffline })
                      message.success(goingOffline ? '已下线' : '已上线')
                      await load()
                    } catch (error) {
                      message.error(tell(error, '更新失败，请稍后重试'))
                    }
                  }}>{row.visibleInList === false ? '上线' : '下线'}</Button>
                ) : null}
                {orgManager ? (
                  <Button type="link" danger onClick={() => {
                    Modal.confirm({
                      title: '确认删除',
                      content: `确定删除校区「${row.name || '该校区'}」吗？删除后该校区所有信息将被清空。`,
                      okText: '删除',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        try {
                          const check = await getJson<{ deletable?: boolean }>(`/campus/${row.id}/delete-check`)
                          if (check && check.deletable === false) {
                            Modal.info({ title: '不能删除', content: '该校区已有排课班级或学员，不能删除', okText: '我知道了' })
                            return
                          }
                          await delJson(`/campus/${row.id}`)
                          message.success('删除成功')
                          await load()
                        } catch (error) {
                          const text = tell(error, '删除失败')
                          if (text.includes('该校区已有排课班级或学员，不能删除')) {
                            Modal.info({ title: '不能删除', content: text, okText: '我知道了' })
                            return
                          }
                          message.error(text)
                        }
                      },
                    })
                  }}>删除</Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing === 'new' ? '新建校区' : '编辑校区'} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={editing && editing !== 'new' ? editing : undefined}
          onFinish={async (values: Partial<Campus>) => {
            const error = campusFormError(values)
            if (error) {
              message.warning(error)
              return
            }
            const current = editing && editing !== 'new' ? editing : null
            if (current && sameCampus(current, values)) {
              message.warning('请先修改校区信息')
              return
            }
            const payload = {
              name: String(values.name || '').trim(),
              address: String(values.address || '').trim(),
              contactPerson: String(values.contactPerson || '').trim(),
              contactPhone: String(values.contactPhone || '').replace(/\D+/g, '').slice(0, 11),
              visibleInList: current ? current.visibleInList !== false : true,
            }
            try {
              if (current) await putJson('/campus', { ...payload, id: current.id })
              else await postJson('/campus', payload)
              message.success(current ? '保存成功' : '创建成功')
              setEditing(null)
              await load()
            } catch (error) {
              message.error(tell(error, '保存失败'))
            }
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入校区名称' }]}><Input maxLength={15} /></Form.Item>
          <Form.Item name="address" label="详细地址" rules={[{ required: true, message: '请输入详细地址' }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="contactPerson" label="负责人" rules={[{ required: true, message: '请输入负责人' }]}><Input maxLength={6} /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}><Input maxLength={11} /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
    </section>
  )
}

function serviceError(values: { serviceName?: string; price?: number; durationHours?: number }) {
  const name = String(values.serviceName || '').trim()
  const price = values.price == null ? 0 : Number(values.price)
  const hours = values.durationHours == null ? 0 : Number(values.durationHours)
  if (!name) return '请输入服务名称'
  if (Array.from(name).length > 8) return '服务名称最多8个字'
  if (!Number.isFinite(price) || price < 0) return '请输入正确的价格'
  if (price > 999999.99) return '价格不能超过999999.99'
  if (!(hours >= 0.5)) return '请输入服务时长'
  if (hours > 10) return '服务时长不能超过10小时'
  if (Math.abs(hours * 2 - Math.round(hours * 2)) > 0.001) return '服务时长须为0.5小时的倍数'
  return ''
}

function Services({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  async function load() {
    if (!campusId) return
    setRows(await getJson(`/campus-services/${campusId}/items`))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card">
      <Form layout="inline" onFinish={async (values: { serviceName: string; price?: number; durationHours?: number; description?: string }) => {
        const error = serviceError(values)
        if (error) {
          message.warning(error)
          return
        }
        try {
          await postJson(`/campus-services/${campusId}/items`, {
            serviceName: values.serviceName.trim(),
            price: values.price ?? 0,
            durationMinutes: Math.round(Number(values.durationHours) * 60),
            description: String(values.description || '').trim(),
            enabled: 1,
          })
          message.success('新增成功')
          await load()
        } catch (error) {
          message.error(tell(error, '新增失败'))
        }
      }}>
        <Form.Item name="serviceName" rules={[{ required: true, message: '请输入服务名称' }]}><Input placeholder="服务名称" maxLength={8} /></Form.Item>
        <Form.Item name="price"><InputNumber placeholder="单价" min={0} max={999999.99} /></Form.Item>
        <Form.Item name="durationHours" initialValue={1}><InputNumber placeholder="时长小时" min={0.5} max={10} step={0.5} /></Form.Item>
        <Form.Item name="description"><Input placeholder="说明" /></Form.Item>
        <Button htmlType="submit">添加</Button>
      </Form>
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'serviceName' },
          { title: '说明', dataIndex: 'description' },
          { title: '单价', dataIndex: 'price' },
          { title: '时长', render: (_: unknown, row: Record<string, unknown>) => `${Number(row.durationMinutes || 0) / 60}小时` },
          { title: '启用', render: (_: unknown, row: Record<string, unknown>) => Number(row.enabled) === 0 ? '停用' : '启用' },
          {
            title: '操作',
            render: (_: unknown, row: Record<string, unknown>) => (
              <Space>
                <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
                <Button type="link" onClick={async () => {
                  const nextEnabled = Number(row.enabled) === 0 ? 1 : 0
                  try {
                    await putJson(`/campus-services/${campusId}/items/${row.id}`, { ...row, enabled: nextEnabled })
                    await load()
                  } catch (error) {
                    const text = tell(error, '保存失败')
                    if (text.includes('正在使用该服务')) Modal.info({ title: nextEnabled === 0 ? '不能关闭' : '不能操作', content: text, okText: '我知道了' })
                    else message.error(text)
                  }
                }}>{Number(row.enabled) === 0 ? '启用' : '停用'}</Button>
                <Popconfirm title="确认删除" description={`确定删除“${String(row.serviceName || '')}”吗？`} onConfirm={async () => {
                  try {
                    await delJson(`/campus-services/${campusId}/items/${row.id}`)
                    message.success('删除成功')
                    await load()
                  } catch (error) {
                    const text = tell(error, '删除失败')
                    if (text.includes('正在使用该服务')) Modal.info({ title: '不能删除', content: text, okText: '我知道了' })
                    else message.error(text)
                  }
                }}>
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="编辑服务" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{ ...editing, durationHours: Number(editing.durationMinutes || 60) / 60 }}
            onFinish={async (values: { serviceName?: string; price?: number; durationHours?: number; description?: string; enabled?: number }) => {
              const error = serviceError(values)
              if (error) {
                message.warning(error)
                return
              }
              try {
                await putJson(`/campus-services/${campusId}/items/${editing.id}`, {
                  ...editing,
                  serviceName: String(values.serviceName || '').trim(),
                  description: String(values.description || '').trim(),
                  price: values.price ?? 0,
                  durationMinutes: Math.round(Number(values.durationHours) * 60),
                  enabled: values.enabled,
                })
                message.success('保存成功')
                setEditing(null)
                await load()
              } catch (error) {
                const text = tell(error, '保存失败')
                if (text.includes('正在使用该服务')) Modal.info({ title: '不能操作', content: text, okText: '我知道了' })
                else message.error(text)
              }
            }}
          >
            <Form.Item name="serviceName" label="名称" rules={[{ required: true, message: '请输入服务名称' }]}><Input maxLength={8} /></Form.Item>
            <Form.Item name="description" label="说明"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="price" label="单价"><InputNumber style={{ width: '100%' }} min={0} max={999999.99} /></Form.Item>
            <Form.Item name="durationHours" label="时长（小时）"><InputNumber style={{ width: '100%' }} min={0.5} max={10} step={0.5} /></Form.Item>
            <Form.Item name="enabled" label="启用"><Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

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

function staffFormError(values: { nickname?: string; phone?: string; positionId?: number; hireDate?: string; idCard?: string; isSubstituteTeacher?: boolean; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string }, people: Person[], positions: Position[], currentId?: number) {
  const name = String(values.nickname || '').trim()
  const phone = String(values.phone || '').trim()
  if (!values.hireDate) return '请选择入职日期'
  if (!name) return '请输入姓名'
  if (Array.from(name).length > 6) return '姓名不能超过6个字'
  if (!phone) return '请输入联系方式'
  if (!/^1\d{10}$/.test(phone)) return '手机号格式不正确'
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

function Teachers({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Person[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [sourceId, setSourceId] = useState<number | undefined>()
  const [sourceStaff, setSourceStaff] = useState<Person[]>([])
  const [editing, setEditing] = useState<Person | null>(null)
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
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card">
      <Form layout="inline" onFinish={async (values: { phone: string; nickname?: string; gender?: string; positionId?: number; isSubstituteTeacher?: boolean; hireDate?: string; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string }) => {
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
            autoCreateOneToOneCourse: !!values.isSubstituteTeacher && !!values.autoCreateOneToOneCourse,
            oneToOneCourseName: values.isSubstituteTeacher && values.autoCreateOneToOneCourse ? String(values.oneToOneCourseName || '').trim() : undefined,
          })
          message.success('添加成功')
          await load()
        } catch (error) {
          message.error(tell(error, '保存失败'))
        }
      }}>
        <Form.Item name="phone" rules={[{ required: true, message: '请输入联系方式' }]}><Input placeholder="手机号" maxLength={11} /></Form.Item>
        <Form.Item name="nickname"><Input placeholder="姓名" maxLength={6} /></Form.Item>
        <Form.Item name="hireDate"><Input type="date" /></Form.Item>
        <Form.Item name="gender"><Select style={{ width: 90 }} allowClear options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} /></Form.Item>
        <Form.Item name="positionId"><Select style={{ width: 140 }} allowClear placeholder="职位" options={positions.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="isSubstituteTeacher" valuePropName="checked"><Switch checkedChildren="代课" unCheckedChildren="普通" /></Form.Item>
        <Button htmlType="submit">添加</Button>
      </Form>
      <Form
        style={{ marginTop: 12 }}
        layout="inline"
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
            await load()
          } catch (error) {
            message.error(tell(error, '导入失败'))
            await load()
          }
        }}
      >
        <Form.Item name="importSourceCampusId" rules={[{ required: true }]}>
          <Select
            style={{ width: 140 }}
            placeholder="来源校区"
            options={campuses.filter((item) => item.id !== campusId).map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setSourceId(value)}
          />
        </Form.Item>
        <Form.Item name="teacherIds" rules={[{ required: true, message: '请选择要导入的人员' }]}>
          <Select
            mode="multiple"
            style={{ minWidth: 220 }}
            placeholder={sourceId ? '选择要导入的人员' : '先选择来源校区'}
            options={sourceStaff.filter((item) => !rows.some((row) => row.id === item.id)).map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))}
          />
        </Form.Item>
        <Form.Item name="positionId" rules={[{ required: true, message: '请选择导入后职位' }]}><Select style={{ width: 140 }} placeholder="导入后职位" options={positions.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Button htmlType="submit">导入</Button>
      </Form>
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '姓名', render: (_: unknown, row: Person) => row.displayName || row.nickname },
          { title: '手机号', dataIndex: 'phone' },
          { title: '职位', dataIndex: 'positionName' },
          { title: '状态', render: (_: unknown, row: Person) => row.status === 0 ? '离职' : '在职' },
          { title: '代课', render: (_: unknown, row: Person) => row.isSubstituteTeacher ? '是' : '' },
          {
            title: '操作',
            render: (_: unknown, row: Person) => (
              <Space>
                <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
                <Handover person={row} campusId={campusId} people={rows} onDone={load} />
                <Popconfirm title="移出本校区？历史记录会保留。" onConfirm={async () => { await delJson(`/campus-teacher/campus/${campusId}/teacher/${row.id}`); await load() }}>
                  <Button type="link">移出校区</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="编辑老师" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{
              nickname: editing.nickname || editing.displayName,
              phone: editing.phone,
              gender: editing.gender,
              positionId: editing.positionId,
              status: editing.status ?? 1,
              isSubstituteTeacher: editing.isSubstituteTeacher,
              hireDate: editing.hireDate,
              idCard: editing.idCard,
            }}
            onFinish={async (values: { nickname?: string; phone?: string; positionId?: number; hireDate?: string; idCard?: string; status?: number; isSubstituteTeacher?: boolean; autoCreateOneToOneCourse?: boolean; oneToOneCourseName?: string; gender?: string }) => {
              const resigning = (editing.status ?? 1) !== 0 && values.status === 0
              const otherChanged = String(values.nickname || '').trim() !== String(editing.nickname || editing.displayName || '').trim()
                || String(values.phone || '').trim() !== String(editing.phone || '').trim()
                || values.positionId !== editing.positionId
                || !!values.isSubstituteTeacher !== !!editing.isSubstituteTeacher
                || String(values.gender || '') !== String(editing.gender || '')
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
              try {
                await putJson(`/org-members/coaches/${editing.id}`, {
                  ...values,
                  campusId,
                  nickname: String(values.nickname || '').trim(),
                  autoCreateOneToOneCourse: !!values.isSubstituteTeacher && !!values.autoCreateOneToOneCourse,
                  oneToOneCourseName: values.isSubstituteTeacher && values.autoCreateOneToOneCourse ? String(values.oneToOneCourseName || '').trim() : undefined,
                })
                message.success('修改成功')
                setEditing(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="nickname" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input maxLength={6} /></Form.Item>
            <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入联系方式' }]}><Input maxLength={11} /></Form.Item>
            <Form.Item name="hireDate" label="入职日期" rules={[{ required: true, message: '请选择入职日期' }]}><Input type="date" /></Form.Item>
            <Form.Item name="idCard" label="身份证号"><Input maxLength={18} /></Form.Item>
            <Form.Item name="gender" label="性别"><Select options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} /></Form.Item>
            <Form.Item name="positionId" label="职位"><Select options={positions.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item name="status" label="在职状态"><Select options={[{ value: 1, label: '在职' }, { value: 0, label: '离职' }]} /></Form.Item>
            <Form.Item name="isSubstituteTeacher" label="代课老师" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="autoCreateOneToOneCourse" label="自动创建一对一课程" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="oneToOneCourseName" label="一对一课程名"><Input /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

function Handover(props: { person: Person; campusId: number; people: Person[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [check, setCheck] = useState<Record<string, unknown> | null>(null)
  const candidates = props.people.filter((item) => item.id !== props.person.id && item.status !== 0 && item.isSubstituteTeacher)
  async function resign(replacementMemberId?: number) {
    await postJson(`/org-members/coaches/${props.person.id}/offboard`, { campusId: props.campusId, action: 'RESIGN', replacementMemberId })
    message.success('已办理离职')
    setOpen(false)
    await props.onDone()
  }
  return (
    <>
      <Button type="link" onClick={async () => {
        try {
          const result = await postJson<Record<string, unknown>>(`/org-members/coaches/${props.person.id}/handover-check`, { campusId: props.campusId, action: 'RESIGN' })
          if (result?.replacementRequired) {
            setCheck(result)
            setOpen(true)
            return
          }
          const name = props.person.displayName || props.person.nickname || '该人员'
          Modal.confirm({
            title: '确认办理离职',
            content: `确定将“${name}”设为离职吗？历史记录仍会保留。`,
            okText: '确认离职',
            onOk: () => resign().catch((error) => message.error(tell(error, '离职失败'))),
          })
        } catch (error) {
          const text = tell(error, '')
          if (text) Modal.info({ title: '不能离职', content: text, okText: '我知道了' })
          else message.warning('交接检查失败')
        }
      }}>离职</Button>
      <Modal title="办理离职" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <p>待交接：学员 {String(check?.activeStudentCount || 0)}，课程 {String(check?.activeGroupCount || 0)}，未来排课 {String(check?.futureScheduleCount || 0)}。历史记录会保留。</p>
        <Form layout="vertical" onFinish={async (values: { replacementMemberId?: number }) => {
          if (!values.replacementMemberId) {
            message.warning('请选择接替老师')
            return
          }
          try {
            await resign(values.replacementMemberId)
          } catch (error) {
            message.error(tell(error, '离职失败'))
          }
        }}>
          <Form.Item name="replacementMemberId" label="接替老师" rules={[{ required: true, message: '请选择接替老师' }]}>
            <Select options={candidates.map((item) => ({ value: item.id, label: item.displayName || item.nickname || item.phone }))} />
          </Form.Item>
          {!candidates.length ? <p>当前没有可接替的代课老师。</p> : null}
          <Button danger htmlType="submit">确认离职</Button>
        </Form>
      </Modal>
    </>
  )
}

function Positions({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Position[]>([])
  const [editing, setEditing] = useState<Position | null>(null)
  async function load() {
    if (!campusId) return
    setRows(await getJson('/org-positions/list', { campusId }))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card">
      <Form layout="inline" onFinish={async (values: { name: string }) => {
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
        try {
          await postJson('/org-positions', { name, campusId })
          message.success('已新增职位')
          await load()
        } catch (error) {
          message.error(tell(error, '新增失败'))
        }
      }}>
        <Form.Item name="name" rules={[{ required: true, message: '请输入新职位' }]}><Input placeholder="新职位" maxLength={6} /></Form.Item>
        <Button htmlType="submit">新增</Button>
      </Form>
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        dataSource={rows}
        pagination={false}
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
      <Modal title="修改职位名称" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{ name: editing.name }}
            onFinish={async (values: { name: string }) => {
              const name = String(values.name || '').trim()
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
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

function Permissions({ campusId }: { campusId: number | null }) {
  const [preset, setPreset] = useState('standard')
  useEffect(() => {
    if (!campusId) return
    getJson<{ permissionPreset?: string }>(`/campus-staff/${campusId}/settings`).then((data) => setPreset(data?.permissionPreset || 'standard')).catch(() => undefined)
  }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card">
      <p>当前校区的默认权限预设。</p>
      <Select style={{ width: 220 }} value={preset} onChange={setPreset} options={[{ value: 'admin', label: '管理员' }, { value: 'standard', label: '标准' }, { value: 'limited', label: '受限' }]} />
      <Button style={{ marginLeft: 8 }} type="primary" onClick={async () => {
        await postJson(`/campus-staff/${campusId}/settings`, { permissionPreset: preset })
        message.success('权限预设已保存')
      }}>保存</Button>
    </section>
  )
}

function CampusSalary({ campusId }: { campusId: number | null }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [teachers, setTeachers] = useState<Person[]>([])
  const [amounts, setAmounts] = useState<Array<Record<string, unknown>>>([])
  const [cycle, setCycle] = useState<Record<string, unknown>>({})
  const [itemEdit, setItemEdit] = useState<Record<string, unknown> | null>(null)
  const [amountEdit, setAmountEdit] = useState<{ person: Person; item: Record<string, unknown>; amount: number } | null>(null)
  async function load() {
    if (!campusId) return
    setItems(await getJson<Array<Record<string, unknown>>>('/salary-item/list', { campusId }).catch(() => []))
    const people = await getJson<Person[]>(`/campus-teacher/campus/${campusId}`).catch(() => [])
    setTeachers(people)
    setAmounts(await getJson<Array<Record<string, unknown>>>(`/campus-staff-salary/${campusId}`).catch(() => []))
    setCycle(await getJson<Record<string, unknown>>(`/campus-staff/${campusId}/settings`).catch(() => ({})))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card">
      <h3>记薪周期</h3>
      <Form
        key={String(cycle.cycleStartDay || '')}
        layout="inline"
        initialValues={cycle}
        onFinish={async (values: { cycleStartDay?: number; cycleEndDay?: number; payDay?: number }) => {
          await postJson(`/campus-staff/${campusId}/settings`, values)
          message.success('校区工资周期已保存')
          await load()
        }}
      >
        <Form.Item name="cycleStartDay" label="开始日"><InputNumber min={1} max={31} /></Form.Item>
        <Form.Item name="cycleEndDay" label="结束日"><InputNumber min={1} max={31} /></Form.Item>
        <Form.Item name="payDay" label="发放日"><InputNumber min={1} max={31} /></Form.Item>
        <Button htmlType="submit">保存周期</Button>
      </Form>
      <Form style={{ marginTop: 16 }} layout="inline" onFinish={async (values: { itemName: string; defaultValue?: number; itemType?: string; fixedPayoutMode?: string }) => {
        const name = String(values.itemName || '').trim()
        if (!name) {
          message.warning('请输入工资项名称')
          return
        }
        if (Array.from(name).length > 6) {
          message.warning('工资项名称最多6个字')
          return
        }
        if (items.some((item) => String(item.itemName) === name)) {
          message.warning('工资项名称不能重复')
          return
        }
        try {
          await postJson('/salary-item', { ...values, itemName: name, campusId, itemType: values.itemType || 'fixed' })
          message.success('保存成功')
          await load()
        } catch (error) {
          message.error(tell(error, '保存失败'))
        }
      }}>
        <Form.Item name="itemName" rules={[{ required: true, message: '请输入工资项名称' }]}><Input placeholder="工资项" maxLength={6} /></Form.Item>
        <Form.Item name="itemType" initialValue="fixed"><Select style={{ width: 120 }} options={[{ value: 'fixed', label: '固定' }, { value: 'unit', label: '课时单价' }]} /></Form.Item>
        <Form.Item name="defaultValue"><InputNumber placeholder="默认金额" /></Form.Item>
        <Form.Item name="fixedPayoutMode" initialValue="full"><Select style={{ width: 140 }} options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按在职天数' }]} /></Form.Item>
        <Button htmlType="submit">添加工资项</Button>
      </Form>
      <Table
        style={{ marginTop: 12 }}
        rowKey={(row) => String(row.id || row.itemName)}
        dataSource={items}
        pagination={false}
        columns={[
          { title: '工资项', dataIndex: 'itemName' },
          { title: '类型', dataIndex: 'itemType' },
          { title: '默认', dataIndex: 'defaultValue' },
          { title: '发放', dataIndex: 'fixedPayoutMode', render: (value: string) => value === 'prorate' ? '按在职天数' : '全额发放' },
          {
            title: '操作',
            render: (_: unknown, row: Record<string, unknown>) => (
              <Space>
                <Button type="link" onClick={() => setItemEdit(row)}>编辑</Button>
                <Button type="link" danger onClick={async () => {
                  if (items.length <= 1) {
                    message.warning('至少保留一项')
                    return
                  }
                  try {
                    await delJson(`/salary-item/${row.id}`, { campusId })
                    message.success('已删除')
                    await load()
                  } catch (error) {
                    message.error(tell(error, '删除失败'))
                  }
                }}>删除</Button>
              </Space>
            ),
          },
        ]}
      />
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        dataSource={teachers}
        pagination={false}
        columns={[
          { title: '老师', render: (_: unknown, row: Person) => row.displayName || row.nickname },
          ...items.map((item) => ({
            title: String(item.itemName),
            render: (_: unknown, row: Person) => {
              const found = amounts.find((amount) => Number(amount.staffId) === row.id && String(amount.salaryItemId) === String(item.id))
              return (
                <Button type="link" onClick={() => setAmountEdit({
                  person: row,
                  item,
                  amount: Number(found?.amount ?? item.defaultValue ?? 0),
                })}>{money(found?.amount ?? item.defaultValue)}</Button>
              )
            },
          })),
        ]}
      />
      {!teachers.length ? <p>还没有老师。请先到老师管理添加老师，再给老师填写工资金额。</p> : null}
      <Modal
        title={amountEdit ? `${amountEdit.person.displayName || amountEdit.person.nickname} · ${String(amountEdit.item.itemName)}` : '工资金额'}
        open={!!amountEdit}
        onCancel={() => setAmountEdit(null)}
        footer={null}
        destroyOnClose
      >
        {amountEdit ? (
          <Form
            layout="vertical"
            initialValues={{ amount: amountEdit.amount }}
            onFinish={async (values: { amount: number }) => {
              const salaries = items.map((entry) => {
                const current = amounts.find((amount) => Number(amount.staffId) === amountEdit.person.id && String(amount.salaryItemId) === String(entry.id))
                const amount = String(entry.id) === String(amountEdit.item.id) ? Number(values.amount) : Number(current?.amount ?? entry.defaultValue ?? 0)
                return { staffId: amountEdit.person.id, salaryItemId: entry.id, salaryItemName: entry.itemName, amount }
              })
              await postJson(`/campus-staff-salary/${campusId}`, { staffIds: [amountEdit.person.id], salaries })
              message.success('工资已保存')
              setAmountEdit(null)
              await load()
            }}
          >
            <Form.Item name="amount" label="金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Modal title="编辑工资项" open={!!itemEdit} onCancel={() => setItemEdit(null)} footer={null} destroyOnClose>
        {itemEdit ? (
          <Form
            layout="vertical"
            initialValues={itemEdit}
            onFinish={async (values: { itemName?: string; itemType?: string; fixedPayoutMode?: string; fixedPayoutHighDays?: number; fixedPayoutLowDays?: number; fixedPayoutHighAction?: string; fixedPayoutLowAction?: string; defaultValue?: number }) => {
              const name = String(values.itemName || '').trim()
              if (!name) {
                message.warning('请输入工资项名称')
                return
              }
              if (Array.from(name).length > 6) {
                message.warning('工资项名称最多6个字')
                return
              }
              if (items.some((item) => item !== itemEdit && String(item.itemName) === name && String(item.id) !== String(itemEdit.id))) {
                message.warning('工资项名称不能重复')
                return
              }
              if ((values.itemType || 'fixed') !== 'unit' && values.fixedPayoutMode === 'prorate') {
                const high = Number(values.fixedPayoutHighDays)
                const low = Number(values.fixedPayoutLowDays)
                if (!high || !low || high < 1 || high > 31 || low < 1 || low > 31) {
                  message.warning('请填写1到31的天数')
                  return
                }
                if (low > high) {
                  message.warning('少于天数不能大于多于天数')
                  return
                }
              }
              try {
                await putJson('/salary-item', { ...itemEdit, ...values, itemName: name, campusId })
                message.success('保存成功')
                setItemEdit(null)
                await load()
              } catch (error) {
                message.error(tell(error, '保存失败'))
              }
            }}
          >
            <Form.Item name="itemName" label="名称" rules={[{ required: true, message: '请输入工资项名称' }]}><Input maxLength={6} /></Form.Item>
            <Form.Item name="itemType" label="类型"><Select options={[{ value: 'fixed', label: '固定' }, { value: 'unit', label: '课时单价' }]} /></Form.Item>
            <Form.Item name="defaultValue" label="默认金额"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fixedPayoutMode" label="固定工资发放"><Select options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按在职天数' }]} /></Form.Item>
            <Form.Item name="fixedPayoutHighDays" label="多于多少天"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fixedPayoutHighAction" label="多于时"><Select options={[{ value: 'full', label: '全额发放' }, { value: 'prorate', label: '按天折算' }]} /></Form.Item>
            <Form.Item name="fixedPayoutLowDays" label="少于多少天"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fixedPayoutLowAction" label="少于时"><Select options={[{ value: 'none', label: '不发放' }, { value: 'prorate', label: '按天折算' }]} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}

interface TrialType {
  id: number
  studentName?: string
  includeSalary?: number
  salaryRatio?: number
}

function readJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object') return value as T
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function AcademicSettings({ campusId }: { campusId: number | null }) {
  const [types, setTypes] = useState<TrialType[]>([])
  const [editing, setEditing] = useState<TrialType | null>(null)
  const [trialEnabled, setTrialEnabled] = useState(true)
  const [halfHour, setHalfHour] = useState(true)
  const [oneHour, setOneHour] = useState(true)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoMode, setAutoMode] = useState('on_complete')
  const [autoTime, setAutoTime] = useState('21:00')
  const [fixedEnabled, setFixedEnabled] = useState(false)
  const [fixedDay, setFixedDay] = useState(1)
  const [fixedTime, setFixedTime] = useState('21:00')
  const [refund, setRefund] = useState({
    lessonFeeEnabled: false,
    lessonFeePercent: 0,
    lessonDeductMode: 'original',
    periodFeeEnabled: false,
    periodFeePercent: 0,
    periodDeductMode: 'duration',
    storedFeeEnabled: false,
    storedFeePercent: 0,
    storedDeductMode: 'original',
  })

  async function load() {
    if (!campusId) return
    const [settings, students] = await Promise.all([
      getJson<Record<string, unknown>>(`/campus-staff/${campusId}/settings`),
      getJson<TrialType[]>(`/campus-staff/${campusId}/default-students`),
    ])
    setTypes(students || [])
    const trial = readJson(settings.trialLessonConfig, { enabled: true, halfHourEnabled: true, oneHourEnabled: true })
    setTrialEnabled(trial.enabled !== false)
    setHalfHour(trial.halfHourEnabled !== false)
    setOneHour(trial.oneHourEnabled !== false)
    const auto = readJson(settings.scheduleAutoConsumeConfig, { enabled: false, mode: 'off', executeTime: '21:00' })
    setAutoEnabled(!!auto.enabled)
    setAutoMode(auto.mode === 'scheduled' ? 'scheduled' : 'on_complete')
    setAutoTime(String(auto.executeTime || '21:00').slice(0, 5))
    const fixed = readJson(settings.fixedTimetableInstanceConfig, { enabled: false, executeDayOfWeek: 1, executeTime: '21:00' })
    setFixedEnabled(!!fixed.enabled)
    setFixedDay(Number(fixed.executeDayOfWeek || 1))
    setFixedTime(String(fixed.executeTime || '21:00').slice(0, 5))
    const parsed = readJson<{ lesson?: Record<string, unknown>; period?: Record<string, unknown>; stored?: Record<string, unknown> }>(settings.refundSettingsConfig, {})
    setRefund({
      lessonFeeEnabled: !!parsed.lesson?.feeEnabled,
      lessonFeePercent: Number(parsed.lesson?.feePercent || 0),
      lessonDeductMode: String(parsed.lesson?.deductMode || 'original'),
      periodFeeEnabled: !!parsed.period?.feeEnabled,
      periodFeePercent: Number(parsed.period?.feePercent || 0),
      periodDeductMode: String(parsed.period?.deductMode || 'duration'),
      storedFeeEnabled: !!parsed.stored?.feeEnabled,
      storedFeePercent: Number(parsed.stored?.feePercent || 0),
      storedDeductMode: String(parsed.stored?.deductMode || 'original'),
    })
  }

  useEffect(() => { load().catch((error) => message.error(tell(error, '教务设置加载失败'))) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>

  return (
    <>
      <section className="work-card">
        <h2>体验类型</h2>
        <p>最多 10 个。排体验课时可以选择这些类型，并决定是否计入老师工资。</p>
        <Form layout="inline" onFinish={async (values: { studentName: string; includeSalary?: boolean; salaryRatio?: number }) => {
          if (!String(values.studentName || '').trim()) {
            message.warning('体验类型不能为空')
            return
          }
          if (types.length >= 10) {
            message.warning('最多 10 个体验类型')
            return
          }
          await postJson(`/campus-staff/${campusId}/default-students`, {
            studentName: values.studentName,
            includeSalary: values.includeSalary === false ? 0 : 1,
            salaryRatio: values.includeSalary === false ? 0 : values.salaryRatio ?? 100,
          })
          message.success('已添加')
          await load()
        }}>
          <Form.Item name="studentName" rules={[{ required: true }]}><Input placeholder="体验类型名称" maxLength={20} /></Form.Item>
          <Form.Item name="includeSalary" valuePropName="checked" initialValue><Switch checkedChildren="计工资" unCheckedChildren="不计" /></Form.Item>
          <Form.Item name="salaryRatio" initialValue={100}><InputNumber min={0} max={100} placeholder="工资比例" /></Form.Item>
          <Button htmlType="submit">新增</Button>
        </Form>
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          dataSource={types}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'studentName' },
            { title: '计入工资', render: (_: unknown, row: TrialType) => Number(row.includeSalary) === 0 ? '否' : '是' },
            { title: '工资比例', render: (_: unknown, row: TrialType) => `${row.salaryRatio ?? 100}%` },
            {
              title: '操作',
              render: (_: unknown, row: TrialType) => (
                <Space>
                  <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
                  <Popconfirm title="删除这个体验类型？" onConfirm={async () => { await delJson(`/campus-staff/${campusId}/default-students/${row.id}`); await load() }}>
                    <Button type="link" danger>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </section>
      <section className="work-card">
        <h2>体验课时长</h2>
        <Space direction="vertical">
          <span>开启体验课 <Switch checked={trialEnabled} onChange={setTrialEnabled} /></span>
          <span>半小时 <Switch checked={halfHour} onChange={setHalfHour} /></span>
          <span>一个小时 <Switch checked={oneHour} onChange={setOneHour} /></span>
          <Button type="primary" onClick={async () => {
            if (trialEnabled && !halfHour && !oneHour) {
              message.warning('请至少开启一个体验时长')
              return
            }
            await postJson(`/campus-staff/${campusId}/settings`, {
              trialLessonConfig: JSON.stringify({ enabled: trialEnabled, halfHourEnabled: halfHour, oneHourEnabled: oneHour }),
            })
            message.success('体验课时长已保存')
          }}>保存</Button>
        </Space>
      </section>
      <section className="work-card">
        <h2>自动消课和预创建</h2>
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>按排课表自动消课 <Switch checked={autoEnabled} onChange={setAutoEnabled} /></span>
          {autoEnabled ? (
            <Select style={{ width: 220 }} value={autoMode} onChange={setAutoMode} options={[{ value: 'scheduled', label: '定时消课' }, { value: 'on_complete', label: '课程完成自动消课' }]} />
          ) : null}
          {autoEnabled && autoMode === 'scheduled' ? <input type="time" value={autoTime} onChange={(event) => setAutoTime(event.target.value)} /> : null}
          <span>固定课表预创建 <Switch checked={fixedEnabled} onChange={setFixedEnabled} /></span>
          {fixedEnabled ? (
            <Space>
              <Select style={{ width: 120 }} value={fixedDay} onChange={setFixedDay} options={['一', '二', '三', '四', '五', '六', '日'].map((label, index) => ({ value: index + 1, label: `周${label}` }))} />
              <input type="time" value={fixedTime} onChange={(event) => setFixedTime(event.target.value)} />
            </Space>
          ) : null}
          <Button type="primary" onClick={async () => {
            await postJson(`/campus-staff/${campusId}/settings`, {
              scheduleAutoConsumeConfig: JSON.stringify({
                enabled: autoEnabled,
                mode: autoEnabled ? autoMode : 'off',
                ...(autoEnabled && autoMode === 'scheduled' ? { executeTime: autoTime } : {}),
              }),
              fixedTimetableInstanceConfig: JSON.stringify({
                enabled: fixedEnabled,
                mode: fixedEnabled ? 'weekly' : 'off',
                ...(fixedEnabled ? { executeDayOfWeek: fixedDay, executeTime: fixedTime } : {}),
              }),
            })
            message.success('教务设置已保存')
          }}>保存</Button>
        </Space>
      </section>
      <section className="work-card">
        <h2>退费默认规则</h2>
        <p>作为退费时的默认值，实际退费仍可再改。</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          <strong>课时卡</strong>
          <span>收取手续费 <Switch checked={refund.lessonFeeEnabled} onChange={(value) => setRefund({ ...refund, lessonFeeEnabled: value })} /></span>
          {refund.lessonFeeEnabled ? <InputNumber min={0} max={100} value={refund.lessonFeePercent} addonAfter="%" onChange={(value) => setRefund({ ...refund, lessonFeePercent: Number(value || 0) })} /> : null}
          <Select style={{ width: 280 }} value={refund.lessonDeductMode} onChange={(value) => setRefund({ ...refund, lessonDeductMode: value })} options={[{ value: 'original', label: '按已上课时原价扣除' }, { value: 'current_unit', label: '按当前单价扣除' }]} />
          <strong>时段卡</strong>
          <span>收取手续费 <Switch checked={refund.periodFeeEnabled} onChange={(value) => setRefund({ ...refund, periodFeeEnabled: value })} /></span>
          {refund.periodFeeEnabled ? <InputNumber min={0} max={100} value={refund.periodFeePercent} addonAfter="%" onChange={(value) => setRefund({ ...refund, periodFeePercent: Number(value || 0) })} /> : null}
          <Select style={{ width: 280 }} value={refund.periodDeductMode} onChange={(value) => setRefund({ ...refund, periodDeductMode: value })} options={[{ value: 'original', label: '按上课或服务原价扣除' }, { value: 'discount', label: '按折扣价扣除' }, { value: 'duration', label: '按时段卡时长扣除' }]} />
          <strong>储值卡</strong>
          <span>收取手续费 <Switch checked={refund.storedFeeEnabled} onChange={(value) => setRefund({ ...refund, storedFeeEnabled: value })} /></span>
          {refund.storedFeeEnabled ? <InputNumber min={0} max={100} value={refund.storedFeePercent} addonAfter="%" onChange={(value) => setRefund({ ...refund, storedFeePercent: Number(value || 0) })} /> : null}
          <Select style={{ width: 280 }} value={refund.storedDeductMode} onChange={(value) => setRefund({ ...refund, storedDeductMode: value })} options={[{ value: 'original', label: '按上课或服务原价扣除' }, { value: 'discount', label: '按折扣价扣除' }]} />
          <Button type="primary" onClick={async () => {
            await postJson(`/campus-staff/${campusId}/settings`, {
              refundSettingsConfig: JSON.stringify({
                lesson: { deductMode: refund.lessonDeductMode, feeEnabled: refund.lessonFeeEnabled, feePercent: refund.lessonFeePercent },
                period: { deductMode: refund.periodDeductMode, feeEnabled: refund.periodFeeEnabled, feePercent: refund.periodFeePercent },
                stored: { deductMode: refund.storedDeductMode, feeEnabled: refund.storedFeeEnabled, feePercent: refund.storedFeePercent },
              }),
            })
            message.success('退费规则已保存')
          }}>保存</Button>
        </Space>
      </section>
      <Modal title="编辑体验类型" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnClose>
        {editing ? (
          <Form
            layout="vertical"
            initialValues={{ studentName: editing.studentName, includeSalary: Number(editing.includeSalary) !== 0, salaryRatio: editing.salaryRatio ?? 100 }}
            onFinish={async (values: { studentName: string; includeSalary?: boolean; salaryRatio?: number }) => {
              await putJson(`/campus-staff/${campusId}/default-students/${editing.id}`, {
                studentName: values.studentName,
                includeSalary: values.includeSalary === false ? 0 : 1,
                salaryRatio: values.includeSalary === false ? 0 : values.salaryRatio ?? 100,
              })
              message.success('已更新')
              setEditing(null)
              await load()
            }}
          >
            <Form.Item name="studentName" label="名称" rules={[{ required: true }]}><Input maxLength={20} /></Form.Item>
            <Form.Item name="includeSalary" label="计入工资" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="salaryRatio" label="工资比例"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </>
  )
}
