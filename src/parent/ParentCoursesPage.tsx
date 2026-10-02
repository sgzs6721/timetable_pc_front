import { BookOutlined, DeleteOutlined, EditOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, Modal, Popconfirm, Select, Tag, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { useParentContext, memberKey } from './ParentLayout'
import type { ParentCourseCatalogItem } from './parent-model'

interface CourseForm { memberKey: string; orgName: string; campusName?: string; names: string[] }

export function ParentCoursesPage() {
  const navigate = useNavigate()
  const { home } = useParentContext()
  const [rows, setRows] = useState<ParentCourseCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ParentCourseCatalogItem | null | undefined>(undefined)
  const [aliasEditing, setAliasEditing] = useState<ParentCourseCatalogItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<CourseForm>()
  const [aliasForm] = Form.useForm<{ name: string }>()

  function load() {
    setLoading(true)
    parentApi.catalog().then((list) => setRows(list || [])).catch((reason) => message.error(reason.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const memberOptions = (home.children || []).map((member) => ({ value: memberKey(member), label: member.name }))
  const groups = useMemo(() => (home.children || []).map((member) => ({ member, courses: rows.filter((item) => item.source === member.source && (member.source === 'PRIVATE' ? item.childId === member.childId : item.studentId === member.studentId)) })), [home.children, rows])

  function openCreate() {
    setEditing(null)
    form.setFieldsValue({ memberKey: memberOptions[0]?.value, orgName: '', campusName: '', names: [''] })
  }

  function openEdit(row: ParentCourseCatalogItem) {
    setEditing(row)
    form.setFieldsValue({ memberKey: row.source === 'PRIVATE' ? `child-${row.childId}` : `student-${row.studentId}`, orgName: row.orgName || '', campusName: row.campusName || '', names: [row.courseName || ''] })
  }

  async function save() {
    const values = await form.validateFields()
    const member = home.children.find((item) => memberKey(item) === values.memberKey)
    if (!member) return
    setSaving(true)
    try {
      const names = (values.names || []).map((name) => name.trim()).filter(Boolean)
      if (editing?.courseId) {
        await parentApi.updateOrgCourse(editing.courseId, { childId: member.childId, studentId: member.studentId, orgName: values.orgName.trim(), campusName: values.campusName?.trim(), name: names[0] })
      } else {
        await parentApi.createOrgCourses({ childId: member.childId, studentId: member.studentId, orgName: values.orgName.trim(), campusName: values.campusName?.trim(), names })
      }
      message.success(editing ? '课程已更新' : '课程已创建')
      setEditing(undefined)
      load()
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }

  async function remove(row: ParentCourseCatalogItem) {
    await parentApi.deleteCourse(row.courseId!)
    message.success('课程已删除')
    load()
  }

  async function saveAlias() {
    const values = await aliasForm.validateFields()
    if (!aliasEditing?.studentId || !aliasEditing.institutionRefKey) return
    setSaving(true)
    try {
      await parentApi.updateAlias({ studentId: aliasEditing.studentId, refKey: aliasEditing.institutionRefKey, name: values.name.trim() || undefined })
      message.success('课程显示名已更新')
      setAliasEditing(null)
      load()
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>课程中心</h2><p>机构课程自动同步；自建课程可以记录排课、缴费和打卡。</p></div><Button type="primary" icon={<PlusOutlined />} disabled={!home.children?.length} onClick={openCreate}>新建课程</Button></div>
      <div className="parent-course-groups">
        {groups.map(({ member, courses }) => (
          <section className="parent-card parent-course-group" key={memberKey(member)}>
            <div className="parent-card-head"><div><h3>{member.name}</h3><span>{member.source === 'PRIVATE' ? '自建成员' : [member.orgName, member.campusName].filter(Boolean).join(' · ')}</span></div><strong>{courses.length} 门</strong></div>
            {!courses.length ? <div className="parent-course-empty">还没有课程</div> : courses.map((row) => (
              <div className="parent-course-row" key={`${row.source}-${row.courseId}-${row.institutionRefKey}`}>
                <span className={row.service ? 'parent-course-icon service' : row.source === 'INSTITUTION' ? 'parent-course-icon institution' : 'parent-course-icon'}><BookOutlined /></span>
                <button type="button" className="parent-course-main" onClick={() => row.source === 'PRIVATE' && row.courseId ? navigate(`/parent/course/${row.courseId}`) : navigate(`/parent/records?member=${memberKey(member)}&courseName=${encodeURIComponent(row.courseName || '')}`)}>
                  <span><strong>{row.courseName || '未命名课程'}</strong>{row.cardCategory ? <Tag>{cardLabel(row.cardCategory)}</Tag> : null}</span>
                  <small>{[row.orgName, row.campusName, benefitText(row)].filter(Boolean).join(' · ') || `${row.scheduleCount || 0} 个排课时段`}</small>
                </button>
                <div className="parent-course-actions">
                  {row.source === 'INSTITUTION' && row.institutionRefKey ? <Button type="text" icon={<EditOutlined />} onClick={() => { setAliasEditing(row); aliasForm.setFieldsValue({ name: row.courseName || '' }) }}>改显示名</Button> : null}
                  {row.source === 'PRIVATE' ? <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button> : null}
                  {row.source === 'PRIVATE' ? <Popconfirm title="删除这门课程？" description="相关自建排课、缴费与打卡记录也会处理。" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => remove(row)}><Button type="text" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null}
                  <RightOutlined />
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {!groups.length && !loading ? <div className="parent-card parent-empty"><Empty description="先新建成员，再添加课程" /></div> : null}
      <Modal open={editing !== undefined} title={editing ? '编辑课程' : '新建课程'} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void save()} onCancel={() => setEditing(undefined)} width={560}>
        <p className="parent-modal-intro">填写机构与课程名称后，就可以安排课表、记录缴费和打卡。</p>
        <Form form={form} layout="vertical">
          <Form.Item name="memberKey" label="成员" rules={[{ required: true, message: '请选择成员' }]}><Select options={memberOptions} /></Form.Item>
          <Form.Item name="orgName" label="机构名称" rules={[{ required: true, whitespace: true, message: '请输入机构名称' }, { max: 40 }]}><Input placeholder="例如：星河艺术" /></Form.Item>
          <Form.Item name="campusName" label="校区名称（选填）"><Input maxLength={40} placeholder="例如：万达校区" /></Form.Item>
          <Form.List name="names" rules={[{ validator: async (_, values) => { if (!values?.some((value: string) => value?.trim())) throw new Error('至少填写一门课程') } }]}>
            {(fields, { add, remove }, { errors }) => <><label className="parent-form-label">课程名称</label>{fields.map((field, index) => <div className="parent-course-name-field" key={field.key}><Form.Item {...field} rules={[{ required: true, whitespace: true, message: '请输入课程名称' }]}><Input maxLength={40} placeholder="例如：钢琴课、游泳课" /></Form.Item>{!editing && fields.length > 1 ? <Button danger type="text" onClick={() => remove(field.name)}>删除</Button> : null}{!editing && index === fields.length - 1 ? <Button type="dashed" icon={<PlusOutlined />} onClick={() => add('')}>再加一门</Button> : null}</div>)}<Form.ErrorList errors={errors} /></>}
          </Form.List>
        </Form>
      </Modal>
      <Modal open={Boolean(aliasEditing)} title="课程显示名" okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void saveAlias()} onCancel={() => setAliasEditing(null)}>
        <p className="parent-modal-intro">只改家长端显示名，对应的机构课程关系不会改变。机构原名：{aliasEditing?.officialCourseName || '未提供'}</p>
        <Form form={aliasForm} layout="vertical"><Form.Item name="name" label="显示名称"><Input maxLength={40} placeholder="留空则跟随机构名称" /></Form.Item></Form>
      </Modal>
    </div>
  )
}

function cardLabel(value?: string) {
  if (value === 'STORED_VALUE') return '储值卡'
  if (value === 'PERIOD') return '时段卡'
  if (value === 'HOURS') return '课时卡'
  return value || ''
}

function benefitText(row: ParentCourseCatalogItem) {
  if (row.cardCategory === 'HOURS' && row.remainingHours != null) return `剩余 ${row.remainingHours} 课时`
  if (row.cardCategory === 'STORED_VALUE' && row.remainingAmount != null) return `余额 ¥${Number(row.remainingAmount).toFixed(2)}`
  if (row.cardCategory === 'PERIOD') return row.validEndDate ? `有效至 ${row.validEndDate}` : '长期有效'
  return ''
}
