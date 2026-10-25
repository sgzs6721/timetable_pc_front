import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const source = (name) => resolve(root, 'src/pages', name)
const requests = []
const noop = () => {}
const boundary = () => null
const Form = Object.assign(boundary, { Item: 'form-item' })
const Input = Object.assign(boundary, { TextArea: 'textarea' })
const stubs = {
  react: { ...React, useState: (value) => [typeof value === 'function' ? value() : value, noop], useEffect: noop },
  antd: { Button: 'button', Form, Input, Modal: 'modal', Popconfirm: 'popconfirm', Space: 'space', Switch: 'switch', Tabs: 'tabs', message: { warning: noop } },
  [resolve(root, 'src/api/biz.ts')]: { putJson: async (...args) => { requests.push(args) } },
  [source('student-card-desk.tsx')]: { CardDesk: boundary },
  [source('student-profile.tsx')]: {
    campusProfile: () => ({}), createdAtText: () => '', detailTabKey: () => 'basic',
    BirthDateItem: boundary, PhoneActions: boundary, ProfileSaveButton: boundary,
  },
  [source('student-payment-editor.tsx')]: { PaymentEditor: boundary },
  [source('student-checkins.tsx')]: {
    CheckInPanel: boundary, checkInHoursText: String, checkInAmountText: String,
    chronologicalSortKey: (date, time, id) => `${date || time || ''}-${id}`,
  },
  [source('student-fees.tsx')]: { FeeItems: boundary },
  [source('student-transfer-record-editor.tsx')]: { TransferRecordEditor: boundary },
  [resolve(root, 'src/components/BusinessDatePicker.tsx')]: { BusinessDatePicker: boundary },
}
const kit = typescriptLoader(stubs)(source('kit.tsx'))
const load = typescriptLoader({ ...stubs, [source('kit.tsx')]: { ...kit, todayIso: () => '2026-10-25' } })
const rights = load(source('student-period-entitlement.ts'))
const domain = load(source('students-domain.tsx'))
const { StudentDetail } = load(source('student-detail.tsx'))
const { StudentPaymentHistory } = load(source('student-payment-history.tsx'))
const { paymentValidityCell } = load(source('student-payments.tsx'))
const { periodTransferable, suggestedTransferAmount } = load(source('student-campus-transfer.tsx'))
const mini = createRequire(import.meta.url)(resolve(root, '../timetable_miniapp1/miniprogram/utils/period-entitlement.js'))

const period = {
  id: 11, cardCategory: 'PERIOD', periodType: 'MONTH', courseCategory: true,
  studentGroupId: 7, coachMemberIds: [8], coachMemberNames: ['陈老师'],
  validStartDate: '2026-10-25', validEndDate: '2026-11-24',
  remainingAmount: 0, fullyTransferred: true, transferOutDate: '2026-10-25',
}
const student = { id: 1, name: '测试学员', cardCategory: 'PERIOD', status: 1, coachMemberIds: [8], cards: [period] }
const funding = { id: 101, type: 'renew', studentCardId: 11, amount: 5060, paymentDate: '2026-10-25', validStartDate: '2026-10-25', validEndDate: '2026-11-24' }
const outgoing = { id: 102, type: 'adjustment', adjustmentReason: 'transfer', transferDirection: 'out', studentCardId: 11, mainRecordId: 101, amount: 5060, paymentDate: '2026-10-25', validStartDate: '2026-10-25', validEndDate: '2026-11-24' }
const renewed = { ...funding, id: 103, paymentDate: '2026-10-26' }
const coaches = [{ id: 8, name: '陈老师' }, { id: 9, name: '王老师' }]
const groups = [{ id: 7, coachIds: [8] }]

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!React.isValidElement(node)) return []
  return [node, ...nodes(node.props.children), ...(node.props.items || []).flatMap((item) => nodes(item.children))]
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return React.isValidElement(node) ? text(node.props.children) : ''
}
function detail(current = student) {
  return StudentDetail({ student: current, coaches, groups, campuses: [], services: [], payments: [], checks: [],
    feeItems: [], orders: [], parentPaidIds: [], manage: true, onCheckIn: () => { throw new Error('不应打开打卡') } })
}

test('已转出卡即使还带着旧日期或按天折算余款，也不能打卡、分配老师或重复转出', async () => {
  for (const amount of [0, 300]) {
    const card = { ...period, remainingAmount: amount }
    assert.equal(domain.checkInCardEligible(card, student, true), false)
    assert.equal(domain.checkInBlockReason(student, card), '时段卡权益已转出，不能打卡')
    assert.equal(domain.isCoachAssignmentDisabled(student, card, groups), true)
    assert.equal(domain.assignBlock(student, groups, coaches, card), '时段卡权益已转出，不能调整老师')
    assert.equal(domain.listCardEffective(card, student), false)
    assert.equal(periodTransferable(card, [outgoing, funding]), false)
    assert.equal(suggestedTransferAmount(card, [outgoing, funding]), 0)
  }
  requests.length = 0
  await assert.rejects(domain.saveActiveCardCoaches(student, period, [9]), /已转出/)
  assert.deepEqual(requests, [])
  assert.equal(domain.canArchiveStudent(student), true)
  assert.equal(kit.studentStatusText(student), '已转出')
  assert.deepEqual(domain.cardValidityLine(period), { label: '转出日期', text: '2026-10-25' })
  assert.deepEqual(domain.cardBalanceView(period), { value: '2026-10-25 转出', tag: '月卡', metric: '已转出' })
})

test('详情隐藏分配老师和移除入口，保留老师名字，不增加只读说明；打卡按钮不可触发', () => {
  const tree = detail()
  assert.equal(nodes(tree).some((node) => node.props.className === 'student-coach-assign-link'), false)
  const actionBar = nodes(tree).find((node) => node.props.className === 'student-detail-quick-actions')
  const buttons = nodes(actionBar).filter((node) => node.type === 'button')
  assert.deepEqual(buttons.map(text), ['编辑信息', '缴费', '打卡'])
  assert.equal(buttons[2].props.disabled, true)
  buttons[2].props.onClick()
  const assigned = domain.AssignedCoaches({ student, card: period, coaches, groups, onChanged: async () => {} })
  assert.match(text(assigned), /陈老师/)
  assert.doesNotMatch(text(assigned), /仅供查看|权益已转出/)
  assert.equal(nodes(assigned).filter((node) => node.type === 'button').length, 0)
})

test('多卡按当前卡控制操作，另一张有效卡保持在学、可打卡且不能归档', () => {
  const active = { ...period, id: 12, fullyTransferred: false, transferOutDate: undefined }
  const multiple = { ...student, cards: [period, active] }
  assert.equal(kit.studentStatusText(multiple), '在学')
  assert.equal(domain.canArchiveStudent(multiple), false)
  assert.equal(domain.listDisplayCard(multiple).id, active.id)
  assert.equal(domain.orderedStudentCards(multiple.cards)[0].id, active.id)
  assert.equal(domain.checkInBlockReason(multiple, active), '')
  assert.equal(domain.checkInCardEligible(active, multiple, false), true)
  assert.equal(domain.isCoachAssignmentDisabled(multiple, active, groups), false)
  assert.equal(nodes(detail(multiple)).some((node) => node.props.className === 'student-coach-assign-link'), true)
})

test('续费和零元赠卡保留有效权益，新建零课时学员仍可先分配老师再缴费', async () => {
  const active = { ...period, fullyTransferred: false, transferOutDate: undefined }
  const paid = { ...student, cards: [active] }
  assert.equal(domain.checkInCardEligible(active, paid, true), true)
  assert.equal(domain.canArchiveStudent(paid), false)
  requests.length = 0
  await domain.saveActiveCardCoaches(paid, active, [9])
  assert.equal(requests[0][0], '/student-cards/11')
  assert.deepEqual(requests[0][1].coachMemberIds, [9])
  const unpaid = { id: 13, cardCategory: 'HOURS', remainingHours: 0, coachMemberIds: [] }
  assert.equal(domain.isCoachAssignmentDisabled({ ...student, cards: [unpaid] }, unpaid, groups), false)
  assert.equal(domain.checkInCardEligible(unpaid, student, false), false)
  assert.equal(kit.studentStatusText({ ...student, status: 2 }), '结业')
})

const ledgerCases = [
  ['完整转出', [funding, outgoing]],
  ['按日折算余款', [funding, { ...outgoing, amount: 4000 }]],
  ['转出后同日续费', [funding, outgoing, renewed]],
  ['零元赠卡', [{ ...funding, amount: 0 }]],
  ['删除转出恢复权益', [funding, { ...outgoing, deleted: 1 }]],
  ['转入权益可用', [{ ...funding, type: 'adjustment', adjustmentReason: 'transfer', transferDirection: 'in' }]],
  ['旧版跨校区转出', [funding, { ...outgoing, mainRecordId: undefined }]],
  ['其他卡不受影响', [funding, { ...outgoing, mainRecordId: undefined, studentCardId: 22 }]],
  ['分组与重复流水去重', [{ ...funding, supplements: [outgoing] }, outgoing]],
  ['未绑定卡的历史批次', [{ ...funding, studentCardId: undefined }, outgoing]],
]
for (const [name, records] of ledgerCases) test(`与小程序运行时一致：${name}`, () => {
  assert.deepEqual(rights.resolvePeriodEntitlement(records), mini.resolvePeriodEntitlement(records))
})

test('缴费历史保留原有效期，显示已转出和转出日期，后续新批次不继承旧转出状态', () => {
  const grouped = { ...funding, supplements: [outgoing] }
  assert.deepEqual(paymentValidityCell(grouped, period, student, 'main'), { text: '已转出 · 2026-10-25', tone: '' })
  assert.deepEqual(paymentValidityCell(outgoing, period, student, 'child'), { text: '转出日期：2026-10-25', tone: '' })
  assert.doesNotMatch(paymentValidityCell(renewed, period, student, 'main').text, /已转出/)
  const history = StudentPaymentHistory({ student, rows: [outgoing, funding], parentPaidIds: [], manage: false })
  const tabs = nodes(history).find((node) => node.type === domain.CardRecordTabs)
  const page = tabs.props.children([outgoing, funding], period)
  const pageTree = page.type(page.props)
  const entry = nodes(pageTree).find((node) => typeof node.type === 'function' && node.type.name === 'PaymentEntry')
  const entryText = text(entry.type(entry.props))
  assert.match(entryText, /原有效期2026-10-25 至 2026-11-24/)
  assert.match(entryText, /已转出 · 2026-10-25/)
  assert.match(entryText, /转出日期：2026-10-25/)
})

test('跨校区转移只取仍拥有的批次，旧转出记录与金额不能变成可转权益', () => {
  const legacyCard = { ...period, fullyTransferred: undefined }
  assert.equal(periodTransferable(legacyCard, [outgoing, funding]), false)
  assert.equal(suggestedTransferAmount(legacyCard, [outgoing, funding]), 0)
  const newFunding = { ...renewed, amount: 2000 }
  assert.equal(periodTransferable(legacyCard, [newFunding, outgoing, funding]), true)
  assert.equal(suggestedTransferAmount(legacyCard, [newFunding, outgoing, funding]), 2000)
})

for (const transferred of [true, false]) test(`快捷打卡刷新权益：${transferred ? '转出后关闭，不自动改用其他卡' : '当前有效卡正常打开'}`, async () => {
  const effects = []
  const states = []
  const warnings = []
  let closed = false
  const selected = { ...period, fullyTransferred: transferred }
  const latest = { ...student, cards: [selected, { ...period, id: 12, fullyTransferred: false }] }
  const runtime = typescriptLoader({
    ...stubs,
    react: { ...stubs.react,
      useState: (value) => [typeof value === 'function' ? value() : value, (next) => states.push(next)],
      useEffect: (effect) => effects.push(effect), useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
    },
    antd: { ...stubs.antd, Form: { useForm: () => [{}], useWatch: noop }, message: { warning: (value) => warnings.push(value) } },
    [source('kit.tsx')]: { ...kit, todayIso: () => '2026-10-25' },
    [source('student-card-desk.tsx')]: { buildCheckInCoachSelection: () => ({ options: [], defaultIds: [], maxCount: 1 }) },
    [resolve(root, 'src/api/biz.ts')]: { getJson: async (url) => url === '/students/1' ? latest : [] },
  })
  const { QuickCheckIn } = runtime(source('student-quick-checkin.tsx'))
  QuickCheckIn({ student, preferredCardId: 11, cardSelectionLocked: true, groups, coaches, services: [], onClose: () => { closed = true } })
  effects[0]()
  await new Promise(setImmediate)
  assert.equal(closed, transferred)
  assert.deepEqual(warnings, transferred ? ['时段卡权益已转出，不能打卡'] : [])
  const loaded = states.find((value) => value?.cards)
  assert.equal(!!loaded, !transferred)
  if (loaded) assert.equal(loaded.cards[0].id, 11)
})
