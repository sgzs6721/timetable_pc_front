import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { typescriptLoader } from './load-typescript.mjs'

const { salaryRoster, salaryEditPayload } = typescriptLoader()(resolve(import.meta.dirname, '../src/pages/campus-salary-model.ts'))
const items = [
  { id: 1, itemName: '底薪', defaultValue: 3000 },
  { id: 2, itemName: '补贴', defaultValue: 100 },
  { id: 3, itemName: '单价', itemType: 'unit' },
]

test('工资统计区分部分配置、零元、空值与失效项，仅汇总在职人员的固定金额', () => {
  const teachers = [1, 2, 3, 4, 5].map((id) => ({ id, status: [1, null, '0', undefined, 1][id - 1] }))
  const amounts = [[1, '1', '2000'], [1, 2, null], [2, 3, 0], [3, 1, 9000], [4, 4, 100], [4, 1, '  '], [5, 3, 80]]
    .map(([staffId, salaryItemId, amount]) => ({ staffId, salaryItemId, amount }))
  const { rows, configuredCount, columnTotals, fixedGrandTotal } = salaryRoster(teachers, items, amounts)
  assert.deepEqual(rows.map(({ person, settings }) => [person.id, settings.size]), [[1, 1], [2, 1], [4, 0], [5, 1]])
  assert.equal(configuredCount, 3)
  assert.equal(fixedGrandTotal, 2000)
  assert.deepEqual([...columnTotals], [['1', 2000]])
  assert.equal(salaryRoster(teachers, [...items, { id: 5, defaultValue: 900 }], amounts).configuredCount, 3)
})

test('只替换所选人员的有效配置，不用默认值补空项，零元可保存', () => {
  const settings = new Map([['1', 1000]])
  assert.deepEqual(salaryEditPayload(8, items, settings, '3', 0), { staffIds: [8], salaries: [
    { staffId: 8, salaryItemId: 1, salaryItemName: '底薪', amount: 1000 },
    { staffId: 8, salaryItemId: 3, salaryItemName: '单价', amount: 0 },
  ] })
  assert.deepEqual(salaryEditPayload(8, items, settings, 1, null), { staffIds: [8], salaries: [] })
})
