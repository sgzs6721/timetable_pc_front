import { Button, Form, Modal, Select, message } from 'antd'
import { useState } from 'react'
import type { Person } from './campus-model'
import { tell } from './kit'

export interface CoachHandoverActiveCardStudent {
  studentId: number
  studentName: string
  activeCardCount: number
}

export interface CoachHandoverCheck {
  activeStudentCount?: number
  oneToOneStudentCount?: number
  futureScheduleCount?: number
  templateScheduleCount?: number
  activeCardCount?: number
  activeGroupCount?: number
  activeCardStudents?: CoachHandoverActiveCardStudent[]
  totalCount?: number
  replacementRequired?: boolean
}

export interface StaffOffboardState {
  person: Person
  action: 'RESIGN' | 'DELETE'
  check: CoachHandoverCheck
}

function handoverCandidates(people: Person[], sourceId: number): Person[] {
  return people.filter((item) => item.id !== sourceId && item.status !== 0 && item.isSubstituteTeacher)
}

function handoverLines(check: CoachHandoverCheck): string[] {
  const rows = [
    ['在读学员', check.activeStudentCount],
    ['一对一', check.oneToOneStudentCount],
    ['未来课次', check.futureScheduleCount],
    ['固定课表', check.templateScheduleCount],
    ['课程', check.activeGroupCount],
  ]
  return rows.filter((item) => Number(item[1] || 0) > 0).map((item) => `${item[0]} ${item[1]}`)
}

export function CoachHandoverModal(props: {
  value: StaffOffboardState
  people: Person[]
  onClose: () => void
  onFinish: (person: Person, action: 'RESIGN' | 'DELETE', replacementMemberId: number) => Promise<void>
}) {
  const [showCardStudents, setShowCardStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { value } = props
  const deleting = value.action === 'DELETE'
  const candidates = handoverCandidates(props.people, value.person.id)
  const cardStudents = value.check.activeCardStudents || []
  return (
    <Modal title={deleting ? '删除人员并交接' : '办理离职交接'} open onCancel={submitting ? undefined : props.onClose} footer={null} destroyOnHidden>
      <div className="coach-handover-copy">
        <p>原带课老师：{value.person.displayName || value.person.nickname || '该人员'}</p>
        <p>以下业务将转交接替老师，请确认。</p>
        <p>{deleting ? '交接完成后，该人员将移出当前校区并移除相关权限；历史记录仍会保留。' : '交接完成后，该人员将标记为离职；历史记录仍会保留。'}</p>
      </div>
      <div className="stat-line"><span>待交接业务<strong>{Number(value.check.totalCount || 0)} 项</strong></span></div>
      <ul className="coach-handover-lines">
        {handoverLines(value.check).map((line) => <li key={line}>{line}</li>)}
        {Number(value.check.activeCardCount || 0) > 0 ? <li>
          有效学员卡{' '}
          <button type="button" className="coach-handover-card-count" disabled={!cardStudents.length} onClick={() => setShowCardStudents((current) => !current)}>{value.check.activeCardCount}</button>
        </li> : null}
      </ul>
      {showCardStudents ? <div className="coach-handover-card-students">
        <strong>有效学员卡名单</strong>
        <div>{cardStudents.map((item) => <span key={item.studentId}><b>{item.studentName || `学员${item.studentId}`}</b><small>{item.activeCardCount} 张</small></span>)}</div>
      </div> : null}
      <Form layout="vertical" onFinish={async (values: { replacementMemberId?: number }) => {
        if (!values.replacementMemberId || submitting) return
        setSubmitting(true)
        try {
          await props.onFinish(value.person, value.action, values.replacementMemberId)
        } catch (error) {
          message.error(tell(error, deleting ? '删除失败' : '离职失败'))
        } finally { setSubmitting(false) }
      }}>
        <Form.Item name="replacementMemberId" label="选择接替老师" extra="必选" rules={[{ required: true, message: '请选择接替老师' }]}>
          <Select options={candidates.map((item) => ({ value: item.id, label: [`${item.gender === 'female' ? '♀' : '♂'} ${item.displayName || item.nickname || item.phone}`, item.positionName || '带课老师'].filter(Boolean).join(' · ') }))} />
        </Form.Item>
        {!candidates.length ? <p>暂无可接替的在职带课老师。请先添加或启用其他带课老师后再办理交接。</p> : null}
        <Button danger={deleting} type="primary" htmlType="submit" loading={submitting} disabled={!candidates.length}>{submitting ? '交接中...' : '确认交接'}</Button>
      </Form>
    </Modal>
  )
}
