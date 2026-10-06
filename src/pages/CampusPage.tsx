import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedOrg, PageHead, PhoneCopyButton, clampDecimalInput, copyPlainText, tell, useShell } from './kit'
import { CoursePricings } from './campus-course-pricing'
import { CampusAffairs } from './campus-affairs'
import { AcademicSettings } from './campus-academic'
import { CampusSalary } from './campus-salary'
import { Permissions, Positions, Teachers } from './campus-staff'
import type { Campus } from './campus-model'


function canManageCampusSalary(user: { id?: number; role?: string; campusAdminCampusIds?: number[] } | null, org: { ownerId?: number; campusAdminManageSalary?: number } | null, campusId: number | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  if (role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId)) return true
  const scope = (user?.campusAdminCampusIds || []).map((id) => Number(id || 0))
  return Number(org?.campusAdminManageSalary) === 1 && !!campusId && scope.includes(Number(campusId))
}

function campusTabKey(value: string | null): string {
  if (value === 'teacher' || value === 'teachers' || value === 'position' || value === 'positions') return 'staff'
  if (value === 'permission' || value === 'permissions' || value === 'rules' || value === 'rewards') return 'affairs'
  if (value === 'services' || value === 'trial' || value === 'pricing') return 'service'
  return ['campus', 'service', 'staff', 'salary', 'academic', 'affairs'].includes(String(value || '')) ? String(value) : 'campus'
}

function campusStaffTabKey(value: string | null): string {
  return value === 'position' || value === 'positions' ? 'positions' : 'teachers'
}

function campusServiceTabKey(value: string | null): string {
  if (value === 'pricing') return 'pricing'
  return value === 'trial' ? 'trial' : 'services'
}

function campusAffairsTabKey(value: string | null): string {
  if (value === 'permission' || value === 'permissions') return 'permissions'
  if (value === 'rewards') return 'rewards'
  return 'rules'
}

export function CampusPage() {
  const shell = useShell()
  const campusId = shell.campusId
  const [search] = useSearchParams()
  const [tab, setTab] = useState(campusTabKey(search.get('tab')))
  const [serviceTab, setServiceTab] = useState(campusServiceTabKey(search.get('tab')))
  const [staffTab, setStaffTab] = useState(campusStaffTabKey(search.get('tab')))
  const [affairsTab, setAffairsTab] = useState(campusAffairsTabKey(search.get('tab')))
  useEffect(() => {
    const next = search.get('tab')
    setTab(campusTabKey(next))
    setServiceTab(campusServiceTabKey(next))
    setStaffTab(campusStaffTabKey(next))
    setAffairsTab(campusAffairsTabKey(next))
  }, [search])
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const salaryAllowed = canManageCampusSalary(shell.user, currentOrg, campusId)
  return (
    <NeedOrg orgId={shell.currentOrgId}>
      <PageHead title="校区管理" extra="校区资料、服务、老师、职位、权限和工资。" />
      <Tabs
        className="campus-main-tabs"
        activeKey={tab}
        onChange={(key) => {
          if (key === 'salary' && !salaryAllowed) message.warning('当前不能设置员工工资')
          setTab(key)
        }}
        items={[
          { key: 'campus', label: '校区', children: <CampusList /> },
          { key: 'service', label: '校区服务', children: <Tabs className="campus-sub-tabs" activeKey={serviceTab} onChange={setServiceTab} items={[
            { key: 'services', label: '服务项目', children: <Services campusId={campusId} /> },
            { key: 'pricing', label: '课程定价', children: <CoursePricings campusId={campusId} /> },
            { key: 'trial', label: '体验类型', children: <AcademicSettings campusId={campusId} section="trial" /> },
          ]} /> },
          { key: 'staff', label: '人员设置', children: <Tabs className="campus-sub-tabs" activeKey={staffTab} onChange={setStaffTab} items={[
            { key: 'teachers', label: '老师列表', children: <Teachers campusId={campusId} /> },
            { key: 'positions', label: '职位设置', children: <Positions campusId={campusId} /> },
          ]} /> },
          { key: 'salary', label: '工资设置', children: salaryAllowed ? <CampusSalary campusId={campusId} /> : <p>当前不能设置员工工资</p> },
          { key: 'academic', label: '教务设置', children: <AcademicSettings campusId={campusId} section="academic" /> },
          { key: 'affairs', label: '校务设置', children: <Tabs className="campus-sub-tabs" activeKey={affairsTab} onChange={setAffairsTab} items={[
            { key: 'rules', label: '规章制度', children: <CampusAffairs campusId={campusId} section="rules" /> },
            { key: 'rewards', label: '奖惩项', children: <CampusAffairs campusId={campusId} section="rewards" /> },
            { key: 'permissions', label: '权限设置', children: <Permissions campusId={campusId} /> },
          ]} /> },
        ]}
      />
    </NeedOrg>
  )
}

function campusFormError(values: Partial<Campus>, mode: 'create' | 'edit' = 'edit', campuses: Campus[] = []) {
  const name = String(values.name || '').trim()
  const address = String(values.address || '').trim()
  const manager = String(values.contactPerson || '').trim()
  const phone = String(values.contactPhone || '').replace(/\D+/g, '').slice(0, 11)
  if (!name) return '请输入校区名称'
  if (Array.from(name).length > 15) return '校区名称最多15字'
  if (mode === 'edit') {
    if (!address) return '请输入详细地址'
    if (Array.from(address).length > 30) return '地址最多30字'
  } else if (Array.from(address).length > 100) {
    return '地址最多100字'
  }
  if (!manager) return '请输入负责人'
  if (Array.from(manager).length > 6) return '负责人最多6字'
  if (!phone) return '请输入联系电话'
  if (!/^1[3-9]\d{9}$/.test(phone)) return '请输入正确的联系电话'
  if (mode === 'create' && campuses.some((item) => String(item.name || '').trim() === name)) return '校区名称不能重复'
  return ''
}

function sameCampus(left: Partial<Campus>, right: Partial<Campus>) {
  return String(left.name || '').trim() === String(right.name || '').trim()
    && String(left.address || '').trim() === String(right.address || '').trim()
    && String(left.contactPerson || '').trim() === String(right.contactPerson || '').trim()
    && String(left.contactPhone || '').replace(/\D+/g, '') === String(right.contactPhone || '').replace(/\D+/g, '')
}

function CampusSaveButton(props: { current: Campus | null; campuses: Campus[] }) {
  const form = Form.useFormInstance()
  const name = Form.useWatch('name', form)
  const address = Form.useWatch('address', form)
  const contactPerson = Form.useWatch('contactPerson', form)
  const contactPhone = Form.useWatch('contactPhone', form)
  const values = { name, address, contactPerson, contactPhone }
  const blocked = campusFormError(values, props.current ? 'edit' : 'create', props.campuses)
    || (props.current && sameCampus(props.current, values) ? '请先修改校区信息' : '')
  return <Button type="primary" htmlType="submit" disabled={!!blocked}>保存</Button>
}

async function copyCampusPhone(phone: string) {
  const text = String(phone || '').trim()
  if (!text) {
    message.warning('联系电话缺失')
    return
  }
  if (await copyPlainText(text)) message.success('已复制')
  else Modal.info({ title: '联系电话', content: text, okText: '知道了' })
}

function CampusList() {
  const shell = useShell()
  const [rows, setRows] = useState<Campus[]>([])
  const [online, setOnline] = useState('all')
  const [editing, setEditing] = useState<Campus | 'new' | null>(null)
  const [quota, setQuota] = useState<{ canCreate?: boolean; campusCount?: number; campusLimit?: number } | null>(null)
  const [quotaState, setQuotaState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const role = String(shell.user?.role || '').trim().toLowerCase()
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const orgManager = role === 'owner' || role === 'admin' || (shell.user?.id != null && currentOrg?.ownerId === shell.user.id)
  const managedIds = shell.user?.campusAdminCampusIds || []
  async function load() {
    const list = await getJson<Campus[]>('/campus/list')
    const visible = orgManager ? list : list.filter((item) => managedIds.includes(item.id))
    setRows(visible || [])
    if (orgManager) {
      setQuotaState('loading')
      try {
        setQuota(await getJson<{ canCreate?: boolean; campusCount?: number; campusLimit?: number }>('/campus/quota'))
        setQuotaState('ready')
      } catch {
        setQuota(null)
        setQuotaState('failed')
      }
    } else {
      setQuota(null)
      setQuotaState('ready')
    }
    shell.reload()
  }
  useEffect(() => { load().catch((error) => message.error(tell(error, '校区加载失败'))) }, [shell.currentOrgId])
  function openCreate() {
    if (!orgManager) {
      message.warning('校区管理员不可新增校区')
      return
    }
    if (quotaState === 'loading') {
      message.warning('创建额度加载中，请稍后')
      return
    }
    if (quotaState === 'failed' || !quota) {
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
        <div className="campus-list-actions">
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
        <button type="button" className={online === 'all' ? 'stat-link is-current' : 'stat-link'} onClick={() => setOnline('all')}>校区<strong>{rows.length}</strong></button>
        <button type="button" className={online === 'online' ? 'stat-link is-current' : 'stat-link'} onClick={() => setOnline('online')}>已上线<strong>{onlineCount}</strong></button>
        <button type="button" className={online === 'offline' ? 'stat-link is-current' : 'stat-link'} onClick={() => setOnline('offline')}>已下线<strong>{rows.length - onlineCount}</strong></button>
        {quota ? <span>额度<strong>{quota.campusCount ?? 0}/{quota.campusLimit ?? 0}</strong></span> : null}
      </div>
      <Table
        rowKey="id"
        dataSource={rows.filter((row) => online === 'all' || (online === 'offline' ? row.visibleInList === false : row.visibleInList !== false))}
        pagination={false}
        locale={{ emptyText: online === 'offline' ? '暂无已下线校区' : online === 'online' ? '暂无已上线校区' : '暂时还没有校区' }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '地址', dataIndex: 'address' },
          { title: '校区管理员', dataIndex: 'contactPerson' },
          { title: '电话', render: (_: unknown, row: Campus) => row.contactPhone ? (
            <Space>
              <span>{row.contactPhone}</span>
              <PhoneCopyButton onClick={() => copyCampusPhone(row.contactPhone || '')} />
            </Space>
          ) : '' },
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
                  <Button type="link" danger onClick={async () => {
                    if (!row.id) {
                      message.warning('校区信息无效')
                      return
                    }
                    try {
                      const check = await getJson<{ deletable?: boolean }>(`/campus/${row.id}/delete-check`)
                      if (check && check.deletable === false) {
                        Modal.info({ title: '不能删除', content: '该校区已有排课班级或学员，不能删除', okText: '我知道了' })
                        return
                      }
                    } catch (error) {
                      message.warning(tell(error, '删除检查失败'))
                      return
                    }
                    Modal.confirm({
                      title: '确认删除',
                      content: `确定删除校区「${row.name || '该校区'}」吗？删除后该校区所有信息将被清空。`,
                      okText: '删除',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        try {
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
      <Modal title={editing === 'new' ? '新建校区' : '编辑校区'} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        <Form
          layout="vertical"
          initialValues={editing && editing !== 'new' ? editing : undefined}
          onFinish={async (values: Partial<Campus>) => {
            const creating = editing === 'new'
            const error = campusFormError(values, creating ? 'create' : 'edit', rows)
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
          <Form.Item name="address" label="详细地址" rules={editing === 'new' ? [] : [{ required: true, message: '请输入详细地址' }]} extra={editing === 'new' ? '详细地址可以先不填' : undefined}><Input maxLength={editing === 'new' ? 100 : 30} /></Form.Item>
          <Form.Item name="contactPerson" label="负责人" rules={[{ required: true, message: '请输入负责人' }]}><Input maxLength={6} /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}><Input maxLength={11} /></Form.Item>
          <CampusSaveButton current={editing && editing !== 'new' ? editing : null} campuses={rows} />
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

function ServiceAddButton(props: { saving: boolean }) {
  const serviceName = Form.useWatch('serviceName')
  const price = Form.useWatch('price')
  const durationHours = Form.useWatch('durationHours')
  const blocked = serviceError({ serviceName, price, durationHours })
  return <Button type="primary" htmlType="submit" disabled={!!blocked || props.saving}>{props.saving ? '处理中...' : '确认新增'}</Button>
}

function Services({ campusId }: { campusId: number | null }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm] = Form.useForm()
  async function load() {
    if (!campusId) return
    setRows(await getJson(`/campus-services/${campusId}/items`))
  }
  useEffect(() => { load().catch(() => undefined) }, [campusId])
  if (!campusId) return <p>请先选择校区。</p>
  return (
    <section className="work-card service-settings-card">
      <header className="service-list-head">
        <div>
          <h2>服务项目</h2>
          <span>维护当前校区可购买和使用的服务</span>
        </div>
        <Button type="primary" onClick={() => {
          addForm.resetFields()
          addForm.setFieldValue('durationHours', 1)
          setCreating(true)
        }}>新增服务</Button>
      </header>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '还没有服务项目' }}
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
      <Modal
        title="新增服务"
        open={creating}
        onCancel={() => {
          if (adding) return
          setCreating(false)
          addForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ durationHours: 1 }}
          onFinish={async (values: { serviceName: string; price?: number; durationHours?: number; description?: string }) => {
            if (adding) return
            const error = serviceError(values)
            if (error) {
              message.warning(error)
              return
            }
            setAdding(true)
            try {
              await postJson(`/campus-services/${campusId}/items`, {
                serviceName: values.serviceName.trim(),
                price: values.price ?? 0,
                durationMinutes: Math.round(Number(values.durationHours) * 60),
                description: String(values.description || '').trim(),
                enabled: 1,
              })
              message.success('新增成功')
              setCreating(false)
              addForm.resetFields()
              await load()
            } catch (error) {
              message.error(tell(error, '新增失败'))
            } finally {
              setAdding(false)
            }
          }}
        >
          <Form.Item name="serviceName" label="服务名称" rules={[{ required: true, message: '请输入服务名称' }]}><Input placeholder="请输入服务名称" maxLength={8} /></Form.Item>
          <Form.Item name="price" label="单价" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} placeholder="请输入单价" min={0} /></Form.Item>
          <Form.Item name="durationHours" label="服务时长（小时）"><InputNumber style={{ width: '100%' }} placeholder="请输入服务时长" min={0.5} max={10} step={0.5} /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea placeholder="请输入服务说明" autoSize={{ minRows: 3, maxRows: 5 }} maxLength={60} showCount /></Form.Item>
          <div className="staff-form-actions">
            <Button onClick={() => {
              setCreating(false)
              addForm.resetFields()
            }} disabled={adding}>取消</Button>
            <ServiceAddButton saving={adding} />
          </div>
        </Form>
      </Modal>
      <Modal title="编辑服务" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
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
            <Form.Item name="description" label="说明"><Input.TextArea rows={2} maxLength={60} /></Form.Item>
            <Form.Item name="price" label="单价" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="durationHours" label="时长（小时）"><InputNumber style={{ width: '100%' }} min={0.5} max={10} step={0.5} /></Form.Item>
            <Form.Item name="enabled" label="启用"><Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} /></Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
    </section>
  )
}
