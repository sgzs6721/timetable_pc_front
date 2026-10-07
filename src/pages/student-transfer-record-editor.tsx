import { Button, Form, Input, Modal, Radio, Space, message } from 'antd'
import { useEffect, useState } from 'react'
import { putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import type { Card, PayRecord, Student } from './students-model'
import { tell } from './kit'
import { isTransferInRecord, paymentChildLine } from './student-payments'

interface TransferOutDraft {
  recordId: number
  targetText: string
  summaryText: string
  dateText: string
}

interface TransferEditDraft {
  validityMode: 'timed' | 'deadline'
  validStartDate: string
  validEndDate: string
  consumeDeadline: string
  sourceText: string
  transferOutRemarks: TransferOutDraft[]
}

const EMPTY_DRAFT: TransferEditDraft = {
  validityMode: 'deadline',
  validStartDate: '',
  validEndDate: '',
  consumeDeadline: '',
  sourceText: '',
  transferOutRemarks: [],
}

function isoDate(value: unknown): string {
  const text = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function transferPartyText(record: PayRecord, transferIn: boolean): string {
  const remark = String(record.remark || '').trim()
  const matched = transferIn
    ? remark.match(/来自\s*([^；;]+)/)
    : remark.match(/(?:转至|转给)\s*([^；;]+)/)
  let party = matched?.[1]?.trim() || ''
  const studentName = String(record.transferTargetStudentName || '').trim()
  if (remark.includes('转校区') && studentName && !party.includes(studentName)) party = [party, studentName].filter(Boolean).join(' ')
  return party || studentName
}

function transferDraft(record: PayRecord): TransferEditDraft {
  const start = isoDate(record.validStartDate)
  const end = isoDate(record.validEndDate)
  const source = String(record.transferSourceText || '').replace(/^来自\s*/, '').trim() || transferPartyText(record, true)
  const transferOutRemarks = (record.supplements || [])
    .filter((item) => item.adjustmentReason === 'transfer' && !isTransferInRecord(item))
    .map((item) => ({
      recordId: Number(item.id || 0),
      targetText: transferPartyText(item, false),
      summaryText: paymentChildLine(item, false) || item.typeText || '转出记录',
      dateText: String(item.paymentDate || '').slice(0, 10),
    }))
    .filter((item) => item.recordId > 0)
  return {
    validityMode: start || end ? 'timed' : 'deadline',
    validStartDate: start,
    validEndDate: end,
    consumeDeadline: isoDate(record.consumeDeadline),
    sourceText: source,
    transferOutRemarks,
  }
}

export function TransferRecordEditor(props: {
  record: PayRecord | null
  card?: Card
  student: Student
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<TransferEditDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const period = String(props.card?.cardCategory || props.student.cardCategory || '').toUpperCase() === 'PERIOD'
  useEffect(() => {
    if (props.record) setDraft(transferDraft(props.record))
    else setDraft(EMPTY_DRAFT)
  }, [props.record])
  function patch(next: Partial<TransferEditDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }
  async function save() {
    if (!props.record || saving) return
    const sourceText = draft.sourceText.trim().replace(/^来自\s*/, '')
    if (!sourceText) {
      message.warning('请填写转入来源')
      return
    }
    const transferOutRemarks = draft.transferOutRemarks.map((item) => ({
      recordId: item.recordId,
      targetText: item.targetText.trim().replace(/^(?:转至|转给)\s*/, ''),
    }))
    if (transferOutRemarks.some((item) => !item.targetText)) {
      message.warning('请填写转出目标')
      return
    }
    const mode = period ? 'timed' : draft.validityMode
    if (mode === 'timed' && (!isoDate(draft.validStartDate) || !isoDate(draft.validEndDate))) {
      message.warning('请选择完整有效期')
      return
    }
    if (mode === 'timed' && draft.validEndDate < draft.validStartDate) {
      message.warning('结束日期不能早于开始日期')
      return
    }
    if (mode === 'deadline' && draft.consumeDeadline && !isoDate(draft.consumeDeadline)) {
      message.warning('有效期格式不正确')
      return
    }
    setSaving(true)
    try {
      await putJson(`/payment-records/${props.record.id}/transfer-details`, {
        validityMode: mode,
        validStartDate: mode === 'timed' ? draft.validStartDate : undefined,
        validEndDate: mode === 'timed' ? draft.validEndDate : undefined,
        consumeDeadline: mode === 'deadline' ? (draft.consumeDeadline || undefined) : undefined,
        sourceText,
        transferOutRemarks,
      })
      message.success('已保存')
      props.onClose()
      await props.onSaved()
    } catch (error) {
      message.error(tell(error, '保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title="编辑转入记录" open={!!props.record} onCancel={saving ? undefined : props.onClose} footer={null} destroyOnHidden>
      <Form layout="vertical" onFinish={() => void save()}>
        <p>仅可修改有效期、转入来源和下方转出目标。</p>
        {!period ? (
          <Form.Item label="有效期模式">
            <Radio.Group value={draft.validityMode} onChange={(event) => patch({ validityMode: event.target.value })} options={[{ value: 'timed', label: '起止日期' }, { value: 'deadline', label: '有效期至' }]} />
          </Form.Item>
        ) : null}
        {period || draft.validityMode === 'timed' ? (
          <Form.Item label="有效期" required>
            <Space wrap>
              <BusinessDatePicker value={draft.validStartDate} allowClear={false} onChange={(value) => patch({ validStartDate: value, validEndDate: !draft.validEndDate || draft.validEndDate < value ? value : draft.validEndDate })} />
              <span>至</span>
              <BusinessDatePicker value={draft.validEndDate} minDate={draft.validStartDate || undefined} allowClear={false} onChange={(value) => patch({ validEndDate: value })} />
            </Space>
          </Form.Item>
        ) : (
          <Form.Item label="有效期至" extra="留空表示不限期"><BusinessDatePicker value={draft.consumeDeadline} allowClear onChange={(value) => patch({ consumeDeadline: value })} /></Form.Item>
        )}
        <Form.Item label="转入来源" required extra="跨校区请保留“校区 + 人员名称”；本校区填写人员名称即可">
          <Input addonBefore="来自" maxLength={120} value={draft.sourceText} onChange={(event) => patch({ sourceText: event.target.value })} placeholder="填写校区和人员名称" />
        </Form.Item>
        {draft.transferOutRemarks.map((item, index) => (
          <Form.Item key={item.recordId} label={item.summaryText} extra={item.dateText || undefined} required>
            <Input addonBefore="转至" maxLength={120} value={item.targetText} onChange={(event) => patch({ transferOutRemarks: draft.transferOutRemarks.map((row, rowIndex) => rowIndex === index ? { ...row, targetText: event.target.value } : row) })} placeholder="填写校区和人员名称" />
          </Form.Item>
        ))}
        <Space><Button onClick={props.onClose} disabled={saving}>取消</Button><Button type="primary" htmlType="submit" loading={saving}>保存修改</Button></Space>
      </Form>
    </Modal>
  )
}
