import { Button, Form, Modal, Radio, Space, message } from 'antd'
import { useEffect, useState } from 'react'
import { putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import type { Card, PayRecord, Student } from './students-model'
import { tell } from './kit'

interface TransferEditDraft {
  validityMode: 'timed' | 'deadline'
  validStartDate: string
  validEndDate: string
  consumeDeadline: string
}

const EMPTY_DRAFT: TransferEditDraft = {
  validityMode: 'deadline',
  validStartDate: '',
  validEndDate: '',
  consumeDeadline: '',
}

function isoDate(value: unknown): string {
  const text = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function transferDraft(record: PayRecord): TransferEditDraft {
  const start = isoDate(record.validStartDate)
  const end = isoDate(record.validEndDate)
  return {
    validityMode: start || end ? 'timed' : 'deadline',
    validStartDate: start,
    validEndDate: end,
    consumeDeadline: isoDate(record.consumeDeadline),
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
        <p>仅可修改有效期，转入来源和转出目标保留系统生成内容。</p>
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
        <Space><Button onClick={props.onClose} disabled={saving}>取消</Button><Button type="primary" htmlType="submit" loading={saving}>保存修改</Button></Space>
      </Form>
    </Modal>
  )
}
