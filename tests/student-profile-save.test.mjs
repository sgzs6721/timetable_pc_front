import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const source = (name) => resolve(root, 'src/pages', name)
const noop = () => {}
const boundary = () => null
const Form = Object.assign(boundary, { Item: 'form-item' })
const Input = Object.assign(boundary, { TextArea: 'textarea' })
const student = {
  id: 99, name: '测试学员', gender: 1, phone: '', birthDate: '2018-03-17', remark: '备注', status: 1,
  campusId: 3, cardCategory: 'PERIOD', periodType: 'YEAR', courseCategory: true,
  oneToOne: false, coachMemberIds: [7], studentGroupIds: [101],
  cards: [
    { id: 201, cardCategory: 'PERIOD', periodType: 'MONTH', periodTypeEditable: false, courseCategory: true,
      studentGroupId: 101, coachMemberIds: [7], serviceItemIds: [] },
    { id: 202, cardCategory: 'STORED_VALUE', courseCategory: false, serviceItemIds: [12],
      serviceRights: [{ courseType: 'service:12', discount: 1, unitPrice: 0.2 }] },
  ],
}
const profileValues = { name: student.name, gender: student.gender, phone: student.phone, birthDate: student.birthDate, remark: student.remark }

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!React.isValidElement(node)) return []
  return [node, ...nodes(node.props.children), ...(node.props.items || []).flatMap((item) => nodes(item.children))]
}

function setup(current = structuredClone(student), editingCard) {
  const requests = []
  const notices = []
  const refreshed = []
  const load = typescriptLoader({
    react: { ...React, useState: (value) => [editingCard && value === null ? editingCard : typeof value === 'function' ? value() : value, noop], useEffect: noop },
    antd: { Button: 'button', Form, Input, Modal: 'modal', Popconfirm: 'popconfirm', Space: 'space', Switch: 'switch', Tabs: 'tabs',
      message: Object.fromEntries(['warning', 'success', 'error'].map((kind) => [kind, (text) => notices.push([kind, text])])) },
    [resolve(root, 'src/api/biz.ts')]: {
      putJson: async (url, data) => {
        requests.push({ url, data })
        if (url === '/students/99' && data.periodType != null && data.periodType !== current.periodType) {
          throw new Error('时段卡已有缴费记录，不能修改卡类型')
        }
      },
    },
    [source('student-payment-editor.tsx')]: { PaymentEditor: boundary },
    [source('student-payments.tsx')]: { TeacherPaymentList: boundary },
    [source('student-payment-history.tsx')]: { StudentPaymentHistory: boundary },
    [source('student-checkins.tsx')]: { CheckInPanel: boundary },
    [source('student-fees.tsx')]: { FeeItems: boundary },
    [source('student-campus-transfer.tsx')]: { CampusTransfer: boundary },
    [resolve(root, 'src/components/BusinessDatePicker.tsx')]: { BusinessDatePicker: boundary },
  })
  const { StudentDetail } = load(source('student-detail.tsx'))
  const props = { student: current, coaches: [{ id: 7, name: '老师' }], groups: [{ id: 101, name: '课程', coachIds: [7] }],
    campuses: [], services: [], payments: [], checks: [], feeItems: [], orders: [], parentPaidIds: [], manage: true,
    onChanged: async () => refreshed.push('detail'), reloadList: () => refreshed.push('list') }
  const tree = StudentDetail(props)
  const form = nodes(tree).find((node) => node.type === Form && node.props.className === 'student-profile-form')
  assert.ok(form)
  return { form, requests, notices, refreshed, props, load }
}

test('编辑资料仅回填基础字段，不把整份学员及卡片详情放入表单', () => {
  assert.deepEqual(setup().form.props.initialValues, profileValues)
})

test('多卡学员只补电话只发送资料请求，即使表单夹带旧卡字段也不会触发改卡校验', async () => {
  const { form, requests, notices, refreshed } = setup()
  const values = { ...structuredClone(student), periodType: 'MONTH', phone: ' 13800138000 ' }
  const before = structuredClone(values)
  await form.props.onFinish(values)
  assert.deepEqual(notices, [['success', '资料已保存']])
  assert.deepEqual(requests, [{ url: '/students/99', data: { ...profileValues, phone: '13800138000', clearBirthDate: false } }])
  assert.deepEqual(refreshed, ['detail', 'list'])
  assert.deepEqual(values, before, '不能修改表单对象或卡片详情')
})

test('历史卡配置缺失、时段类型为空也不妨碍修改电话', async () => {
  const current = { ...student, periodType: undefined, cards: [{ id: 201, cardCategory: 'PERIOD', periodTypeEditable: false }] }
  const { form, requests, notices } = setup(current)
  await form.props.onFinish({ ...current, periodType: 'MONTH', phone: '13800138000' })
  assert.deepEqual(notices, [['success', '资料已保存']])
  assert.equal(requests.length, 1)
  for (const field of ['cards', 'cardCategory', 'periodType', 'courseCategory', 'coachMemberIds', 'studentGroupIds', 'oneToOne', 'status', 'campusId', 'id']) {
    assert.equal(Object.hasOwn(requests[0].data, field), false, `基础资料不能提交 ${field}`)
  }
})

test('基础资料仍保存姓名、性别、备注与生日，并支持清空电话和生日', async () => {
  const { form, requests } = setup({ ...student, phone: '13800138000' })
  await form.props.onFinish({ name: ' 小明 ', gender: 2, phone: '', birthDate: '', remark: ' 新备注 ' })
  assert.deepEqual(requests, [{ url: '/students/99', data: {
    name: '小明', gender: 2, phone: '', birthDate: undefined, clearBirthDate: true, remark: '新备注',
  } }])
})

test('资料未改动、电话不合法或学员已结业时不提交', async () => {
  for (const [current, values, warning] of [
    [student, profileValues, ''],
    [student, { ...profileValues, phone: '123' }, '请输入11位正确手机号'],
    [{ ...student, status: 2 }, { ...profileValues, phone: '13800138000' }, '该学员已结业，不能编辑信息'],
  ]) {
    const { form, requests, notices } = setup(current)
    await form.props.onFinish(values)
    assert.deepEqual(requests, [])
    assert.deepEqual(notices, warning ? [['warning', warning]] : [])
  }
})

test('卡片编辑仍拦截已缴费时段卡改类型，未改动的卡不提交', async () => {
  const card = student.cards[0]
  const { load, props, requests, notices } = setup(student, card)
  const { CardDesk } = load(source('student-card-desk.tsx'))
  const form = nodes(CardDesk(props)).find((node) => node.type === Form)
  assert.ok(form)
  await form.props.onFinish(form.props.initialValues)
  assert.deepEqual(requests, [])
  assert.deepEqual(notices, [])
  await form.props.onFinish({ ...form.props.initialValues, periodType: 'YEAR' })
  assert.deepEqual(requests, [])
  assert.deepEqual(notices, [['warning', '时段卡已有缴费记录，不能修改卡类型']])
})

test('未缴费卡修改时段仍提交到独立卡接口', async () => {
  const card = { ...student.cards[0], periodTypeEditable: true }
  const { load, props, requests, notices } = setup(student, card)
  const { CardDesk } = load(source('student-card-desk.tsx'))
  const form = nodes(CardDesk(props)).find((node) => node.type === Form)
  await form.props.onFinish({ ...form.props.initialValues, periodType: 'YEAR' })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/student-cards/201')
  assert.equal(requests[0].data.periodType, 'YEAR')
  assert.deepEqual(notices, [['success', '课时卡已更新']])
})
