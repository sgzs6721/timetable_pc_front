import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const page = (name) => resolve(root, 'src/pages', name)
const noop = () => {}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : []
}
function runtime() {
  const slots = [], effects = [], requests = [], notices = []
  let cursor = 0, values = {}, tree
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (next) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
    },
    useRef(initial) { const index = cursor++; slots[index] ||= { current: initial }; return slots[index] },
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const index = cursor++, prev = slots[index]
      if (!prev || deps.some((value, i) => !Object.is(value, prev.deps[i]))) {
        slots[index] = { deps }
        effects.push(fn)
      }
    },
  }
  const form = {
    getFieldValue: (key) => values[key],
    setFieldValue: (key, value) => { values[key] = value },
    setFieldsValue: (next) => { values = { ...values, ...next } },
    resetFields: () => { values = {} },
  }
  const Form = Object.assign(() => null, { Item: 'form-item', useForm: () => [form], useWatch: (key) => values[key] })
  const shell = { currentOrgId: 1, campusId: 1, user: { role: 'owner' }, organizations: [{ id: 1 }] }
  const load = typescriptLoader({
    react: hooks,
    antd: { Form, Button: 'button', Input: Object.assign(() => null, { Search: 'search' }), InputNumber: 'number', Modal: 'modal', Popconfirm: 'confirm', Select: 'select', Space: 'space', Switch: 'switch', Table: 'table', message: Object.fromEntries(['success', 'error', 'warning'].map((kind) => [kind, (text) => notices.push(text)])) },
    'react-router-dom': { useSearchParams: () => [new URLSearchParams('timeMode=custom_range&startDate=2026-11-01&endDate=2026-11-08')] },
    [page('kit.tsx')]: { todayIso: () => '2026-11-15', monthKey: () => '2026-11', money: String, tell: (e) => e.message, useShell: () => shell, PageHead: 'page-head', NeedCampus: 'campus' },
    [resolve(root, 'src/api/biz.ts')]: {
      putJson: async (url, data) => requests.push({ method: 'PUT', url, data }),
      getJson: async (url, data) => {
        requests.push({ method: 'GET', url, data })
        return url === '/salary/class-hours' ? { records: [], total: 0, rangeLabel: '旧周期' } : null
      },
    },
    [page('student-quick-checkin.tsx')]: { CheckInCoursePicker: 'course-picker' },
    [resolve(root, 'src/components/BusinessDatePicker.tsx')]: { BusinessDatePicker: 'date-picker', BusinessDateRangePicker: 'range-picker' },
  })
  return {
    load, requests, notices, form, Form,
    async render(component, props) {
      for (let i = 0; i < 6; i++) {
        cursor = 0
        tree = component(props)
        for (const effect of effects.splice(0)) effect()
        await Promise.resolve()
      }
      return tree
    },
    find: (type) => nodes(tree).find((node) => node.type === type),
    all: (type) => nodes(tree).filter((node) => node.type === type),
    async submit() { await nodes(tree).find((node) => node.type === Form).props.onFinish({ ...values }) },
  }
}
const coaches = [{ id: 66, name: '历史老师', status: 0 }, { id: 77, name: '当前课程老师', status: 1 }]
const card = { id: 20, status: 1, cardCategory: 'HOURS', courseCategory: true, studentGroupId: 101, remainingHours: 10 }
const student = { id: 1, name: '小明', cards: [card], remainingHours: 10 }
const payments = [{ id: 501, studentCardId: 20, courseType: '101', courseTypeLabel: '一对一课程', hours: 20, remainingHours: 10 }]
const base = { id: 901, studentCardId: 20, paymentRecordId: 501, courseType: '101', courseName: '一对一课程', consumeDate: '2026-11-08', hours: 1, amount: 120, remark: '原备注' }
function editorProps(record) {
  return { record, student, card, payments, groups: [{ id: 101, name: '一对一课程', coachIds: [77] }], coaches, onSaved: async () => {} }
}

test('无老师课程打卡独立汇总和筛选，保留学员销课；服务与有姓名的历史记录不误标', () => {
  const m = runtime().load(page('student-checkins.tsx'))
  const skipped = { ...base, coachIds: [], coachId: null }
  const regular = { ...base, id: 902, coachIds: [66], coachId: 66, coachName: '历史老师' }
  assert.equal(m.checkInSkipsTeacherHours(skipped, coaches), true)
  assert.equal(m.checkInSkipsTeacherHours({ ...base, coachName: '未分配老师' }, coaches), true)
  assert.equal(m.checkInSkipsTeacherHours(regular, coaches), false)
  assert.equal(m.checkInSkipsTeacherHours({ ...base, coachName: '已离职旧老师' }, coaches), false)
  assert.equal(m.checkInSkipsTeacherHours({ ...skipped, courseType: 'service:501' }, coaches), false)
  const summary = m.checkInSummary([skipped, regular], card, student, false, coaches)
  assert.deepEqual(summary.metrics, [{ label: '上课次数', value: '2' }, { label: '课程数量', value: '1' }])
  const chip = summary.chips.find((item) => item.name === '不计老师课时')
  assert.equal(chip.hoursText, '1课时')
  assert.equal(m.checkInChipKey(skipped, false, coaches), chip.key)
  assert.equal(summary.chips.find((item) => item.name === '历史老师').inactive, true)
})

test('老师 ID 列表、单老师与旧候选老师姓名快照按实际身份回显', () => {
  const m = runtime().load(page('student-checkins.tsx'))
  assert.deepEqual(m.recordCoachIds({ ...base, coachId: 66, coachName: '历史老师、当前课程老师' }, coaches), [66])
  assert.equal(m.checkInCoachIdentity({ ...base, coachId: 66, coachName: '历史老师、当前课程老师' }, coaches).name, '历史老师')
  assert.deepEqual(m.recordCoachIds({ ...base, coachIds: [66, 77, 66] }, coaches), [66, 77])
  assert.equal(m.checkInCoachIdentity({ ...base, coachIds: [66, 77] }, coaches).name, '历史老师、当前课程老师')
  assert.equal(m.checkInSkipsTeacherHours({ ...base, coachIds: [66] }, coaches), false)
  assert.deepEqual(m.recordCoachIds({ ...base, coachName: '历史老师' }, coaches), [66])
})

test('已选老师的同一条记录改为不计课时后，清理失效筛选且显示新标签', async () => {
  const h = runtime(), { CheckInCard } = h.load(page('student-checkins.tsx'))
  const { SkipTeacherHoursTag } = h.load(page('checkin-teacher-hours.tsx'))
  const props = { student, card, payments, groups: [], coaches, financialHidden: false, manage: false, onChanged: async () => {}, rows: [{ ...base, coachId: 66, coachIds: [66], coachName: '历史老师' }] }
  await h.render(CheckInCard, props)
  h.find('button').props.onClick()
  await h.render(CheckInCard, props)
  assert.equal(h.find('button').props.className, 'is-on')
  props.rows = [{ ...base, coachIds: [] }]
  await h.render(CheckInCard, props)
  assert.equal(h.find('button').props.className, '')
  assert.ok(h.find(SkipTeacherHoursTag))
})

test('编辑保留离职历史老师，反复切换不丢选择；开启后提交空老师且保留课时日期备注', async () => {
  const h = runtime(), { CheckEditor } = h.load(page('student-checkins.tsx'))
  const { CheckInTeacherHoursSwitch } = h.load(page('checkin-teacher-hours.tsx'))
  const props = editorProps({ ...base, coachId: 66, coachIds: [66], coachName: '历史老师' })
  await h.render(CheckEditor, props)
  h.find('button').props.onClick()
  await h.render(CheckEditor, props)
  assert.equal(h.find(CheckInTeacherHoursSwitch).props.checked, false)
  assert.deepEqual(h.form.getFieldValue('coachIds'), [66])
  assert.ok(h.find('select').props.options.some((item) => item.value === 66))
  for (const checked of [true, false, true]) {
    h.find(CheckInTeacherHoursSwitch).props.onChange(checked)
    await h.render(CheckEditor, props)
    assert.deepEqual(h.form.getFieldValue('coachIds'), [66])
  }
  await h.submit()
  assert.deepEqual(h.requests.at(-1).data, {
    studentId: 1, studentCardId: 20, coachId: null, coachIds: [], coachName: '', hours: 1,
    paymentRecordId: 501, courseType: '101', consumeItemType: 'STUDENT_GROUP', consumeItemId: 101,
    consumeDate: '2026-11-08', remark: '原备注',
  })
  props.record = { ...base, coachId: null, coachIds: [], coachName: '' }
  await h.render(CheckEditor, props)
  h.find('button').props.onClick()
  await h.render(CheckEditor, props)
  assert.equal(h.find(CheckInTeacherHoursSwitch).props.checked, true)
  assert.deepEqual(h.form.getFieldValue('coachIds'), [])
  await h.submit()
  assert.deepEqual(h.requests.at(-1).data.coachIds, [])
})

test('无老师记录关闭开关后必须手选老师，取消编辑后重新打开恢复保存值', async () => {
  const h = runtime(), { CheckEditor } = h.load(page('student-checkins.tsx'))
  const { CheckInTeacherHoursSwitch } = h.load(page('checkin-teacher-hours.tsx'))
  const props = editorProps({ ...base, coachId: null, coachIds: [] })
  await h.render(CheckEditor, props)
  h.find('button').props.onClick()
  await h.render(CheckEditor, props)
  h.find(CheckInTeacherHoursSwitch).props.onChange(false)
  await h.render(CheckEditor, props)
  await h.submit()
  assert.equal(h.requests.length, 0)
  assert.equal(h.notices.at(-1), '请至少选择一位老师')
  h.form.setFieldValue('coachIds', [77])
  await h.submit()
  assert.equal(h.requests.at(-1).data.coachId, 77)
  assert.equal(h.requests.at(-1).data.coachName, '当前课程老师')
  h.find('modal').props.onCancel()
  h.find('button').props.onClick()
  await h.render(CheckEditor, props)
  assert.deepEqual(h.form.getFieldValue('coachIds'), [])
  assert.equal(h.find(CheckInTeacherHoursSwitch).props.checked, true)
})

test('服务编辑不显示开关，提交不携带老师字段', async () => {
  const h = runtime(), { CheckEditor } = h.load(page('student-checkins.tsx'))
  const { CheckInTeacherHoursSwitch } = h.load(page('checkin-teacher-hours.tsx'))
  const props = editorProps({ ...base, courseType: 'service:501', consumeItemType: 'CAMPUS_SERVICE', consumeItemId: 501, unitPrice: 120 })
  await h.render(CheckEditor, props)
  h.find('button').props.onClick()
  await h.render(CheckEditor, props)
  assert.equal(h.find(CheckInTeacherHoursSwitch), undefined)
  await h.submit()
  const payload = h.requests.at(-1).data
  assert.equal(payload.amount, 120)
  assert.equal(Object.hasOwn(payload, 'coachIds'), false)
  assert.equal(Object.hasOwn(payload, 'coachId'), false)
})

test('课时范围只接受完整有序日期，同步显示范围并重新请求，未完成选择保留旧筛选', async () => {
  const h = runtime(), { HoursPage } = h.load(page('HoursPage.tsx'))
  await h.render(HoursPage)
  const count = () => h.requests.filter((item) => item.url === '/salary/class-hours').length
  const initialCount = count()
  for (const range of [['2026-11-09', ''], ['', ''], ['2026-11-15', '2026-11-01']]) {
    h.find('range-picker').props.onChange(range)
    await h.render(HoursPage)
    assert.equal(count(), initialCount)
    assert.deepEqual(h.find('range-picker').props.value, ['2026-11-01', '2026-11-08'])
  }
  h.find('range-picker').props.onChange(['2026-11-09', '2026-11-15'])
  await h.render(HoursPage)
  assert.equal(count(), initialCount + 1)
  assert.equal(h.requests.findLast((item) => item.url === '/salary/class-hours').data.startDate, '2026-11-09')
  assert.equal(h.requests.findLast((item) => item.url === '/salary/class-hours').data.endDate, '2026-11-15')
  assert.ok(nodes(await h.render(HoursPage)).some((node) => node.props.extra === '2026-11-09 至 2026-11-15'))
})

test('课时列表展示不计老师课时标签，仅打卡不重复标注，服务保持原样', async () => {
  const h = runtime(), { HoursPage } = h.load(page('HoursPage.tsx'))
  const { SkipTeacherHoursTag } = h.load(page('checkin-teacher-hours.tsx'))
  await h.render(HoursPage)
  const columns = h.find('table').props.columns
  const course = columns.find((item) => item.title === '课程')
  const row = { recordType: 'consumption', teacherName: '', hours: 1, courseName: '一对一课程' }
  assert.ok(nodes(course.render(null, row)).some((node) => node.type === SkipTeacherHoursTag))
  assert.equal(columns.find((item) => item.title === '老师').render(null, row), '')
  for (const extra of [{ checkInOnly: true }, { teacherName: '历史老师' }, { courseType: 'service:501' }]) {
    assert.equal(nodes(course.render(null, { ...row, ...extra })).some((node) => node.type === SkipTeacherHoursTag), false)
  }
})
