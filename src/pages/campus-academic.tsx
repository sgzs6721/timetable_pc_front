import { Button, Form, Input, InputNumber, Modal, Popconfirm, Radio, Segmented, Select, Space, Switch, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { tell } from './kit'

interface TrialType {
  id: number
  studentName?: string
  includeSalary?: number
  salaryRatio?: number
}

interface RefundRules {
  lessonFeeEnabled: boolean
  lessonFeePercent: number
  lessonDeductMode: string
  periodFeeEnabled: boolean
  periodFeePercent: number
  periodDeductMode: string
  storedFeeEnabled: boolean
  storedFeePercent: number
  storedDeductMode: string
}

function readJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object') return value as T
  if (typeof value !== 'string' || !value.trim()) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function trialPercent(ratio?: number, includeSalary?: number): number {
  if (Number(includeSalary) === 0) return 0
  if (ratio == null || !Number.isFinite(Number(ratio))) return 100
  return Math.min(100, Math.max(0, Math.round(Number(ratio) * 100)))
}

function trialRatio(percent: number | undefined, include: boolean): number {
  if (!include) return 0
  const value = percent == null || !Number.isFinite(Number(percent)) ? 100 : Number(percent)
  return Number((Math.min(100, Math.max(0, Math.round(value))) / 100).toFixed(4))
}

function clampRefundFeePercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(30, Number(value.toFixed(2)))
}

function refundConfig(refund: RefundRules) {
  return JSON.stringify({
    lesson: { deductMode: refund.lessonDeductMode, feeEnabled: refund.lessonFeeEnabled, feePercent: clampRefundFeePercent(refund.lessonFeePercent) },
    period: { deductMode: refund.periodDeductMode, feeEnabled: refund.periodFeeEnabled, feePercent: clampRefundFeePercent(refund.periodFeePercent) },
    stored: { deductMode: refund.storedDeductMode, feeEnabled: refund.storedFeeEnabled, feePercent: clampRefundFeePercent(refund.storedFeePercent) },
  })
}

function RefundRuleFields(props: {
  feeEnabled: boolean
  feePercent: number
  deductMode: string
  options: Array<{ value: string; label: string; hint: string }>
  onFee: (enabled: boolean) => void
  onPercent: (value: number) => void
  onMode: (mode: string) => void
}) {
  return <div className="refund-rule-fields">
    <div className="refund-fee-block">
      <div className="refund-setting-heading">
        <div><strong>退费手续费</strong><span>对扣除已用部分后的可退金额收取</span></div>
        <Switch checked={props.feeEnabled} onChange={props.onFee} />
      </div>
      {props.feeEnabled ? <div className="refund-fee-input">
        <label htmlFor="refund-fee-percent">默认手续费比例</label>
        <InputNumber id="refund-fee-percent" min={0} max={30} value={props.feePercent} addonAfter="%" onChange={(value) => props.onPercent(clampRefundFeePercent(Number(value || 0)))} />
        <span>退费时仍可调整，最高 30%</span>
      </div> : null}
    </div>
    <div className="refund-deduct-block">
      <div className="refund-setting-heading">
        <div><strong>已用部分扣除方式</strong><span>选择该卡类型发生退费时的金额计算规则</span></div>
      </div>
      <Radio.Group className="refund-rule-options" value={props.deductMode} onChange={(event) => props.onMode(event.target.value)}>
        {props.options.map((item) => <Radio className="refund-rule-option" key={item.value} value={item.value}>
          <strong>{item.label}</strong><span>{item.hint}</span>
        </Radio>)}
      </Radio.Group>
    </div>
  </div>
}

function trialTypeNameError(name: string | undefined, types: TrialType[], currentId?: number): string {
  const text = String(name || '').trim()
  if (!text) return '体验类型不能为空'
  if (Array.from(text).length > 6) return '体验类型不能超过6个字'
  if (types.some((item) => item.id !== currentId && String(item.studentName || '').trim() === text)) return '该体验类型已存在'
  return ''
}

function trialTypeKey(name: string | undefined, include: boolean, percent?: number) {
  const ratio = include ? Math.min(100, Math.max(0, Math.round(Number(percent ?? 100)))) : 0
  return `${String(name || '').trim()}|${include ? 1 : 0}|${ratio}`
}

function TrialTypeAddButton(props: { types: TrialType[] }) {
  const name = Form.useWatch('studentName') as string | undefined
  const blocked = trialTypeNameError(name, props.types) || (props.types.length >= 10 ? '最多 10 个体验类型' : '')
  return <Button htmlType="submit" disabled={!!blocked}>新增</Button>
}

function TrialTypeSaveButton(props: { row: TrialType; types: TrialType[] }) {
  const name = Form.useWatch('studentName') as string | undefined
  const include = Form.useWatch('includeSalary') as boolean | undefined
  const percent = Form.useWatch('salaryPercent') as number | undefined
  const blocked = trialTypeNameError(name, props.types, props.row.id)
  const same = trialTypeKey(name, include !== false, percent) === trialTypeKey(props.row.studentName, Number(props.row.includeSalary) !== 0, trialPercent(props.row.salaryRatio, props.row.includeSalary))
  return <Button type="primary" htmlType="submit" disabled={!!blocked || same}>保存</Button>
}

function academicPayload(state: { autoEnabled: boolean; autoMode: string; autoTime: string; fixedEnabled: boolean; fixedDay: number; fixedTime: string }): string {
  return JSON.stringify({
    scheduleAutoConsumeConfig: { enabled: state.autoEnabled, mode: state.autoEnabled ? state.autoMode : 'off', ...(state.autoEnabled && state.autoMode === 'scheduled' ? { executeTime: state.autoTime } : {}) },
    fixedTimetableInstanceConfig: { enabled: state.fixedEnabled, mode: state.fixedEnabled ? 'weekly' : 'off', ...(state.fixedEnabled ? { executeDayOfWeek: state.fixedDay, executeTime: state.fixedTime } : {}) },
  })
}

function trialDurations(enabled: boolean, halfHourEnabled: boolean, oneHourEnabled: boolean, snapshot: string) {
  if (!enabled || halfHourEnabled || oneHourEnabled) return { halfHourEnabled, oneHourEnabled }
  try {
    const saved = JSON.parse(snapshot || '{}') as { halfHourEnabled?: boolean; oneHourEnabled?: boolean }
    if (saved.halfHourEnabled || saved.oneHourEnabled) return { halfHourEnabled: !!saved.halfHourEnabled, oneHourEnabled: !!saved.oneHourEnabled }
  } catch { return { halfHourEnabled: true, oneHourEnabled: true } }
  return { halfHourEnabled: true, oneHourEnabled: true }
}

export function AcademicSettings({ campusId, section = 'all' }: { campusId: number | null; section?: 'all' | 'trial' | 'academic' }) {
  const [types, setTypes] = useState<TrialType[]>([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TrialType | null>(null)
  const [trialEnabled, setTrialEnabled] = useState(true)
  const [halfHour, setHalfHour] = useState(true)
  const [oneHour, setOneHour] = useState(true)
  const [trialSnapshot, setTrialSnapshot] = useState('{"enabled":true,"halfHourEnabled":true,"oneHourEnabled":true}')
  const [trialSaving, setTrialSaving] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoMode, setAutoMode] = useState('on_complete')
  const [autoTime, setAutoTime] = useState('21:00')
  const [fixedEnabled, setFixedEnabled] = useState(false)
  const [fixedDay, setFixedDay] = useState(1)
  const [fixedTime, setFixedTime] = useState('21:00')
  const [academicSaved, setAcademicSaved] = useState('')
  const [academicSaving, setAcademicSaving] = useState(false)
  const [refundTab, setRefundTab] = useState('lesson')
  const [refundSaved, setRefundSaved] = useState('')
  const [refund, setRefund] = useState<RefundRules>({ lessonFeeEnabled: false, lessonFeePercent: 0, lessonDeductMode: 'original', periodFeeEnabled: false, periodFeePercent: 0, periodDeductMode: 'duration', storedFeeEnabled: false, storedFeePercent: 0, storedDeductMode: 'original' })

  async function load() {
    if (!campusId) return
    const [settings, students] = await Promise.all([
      getJson<Record<string, unknown>>(`/campus-staff/${campusId}/settings`),
      getJson<TrialType[]>(`/campus-staff/${campusId}/default-students`),
    ])
    setTypes(students || [])
    const trial = readJson(settings.trialLessonConfig, { enabled: true, halfHourEnabled: true, oneHourEnabled: true })
    const nextTrial = { enabled: trial.enabled !== false, halfHourEnabled: trial.halfHourEnabled !== false, oneHourEnabled: trial.oneHourEnabled !== false }
    setTrialEnabled(nextTrial.enabled); setHalfHour(nextTrial.halfHourEnabled); setOneHour(nextTrial.oneHourEnabled); setTrialSnapshot(JSON.stringify(nextTrial))
    const auto = readJson(settings.scheduleAutoConsumeConfig, { enabled: false, mode: 'off', executeTime: '21:00' })
    const nextAutoEnabled = !!auto.enabled
    const nextAutoMode = auto.mode === 'scheduled' ? 'scheduled' : 'on_complete'
    const nextAutoTime = String(auto.executeTime || '21:00').slice(0, 5)
    setAutoEnabled(nextAutoEnabled); setAutoMode(nextAutoMode); setAutoTime(nextAutoTime)
    const fixed = readJson(settings.fixedTimetableInstanceConfig, { enabled: false, executeDayOfWeek: 1, executeTime: '21:00' })
    const nextFixedEnabled = !!fixed.enabled
    const nextFixedDay = Number(fixed.executeDayOfWeek || 1)
    const nextFixedTime = String(fixed.executeTime || '21:00').slice(0, 5)
    setFixedEnabled(nextFixedEnabled); setFixedDay(nextFixedDay); setFixedTime(nextFixedTime)
    setAcademicSaved(academicPayload({ autoEnabled: nextAutoEnabled, autoMode: nextAutoMode, autoTime: nextAutoTime, fixedEnabled: nextFixedEnabled, fixedDay: nextFixedDay, fixedTime: nextFixedTime }))
    const parsed = readJson<{ lesson?: Record<string, unknown>; period?: Record<string, unknown>; stored?: Record<string, unknown> }>(settings.refundSettingsConfig, {})
    const nextRefund: RefundRules = {
      lessonFeeEnabled: !!parsed.lesson?.feeEnabled, lessonFeePercent: Number(parsed.lesson?.feePercent || 0), lessonDeductMode: String(parsed.lesson?.deductMode || 'original'),
      periodFeeEnabled: !!parsed.period?.feeEnabled, periodFeePercent: Number(parsed.period?.feePercent || 0), periodDeductMode: String(parsed.period?.deductMode || 'duration'),
      storedFeeEnabled: !!parsed.stored?.feeEnabled, storedFeePercent: Number(parsed.stored?.feePercent || 0), storedDeductMode: String(parsed.stored?.deductMode || 'original'),
    }
    setRefund(nextRefund); setRefundSaved(refundConfig(nextRefund))
  }

  useEffect(() => { load().catch((error) => message.error(tell(error, '教务设置加载失败'))) }, [campusId])

  async function saveTrial(next: { enabled: boolean; halfHourEnabled: boolean; oneHourEnabled: boolean }) {
    if (trialSaving) return
    const resolved = trialDurations(next.enabled, next.halfHourEnabled, next.oneHourEnabled, trialSnapshot)
    const state = { enabled: next.enabled, ...resolved }
    if (state.enabled && !state.halfHourEnabled && !state.oneHourEnabled) { message.warning('请至少开启一个体验时长'); return }
    if (JSON.stringify(state) === trialSnapshot) { setTrialEnabled(state.enabled); setHalfHour(state.halfHourEnabled); setOneHour(state.oneHourEnabled); return }
    const previous = { enabled: trialEnabled, halfHourEnabled: halfHour, oneHourEnabled: oneHour }
    setTrialEnabled(state.enabled); setHalfHour(state.halfHourEnabled); setOneHour(state.oneHourEnabled); setTrialSaving(true)
    try {
      await postJson(`/campus-staff/${campusId}/settings`, { trialLessonConfig: JSON.stringify(state) })
      setTrialSnapshot(JSON.stringify(state))
    } catch (error) {
      setTrialEnabled(previous.enabled); setHalfHour(previous.halfHourEnabled); setOneHour(previous.oneHourEnabled); message.error(tell(error, '保存失败'))
    } finally { setTrialSaving(false) }
  }

  const academicNow = academicPayload({ autoEnabled, autoMode, autoTime, fixedEnabled, fixedDay, fixedTime })
  const academicDirty = !!academicSaved && academicNow !== academicSaved
  if (!campusId) return <p>请先选择校区。</p>

  return <>
    {section !== 'academic' ? <section className="work-card academic-settings-card">
      <header className="academic-section-head">
        <div>
          <h2>体验类型</h2>
          <span>排体验课时选择对应类型，并设置是否计入老师工资，最多 10 个</span>
        </div>
        <Button type="primary" disabled={types.length >= 10} onClick={() => setCreating(true)}>新建体验类型</Button>
      </header>
      <Table rowKey="id" dataSource={types} pagination={false} locale={{ emptyText: '还没有体验类型' }} columns={[
        { title: '名称', dataIndex: 'studentName' },
        { title: '计入工资', render: (_: unknown, row: TrialType) => <span className={Number(row.includeSalary) === 0 ? 'status-pill is-muted' : 'status-pill is-ok'}>{Number(row.includeSalary) === 0 ? '不计入' : '计入'}</span> },
        { title: '工资比例', render: (_: unknown, row: TrialType) => Number(row.includeSalary) === 0 ? '—' : `${trialPercent(row.salaryRatio, row.includeSalary)}%` },
        { title: '操作', render: (_: unknown, row: TrialType) => <Space><Button type="link" onClick={() => setEditing(row)}>编辑</Button><Popconfirm title="删除这个体验类型？" onConfirm={async () => { await delJson(`/campus-staff/${campusId}/default-students/${row.id}`); await load() }}><Button type="link" danger>删除</Button></Popconfirm></Space> },
      ]} />
    </section> : null}
    <div className={`academic-settings-grid ${section === 'trial' ? 'is-single' : ''}`}>
      {section !== 'academic' ? <section className="work-card academic-settings-card">
        <header className="academic-section-head">
          <div><h2>体验课时长</h2><span>控制排课时可选择的体验课时长</span></div>
        </header>
        <div className="academic-option-list">
          <div className="academic-option-row is-primary">
            <div><strong>开启体验课</strong><span>开启后，排课时可选择体验类型</span></div>
            <Switch checked={trialEnabled} loading={trialSaving} onChange={(checked) => { void saveTrial({ enabled: checked, halfHourEnabled: halfHour, oneHourEnabled: oneHour }) }} />
          </div>
          {trialEnabled ? <div className="academic-duration-grid">
            <div className="academic-option-row">
              <div><strong>半小时</strong><span>体验课 30 分钟</span></div>
              <Switch checked={halfHour} disabled={trialSaving} onChange={(checked) => { void saveTrial({ enabled: true, halfHourEnabled: checked, oneHourEnabled: oneHour }) }} />
            </div>
            <div className="academic-option-row">
              <div><strong>一小时</strong><span>体验课 60 分钟</span></div>
              <Switch checked={oneHour} disabled={trialSaving} onChange={(checked) => { void saveTrial({ enabled: true, halfHourEnabled: halfHour, oneHourEnabled: checked }) }} />
            </div>
          </div> : null}
        </div>
      </section> : null}
      {section !== 'trial' ? <section className="work-card academic-settings-card">
        <header className="academic-section-head">
          <div><h2>自动消课和预创建</h2><span>配置课程完成后的自动处理规则</span></div>
        </header>
        <div className="academic-option-list">
          <div className="academic-setting-block">
            <div className="academic-option-row is-primary">
              <div><strong>按排课表自动消课</strong><span>按课程完成状态或固定时间自动处理</span></div>
              <Switch checked={autoEnabled} onChange={setAutoEnabled} />
            </div>
            {autoEnabled ? <div className="academic-setting-detail">
              <Segmented block value={autoMode} onChange={(value) => setAutoMode(String(value))} options={[{ value: 'on_complete', label: '课程完成后' }, { value: 'scheduled', label: '每天定时' }]} />
              {autoMode === 'scheduled' ? <label className="academic-inline-field"><span>执行时间</span><input type="time" value={autoTime} onChange={(event) => setAutoTime(event.target.value)} /></label> : null}
            </div> : null}
          </div>
          <div className="academic-setting-block">
            <div className="academic-option-row is-primary">
              <div><strong>固定课表预创建</strong><span>按指定日期和时间预先创建下周课表</span></div>
              <Switch checked={fixedEnabled} onChange={setFixedEnabled} />
            </div>
            {fixedEnabled ? <div className="academic-setting-detail is-inline">
              <label className="academic-inline-field"><span>创建日</span><Select value={fixedDay} onChange={setFixedDay} options={['一', '二', '三', '四', '五', '六', '日'].map((label, index) => ({ value: index + 1, label: `周${label}` }))} /></label>
              <label className="academic-inline-field"><span>创建时间</span><input type="time" value={fixedTime} onChange={(event) => setFixedTime(event.target.value)} /></label>
            </div> : null}
          </div>
          <div className="academic-save-row">
          <Button type="primary" disabled={!academicDirty || academicSaving} onClick={async () => {
            if (!academicDirty || academicSaving) return
            if (autoEnabled && autoMode === 'scheduled' && !String(autoTime || '').trim()) { message.warning('请选择定时消课时间'); return }
            if (fixedEnabled && !(fixedDay >= 1 && fixedDay <= 7)) { message.warning('请选择预创建日期'); return }
            if (fixedEnabled && !String(fixedTime || '').trim()) { message.warning('请选择预创建时间'); return }
            setAcademicSaving(true)
            try {
              const saved = academicPayload({ autoEnabled, autoMode, autoTime, fixedEnabled, fixedDay, fixedTime })
              const parsed = JSON.parse(saved) as { scheduleAutoConsumeConfig: unknown; fixedTimetableInstanceConfig: unknown }
              await postJson(`/campus-staff/${campusId}/settings`, { scheduleAutoConsumeConfig: JSON.stringify(parsed.scheduleAutoConsumeConfig), fixedTimetableInstanceConfig: JSON.stringify(parsed.fixedTimetableInstanceConfig) })
              setAcademicSaved(saved); message.success('保存成功')
            } catch (error) { message.error(tell(error, '保存失败')) } finally { setAcademicSaving(false) }
          }}>{academicSaving ? '保存中...' : academicDirty ? '保存教务设置' : '已保存'}</Button>
          </div>
        </div>
      </section> : null}
      {section !== 'trial' ? <RefundSettings refund={refund} saved={refundSaved} tab={refundTab} campusId={campusId} onTab={setRefundTab} onChange={setRefund} onSaved={setRefundSaved} /> : null}
    </div>
    {section !== 'academic' ? <Modal title="新建体验类型" open={creating} onCancel={() => setCreating(false)} footer={null} destroyOnHidden>
      <Form layout="vertical" initialValues={{ includeSalary: true, salaryPercent: 100 }} onFinish={async (values: { studentName: string; includeSalary?: boolean; salaryPercent?: number }) => {
        const nameError = trialTypeNameError(values.studentName, types)
        if (nameError) { message.warning(nameError); return }
        if (types.length >= 10) { message.warning('最多 10 个体验类型'); return }
        const include = values.includeSalary !== false
        await postJson(`/campus-staff/${campusId}/default-students`, { studentName: String(values.studentName || '').trim(), includeSalary: include ? 1 : 0, salaryRatio: trialRatio(values.salaryPercent, include) })
        message.success('已添加'); setCreating(false); await load()
      }}>
        <Form.Item name="studentName" label="体验名称" rules={[{ required: true, message: '体验类型不能为空' }]}><Input placeholder="最多 6 个字" maxLength={6} /></Form.Item>
        <Form.Item name="includeSalary" label={<span>计入工资 <small className="form-label-note">按老师课时费比例结算</small></span>} valuePropName="checked"><Switch /></Form.Item>
        <Form.Item noStyle shouldUpdate>{(form) => form.getFieldValue('includeSalary') === false ? null : <Form.Item name="salaryPercent" label="单课时比例"><InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} /></Form.Item>}</Form.Item>
        <TrialTypeAddButton types={types} />
      </Form>
    </Modal> : null}
    {section !== 'academic' ? <Modal title="编辑体验类型" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
      {editing ? <Form layout="vertical" initialValues={{ studentName: editing.studentName, includeSalary: Number(editing.includeSalary) !== 0, salaryPercent: trialPercent(editing.salaryRatio, editing.includeSalary) }} onFinish={async (values: { studentName: string; includeSalary?: boolean; salaryPercent?: number }) => {
        const nameError = trialTypeNameError(values.studentName, types, editing.id)
        if (nameError) { message.warning(nameError); return }
        const include = values.includeSalary !== false
        if (trialTypeKey(values.studentName, include, values.salaryPercent) === trialTypeKey(editing.studentName, Number(editing.includeSalary) !== 0, trialPercent(editing.salaryRatio, editing.includeSalary))) return
        await putJson(`/campus-staff/${campusId}/default-students/${editing.id}`, { studentName: String(values.studentName || '').trim(), includeSalary: include ? 1 : 0, salaryRatio: trialRatio(values.salaryPercent, include) })
        message.success('已更新'); setEditing(null); await load()
      }}>
        <Form.Item name="studentName" label="名称" extra="最多6个字" rules={[{ required: true, message: '体验类型不能为空' }]}><Input maxLength={6} /></Form.Item>
        <Form.Item name="includeSalary" label="计入工资" extra="按老师课时费比例结算" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item noStyle shouldUpdate>{(form) => form.getFieldValue('includeSalary') === false ? null : <Form.Item name="salaryPercent" label="单课时比例"><InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} /></Form.Item>}</Form.Item>
        <TrialTypeSaveButton row={editing} types={types} />
      </Form> : null}
    </Modal> : null}
  </>
}

function RefundSettings(props: { refund: RefundRules; saved: string; tab: string; campusId: number; onTab: (value: string) => void; onChange: (value: RefundRules) => void; onSaved: (value: string) => void }) {
  const { refund } = props
  return <section className="work-card academic-settings-card">
    <header className="academic-section-head">
      <div><h2>退费设置</h2><span>有打卡时，按卡类型规则扣除已用部分</span></div>
    </header>
    <Tabs className="refund-settings-tabs" activeKey={props.tab} onChange={props.onTab} items={[
      { key: 'lesson', label: '课时卡', children: <RefundRuleFields feeEnabled={refund.lessonFeeEnabled} feePercent={refund.lessonFeePercent} deductMode={refund.lessonDeductMode} options={[{ value: 'original', label: '按已上课时原价扣除', hint: '已打卡课时按缴费时原价从可退金额中扣除' }, { value: 'current_unit', label: '按当前单价扣除', hint: '已打卡课时按当前课时单价扣除' }]} onFee={(value) => props.onChange({ ...refund, lessonFeeEnabled: value })} onPercent={(value) => props.onChange({ ...refund, lessonFeePercent: value })} onMode={(value) => props.onChange({ ...refund, lessonDeductMode: value })} /> },
      { key: 'period', label: '时段卡', children: <RefundRuleFields feeEnabled={refund.periodFeeEnabled} feePercent={refund.periodFeePercent} deductMode={refund.periodDeductMode} options={[{ value: 'original', label: '按上课或服务原价扣除', hint: '已打卡上课/服务按原价从可退金额中扣除' }, { value: 'discount', label: '按折扣价扣除', hint: '已打卡上课/服务按折扣后价格扣除' }, { value: 'duration', label: '按时段卡时长扣除', hint: '按已使用时长占卡时长比例折算扣除' }]} onFee={(value) => props.onChange({ ...refund, periodFeeEnabled: value })} onPercent={(value) => props.onChange({ ...refund, periodFeePercent: value })} onMode={(value) => props.onChange({ ...refund, periodDeductMode: value })} /> },
      { key: 'stored', label: '储值卡', children: <RefundRuleFields feeEnabled={refund.storedFeeEnabled} feePercent={refund.storedFeePercent} deductMode={refund.storedDeductMode} options={[{ value: 'original', label: '按上课或服务原价扣除', hint: '已打卡上课/服务按原价从可退金额中扣除' }, { value: 'discount', label: '按折扣价扣除', hint: '已打卡上课/服务按折扣后价格扣除' }]} onFee={(value) => props.onChange({ ...refund, storedFeeEnabled: value })} onPercent={(value) => props.onChange({ ...refund, storedFeePercent: value })} onMode={(value) => props.onChange({ ...refund, storedDeductMode: value })} /> },
    ]} />
    <div className="refund-save-row"><Button type="primary" disabled={refundConfig(refund) === props.saved} onClick={async () => {
      if (refundConfig(refund) === props.saved) return
      const next = refundConfig(refund)
      await postJson(`/campus-staff/${props.campusId}/settings`, { refundSettingsConfig: next })
      props.onSaved(next); message.success('保存成功')
    }}>{refundConfig(refund) === props.saved ? '已保存' : '保存退费设置'}</Button></div>
  </section>
}
