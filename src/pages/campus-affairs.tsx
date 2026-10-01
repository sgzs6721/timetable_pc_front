import { BoldOutlined, ClearOutlined, OrderedListOutlined, RedoOutlined, UndoOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tooltip, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { clampDecimalInput, tell } from './kit'

export function CampusAffairs({ campusId, section = 'all' }: { campusId: number | null; section?: 'all' | 'rules' | 'rewards' }) {
  const [rules, setRules] = useState('')
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [savingRules, setSavingRules] = useState(false)

  async function load() {
    if (!campusId) return
    const settings = await getJson<{ dailyRulesText?: string }>(`/campus-staff/${campusId}/settings`)
    setRules(normalizeRulesHtml(settings?.dailyRulesText || ''))
    setItems(await getJson(`/campus-staff/${campusId}/reward-penalty-items`))
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '校务设置加载失败')))
  }, [campusId])

  if (!campusId) return <p>请先选择校区</p>
  return (
    <>
      {section !== 'rewards' ? <section className="work-card">
        <header className="campus-affairs-card-head">
          <div className="campus-affairs-card-title">
            <h2>规章制度</h2>
            <span>制度内容会展示在日常管理页</span>
          </div>
        </header>
        <RulesEditor value={rules} onChange={setRules} />
        <Button
          className="rules-editor-save"
          type="primary"
          loading={savingRules}
          onClick={async () => {
            setSavingRules(true)
            try {
              await postJson(`/campus-staff/${campusId}/settings`, { dailyRulesText: sanitizeRulesHtml(rules) })
              message.success('制度已保存')
            } catch (error) {
              message.error(tell(error, '保存失败'))
            } finally {
              setSavingRules(false)
            }
          }}
        >{savingRules ? '保存中...' : '保存制度'}</Button>
      </section> : null}
      {section !== 'rules' ? <section className="work-card">
        <header className="campus-affairs-card-head">
          <div className="campus-affairs-card-title">
            <h2>奖惩项设置</h2>
            <span>常用奖惩项，录入时自动带出金额</span>
          </div>
          <Button type="primary" onClick={() => setCreating(true)}>新建奖惩项</Button>
        </header>
        {!items.length ? <><p>未设置奖惩项</p><p>先补充常用的奖励与处罚项，录入奖惩记录时就能直接带出默认金额。</p></> : null}
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '名称', render: (_: unknown, row: Record<string, unknown>) => String(row.itemName || '未命名奖惩项') },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => row.itemType === 'penalty' ? '处罚' : '奖励' },
            { title: '默认金额', dataIndex: 'defaultAmount' },
            { title: '启用', render: (_: unknown, row: Record<string, unknown>) => Number(row.enabled) === 0 ? '停用' : '启用' },
            { title: '说明', dataIndex: 'description' },
            { title: '操作', render: (_: unknown, row: Record<string, unknown>) => <Space>
              <Button type="link" onClick={() => setEditing(row)}>编辑</Button>
              <Popconfirm title="确认删除" description={`确定删除“${String(row.itemName || '该奖惩项')}”吗？`} onConfirm={async () => {
                try {
                  await delJson(`/campus-staff/${campusId}/reward-penalty-items/${row.id}`)
                  message.success('奖惩项已删除')
                  await load()
                } catch (error) { message.error(tell(error, '删除失败')) }
              }}><Button type="link" danger>删除</Button></Popconfirm>
            </Space> },
          ]}
        />
      </section> : null}
      {section !== 'rules' ? <Modal title="新建奖惩项" open={creating} onCancel={() => setCreating(false)} footer={null} destroyOnHidden>
        <Form
          layout="vertical"
          initialValues={{ itemType: 'reward', enabled: true }}
          onFinish={async (values: { itemName: string; itemType: string; defaultAmount?: number; description?: string; enabled?: boolean }) => {
            const error = rewardItemError(values, items)
            if (error) {
              message.warning(error)
              return
            }
            try {
              await postJson(`/campus-staff/${campusId}/reward-penalty-items`, {
                itemName: String(values.itemName || '').trim(),
                itemType: values.itemType,
                defaultAmount: values.defaultAmount,
                description: String(values.description || '').trim(),
                enabled: values.enabled === false ? 0 : 1,
              })
              message.success('奖惩项已添加')
              setCreating(false)
              await load()
            } catch (error) {
              message.error(tell(error, '添加失败'))
            }
          }}
        >
          <Form.Item name="itemName" label="名称" rules={[{ required: true, message: '请输入奖惩项名称' }]}><Input placeholder="请输入名称" maxLength={8} /></Form.Item>
          <Form.Item name="itemType" label="类型"><Select options={[{ value: 'reward', label: '奖励' }, { value: 'penalty', label: '处罚' }]} /></Form.Item>
          <Form.Item name="defaultAmount" label="默认金额" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} placeholder="请输入金额" min={0.01} /></Form.Item>
          <Form.Item name="description" label="说明"><Input placeholder="说明这个奖惩项适用于什么场景" maxLength={120} /></Form.Item>
          <Form.Item name="enabled" label={<span>启用此奖惩项 <small className="form-label-note">停用后，日常奖惩录入时将不可选择</small></span>} valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" htmlType="submit">确认保存</Button>
        </Form>
      </Modal> : null}
      {section !== 'rules' ? <Modal title="编辑奖惩项" open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing ? <Form
          layout="vertical"
          initialValues={{ ...editing, enabled: Number(editing.enabled) !== 0 }}
          onFinish={async (values: { itemName: string; itemType: string; defaultAmount?: number; description?: string; enabled?: boolean }) => {
            const error = rewardItemError(values, items, editing)
            if (error) {
              message.warning(error)
              return
            }
            try {
              await putJson(`/campus-staff/${campusId}/reward-penalty-items/${editing.id}`, {
                ...editing,
                itemName: String(values.itemName || '').trim(),
                itemType: values.itemType,
                defaultAmount: values.defaultAmount,
                description: String(values.description || '').trim(),
                enabled: values.enabled === false ? 0 : 1,
              })
              message.success('奖惩项已保存')
              setEditing(null)
              await load()
            } catch (error) { message.error(tell(error, '保存失败')) }
          }}
        >
          <Form.Item name="itemName" label="名称" rules={[{ required: true, message: '请输入奖惩项名称' }]}><Input maxLength={8} /></Form.Item>
          <Form.Item name="itemType" label="类型"><Select options={[{ value: 'reward', label: '奖励' }, { value: 'penalty', label: '处罚' }]} /></Form.Item>
          <Form.Item name="defaultAmount" label="金额" getValueFromEvent={(value) => clampDecimalInput(value)}><InputNumber style={{ width: '100%' }} min={0.01} /></Form.Item>
          <Form.Item name="description" label="说明"><Input maxLength={120} placeholder="说明这个奖惩项适用于什么场景" /></Form.Item>
          <Form.Item name="enabled" label={<span>启用此奖惩项 <small className="form-label-note">停用后，日常奖惩录入时将不可选择</small></span>} valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" htmlType="submit">确认保存</Button>
        </Form> : null}
      </Modal> : null}
    </>
  )
}

function RulesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value
  }, [value])

  function run(command: string, commandValue?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    onChange(editorRef.current?.innerHTML || '')
  }

  function toolbarButton(label: string, command: string, icon?: React.ReactNode, commandValue?: string) {
    return <Tooltip title={label}>
      <Button
        type="text"
        aria-label={label}
        icon={icon}
        onMouseDown={(event) => {
          event.preventDefault()
          run(command, commandValue)
        }}
      >{icon ? null : label}</Button>
    </Tooltip>
  }

  return <div className="rules-editor-shell">
    <div className="rules-editor-toolbar" role="toolbar" aria-label="规章制度编辑工具">
      {toolbarButton('撤销', 'undo', <UndoOutlined />)}
      {toolbarButton('重做', 'redo', <RedoOutlined />)}
      <span className="rules-editor-divider" />
      {toolbarButton('正文', 'formatBlock', undefined, 'p')}
      {toolbarButton('标题', 'formatBlock', undefined, 'h3')}
      {toolbarButton('加粗', 'bold', <BoldOutlined />)}
      {toolbarButton('有序列表', 'insertOrderedList', <OrderedListOutlined />)}
      {toolbarButton('无序列表', 'insertUnorderedList', <UnorderedListOutlined />)}
      {toolbarButton('引用', 'formatBlock', undefined, 'blockquote')}
      <span className="rules-editor-divider" />
      {toolbarButton('清除格式', 'removeFormat', <ClearOutlined />)}
    </div>
    <div
      ref={editorRef}
      className="rules-editor-content"
      contentEditable
      role="textbox"
      aria-multiline="true"
      data-placeholder="输入校区规章制度，例如考勤规范、教学要求、奖惩执行标准等"
      suppressContentEditableWarning
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      onPaste={(event) => {
        event.preventDefault()
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain').slice(0, 2000))
      }}
    />
    <div className="rules-editor-foot">支持标题、重点标记、列表和引用，保存后展示在日常管理页</div>
  </div>
}

function normalizeRulesHtml(value: string): string {
  if (!value.trim()) return ''
  if (/<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|br|strong|b)\b/i.test(value)) return sanitizeRulesHtml(value)
  return value.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean)
    .map((item) => `<p>${escapeRulesText(item)}</p>`).join('')
}

function sanitizeRulesHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return value
  const documentNode = new DOMParser().parseFromString(value, 'text/html')
  const allowed = new Set(['P', 'DIV', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'BR', 'STRONG', 'B'])
  Array.from(documentNode.body.querySelectorAll('*')).forEach((element) => {
    if (!allowed.has(element.tagName)) element.replaceWith(...Array.from(element.childNodes))
    else Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))
  })
  return documentNode.body.innerHTML
}

function escapeRulesText(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char))
}

function rewardAmountError(value: unknown) {
  const amount = Number(value)
  if (value == null || value === '' || !Number.isFinite(amount) || amount <= 0) return '请输入正确金额'
  if (amount > 999999.99) return '金额不能超过999999.99'
  return ''
}

function rewardItemError(values: { itemName?: string; defaultAmount?: number }, items: Array<Record<string, unknown>>, current?: Record<string, unknown> | null) {
  const name = String(values.itemName || '').trim()
  if (!name) return '请输入奖惩项名称'
  if (Array.from(name).length > 8) return '名称最多8个字'
  if (items.some((item) => String(item.itemName || '').trim() === name && String(item.id) !== String(current?.id || ''))) return '奖惩项名称不能重复'
  return rewardAmountError(values.defaultAmount)
}
