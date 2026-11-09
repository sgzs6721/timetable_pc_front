import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { typescriptLoader } from './load-typescript.mjs'

const root = resolve(import.meta.dirname, '..')
const noop = () => {}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : []
}

// Run the real page's effects with deferred responses to reproduce out-of-order requests.
function setup(t) {
  const slots = [], effects = [], timers = new Map(), requests = []
  let cursor = 0, dirty = true, tree, serial = 0
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useRef(initial) { const index = cursor++; slots[index] ||= { current: initial }; return slots[index] },
    useEffect(callback, deps) {
      const index = cursor++, prior = slots[index]
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
        slots[index] = { deps, cleanup: prior?.cleanup }
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback() })
      }
    },
  }
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout(fn) { timers.set(++serial, fn); return serial }, clearTimeout(id) { timers.delete(id) } }
  t.after(() => { globalThis.window = originalWindow })
  const shell = { campusId: 1, currentOrgId: 1, user: { role: 'owner' }, organizations: [{ id: 1 }] }
  const boundary = (name, fields = {}) => Object.assign(() => null, { displayName: name, ...fields })
  const Form = boundary('Form', { Item: 'form-item' })
  const Input = boundary('Input')
  const Table = boundary('Table')
  const load = typescriptLoader({
    react: hooks,
    'react-router-dom': { useNavigate: () => noop },
    antd: { Button: 'button', Form, Input, InputNumber: 'number', Modal: 'modal', Popconfirm: 'confirm', Select: 'select', Space: 'space', Switch: 'switch', Table, message: { error: noop, warning: noop, success: noop } },
    [resolve(root, 'src/pages/kit.tsx')]: { useShell: () => shell, NeedCampus: 'campus', PageHead: 'head', tell: (e) => e.message, money: String, genderText: String },
    [resolve(root, 'src/api/biz.ts')]: { getJson: (path, query) => {
      if (path === '/student-groups/page') return new Promise((resolve, reject) => requests.push({ path, query, resolve, reject }))
      if (path.startsWith('/campus-teacher/')) return Promise.resolve([])
      return Promise.resolve({ visibleInList: true })
    } },
  })
  const { CoursesPage } = load(resolve(root, 'src/pages/CoursesPage.tsx'))
  async function render() {
    for (let i = 0; i < 10; i++) {
      if (dirty) {
        dirty = false; cursor = 0; tree = CoursesPage()
        for (const effect of effects.splice(0)) effect()
      }
      await Promise.resolve()
    }
  }
  return {
    requests, render,
    async runTimers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn() }; await render() },
    table: () => nodes(tree).find((node) => node.type === Table).props,
    search(value) { nodes(tree).find((node) => node.type === Input).props.onChange({ target: { value } }) },
    campus(value) { shell.campusId = value; dirty = true },
    counts: () => nodes(tree).filter((node) => node.type === 'strong').map((node) => node.props.children),
    text: () => nodes(tree).flatMap((node) => typeof node.props.children === 'string' ? [node.props.children] : []).join(' '),
  }
}
const response = (id, total = 45) => ({ records: [{ id, name: `课程${id}` }], total, campusCourseCount: 45, campusOneToOneCourseCount: 5, campusOtherCourseCount: 40 })

test('课程页的旧搜索响应不能覆盖新搜索，分页请求和全校总数分别维护', async (t) => {
  const h = setup(t)
  await h.render(); await h.runTimers()
  h.requests[0].resolve(response(1)); await h.render()
  h.table().pagination.onChange(2); await h.render(); await h.runTimers()
  assert.equal(h.requests[1].query.offset, 20)
  h.search('新课程'); await h.render(); await h.runTimers()
  const latest = h.requests[2]
  assert.equal(latest.query.offset, 0)
  assert.equal(latest.query.keyword, '新课程')
  latest.resolve(response(45, 1)); await h.render()
  h.requests[1].resolve(response(21)); await h.render()
  assert.deepEqual(h.table().dataSource.map((row) => row.id), [45])
  assert.equal(h.table().pagination.total, 1)
  assert.deepEqual(h.counts(), [45, 5, 40])
})

test('切换校区会清空课程并忽略前一个校区的迟到结果或失败', async (t) => {
  const h = setup(t)
  await h.render(); await h.runTimers()
  h.campus(2); await h.render(); await h.runTimers()
  assert.equal(h.requests[1].query.campusId, 2)
  assert.deepEqual(h.table().dataSource, [])
  h.requests[1].resolve(response(22)); await h.render()
  h.requests[0].reject(new Error('过期请求失败')); await h.render()
  assert.deepEqual(h.table().dataSource.map((row) => row.id), [22])
  assert.equal(h.text().includes('过期请求失败'), false)
})

test('删除后末页失效会自动补发上一页请求，不停在空白末页', async (t) => {
  const h = setup(t)
  await h.render(); await h.runTimers()
  h.requests[0].resolve(response(1, 41)); await h.render()
  h.table().pagination.onChange(3); await h.render(); await h.runTimers()
  h.requests[1].resolve({ ...response(0, 40), records: [] }); await h.render(); await h.runTimers()
  assert.equal(h.requests[2].query.offset, 20)
  h.requests[2].resolve(response(21, 40)); await h.render()
  assert.equal(h.table().pagination.current, 2)
  assert.deepEqual(h.table().dataSource.map((row) => row.id), [21])
})
