import { Alert, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { FormInstance } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { delJson, downloadFile, getJson, postJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { copyPlainText, money, tell } from './kit'
import { PLAY_TYPES, SIGNUP_MODES, STATUS_COLOR, STATUS_TEXT, enumText, type CampaignDto, type CampaignSession, type Enrollment, type JsonMap, type SettlementCampaign } from './marketing-model'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function CampaignDetailDrawer(props: {
  open: boolean
  dto: CampaignDto | null
  campusId: number
  onClose: () => void
  onEdit: () => void
  onAction: (item: CampaignDto, action: 'publish' | 'pause' | 'end') => Promise<void>
  onReload: () => Promise<void>
}) {
  const id = props.dto?.campaign?.id || 0
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<JsonMap>({})
  const [ranking, setRanking] = useState<JsonMap[]>([])
  const [sessions, setSessions] = useState<CampaignSession[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [enrollmentTotal, setEnrollmentTotal] = useState(0)
  const [enrollmentPage, setEnrollmentPage] = useState(1)
  const [filters, setFilters] = useState({ keyword: '', enrollStatus: '', customerType: '' })
  const [rewards, setRewards] = useState<JsonMap[]>([])
  const [rewardStatus, setRewardStatus] = useState('PENDING')
  const [sessionEdit, setSessionEdit] = useState<CampaignSession | null | undefined>(undefined)
  const [sessionForm] = Form.useForm()

  const loadDetailData = useCallback(async () => {
    if (!props.open || !id) return
    setLoading(true)
    try {
      const [statsData, rankData, sessionData, rewardData] = await Promise.all([
        getJson<JsonMap>(`/marketing/campaigns/${id}/stats`, { campusId: props.campusId }).catch(() => ({})),
        getJson<JsonMap[]>(`/marketing/campaigns/${id}/referral-ranking`, { campusId: props.campusId }).catch(() => []),
        getJson<CampaignSession[]>(`/marketing/campaigns/${id}/sessions`, { campusId: props.campusId }).catch(() => []),
        getJson<JsonMap[]>(`/marketing/campaigns/${id}/rewards`, { campusId: props.campusId }).catch(() => []),
      ])
      setStats(statsData)
      setRanking(rankData)
      setSessions(sessionData)
      setRewards(rewardData)
    } finally { setLoading(false) }
  }, [id, props.campusId, props.open])

  async function loadEnrollments(page = enrollmentPage, selectedFilters = filters) {
    if (!props.open || !id) return
    const data = await getJson<{ records?: Enrollment[]; total?: number }>(`/marketing/campaigns/${id}/enrollments`, {
      campusId: props.campusId, ...selectedFilters, page, pageSize: 20,
    })
    setEnrollments(data.records || [])
    setEnrollmentTotal(Number(data.total || 0))
    setEnrollmentPage(page)
  }

  useEffect(() => {
    if (!props.open) return
    const initialFilters = { keyword: '', enrollStatus: '', customerType: '' }
    setTab('overview')
    setRewardStatus('PENDING')
    setFilters(initialFilters)
    void loadDetailData()
    void loadEnrollments(1, initialFilters)
  }, [props.open, id, loadDetailData])

  const campaign = props.dto?.campaign
  const content = props.dto?.content
  const status = props.dto?.displayStatus || campaign?.status || ''
  const sessionEditable = campaign?.status !== 'ENDED'

  function openSession(row?: CampaignSession) {
    sessionForm.resetFields()
    if (row) {
      setSessionEdit(row)
      sessionForm.setFieldsValue({ ...row, startTime: row.startTime?.slice(0, 5), endTime: row.endTime?.slice(0, 5) })
      return
    }
    setSessionEdit(null)
    sessionForm.setFieldsValue({ status: 'OPEN', quotaTotal: 0, sortOrder: sessions.length })
  }

  async function removeSession(row: CampaignSession) {
    try {
      await delJson(`/marketing/campaigns/${id}/sessions/${row.id}`, { campusId: props.campusId })
      message.success('场次已删除')
      await loadDetailData()
    } catch (error) {
      message.error(tell(error, '场次删除失败'))
    }
  }

  async function closeSession(row: CampaignSession) {
    try {
      await postJson(`/marketing/campaigns/${id}/sessions?campusId=${props.campusId}`, { ...row, status: 'CLOSED' })
      message.success('场次已关闭')
      await loadDetailData()
    } catch (error) {
      message.error(tell(error, '场次关闭失败'))
    }
  }

  function mutateReward(row: JsonMap, action: 'grant' | 'offline' | 'void') {
    let value = ''
    const copy = {
      grant: { title: row.status === 'REFUNDING' ? '重试微信退款' : '确认发放奖励', tip: '付费活动的立减奖励会原路退回推广人微信，金额从机构营销入账中扣除；其他奖励只记录已发放。', placeholder: '发放备注（选填）', ok: '确认发放' },
      offline: { title: '线下已兑现', tip: '只记录已发放，不发起微信退款。请确认已线下把奖励给到家长。', placeholder: '备注，如：现金已退 100 元', ok: '确认' },
      void: { title: '确认作废奖励', tip: '', placeholder: '请输入作废原因', ok: '确认作废' },
    }[action]
    Modal.confirm({
      title: copy.title,
      content: <Space direction="vertical" style={{ width: '100%' }}>{copy.tip ? <span>{copy.tip}</span> : null}<Input.TextArea placeholder={copy.placeholder} onChange={(event) => { value = event.target.value }} /></Space>,
      okText: copy.ok,
      okButtonProps: { danger: action === 'void' },
      onOk: async () => {
        if (action === 'void' && !value.trim()) {
          message.warning('请填写作废原因')
          return Promise.reject()
        }
        try {
          if (action === 'void') {
            await postJson(`/marketing/rewards/${row.id}/void?campusId=${props.campusId}`, { reason: value })
          } else {
            await postJson(`/marketing/rewards/${row.id}/grant?campusId=${props.campusId}`, { remark: value, offline: action === 'offline' ? 'true' : 'false' })
          }
          message.success(action === 'void' ? '奖励已作废' : '奖励已发放')
        } catch (error) {
          Modal.warning({ title: '操作未完成', content: tell(error, '操作失败') })
        }
        await loadDetailData()
      },
    })
  }

  function changeCustomerType(row: Enrollment, next: string) {
    Modal.confirm({
      title: '修改新老客',
      content: `将「${row.studentName || '该学员'}」标记为${next === 'OLD' ? '老客' : '新客'}？`,
      okText: '确认修改',
      cancelText: '取消',
      onOk: async () => {
        await postJson(`/marketing/campaigns/${id}/enrollments/${row.id}/customer-type?campusId=${props.campusId}`, { customerType: next })
        message.success('已更新')
        await loadEnrollments()
      },
    })
  }

  const rewardTabOf = (row: JsonMap) => row.status === 'REFUNDING' ? 'PENDING' : String(row.status || '')
  const rewardCounts = {
    PENDING: rewards.filter((row) => rewardTabOf(row) === 'PENDING').length,
    GRANTED: rewards.filter((row) => rewardTabOf(row) === 'GRANTED').length,
    VOIDED: rewards.filter((row) => rewardTabOf(row) === 'VOIDED').length,
  }
  const visibleRewards = rewards.filter((row) => rewardTabOf(row) === rewardStatus)

  return (
    <Drawer open={props.open} onClose={props.onClose} width="min(1120px, 92vw)" title={content?.headline || '活动详情'} extra={<Space>
      {campaign?.status !== 'ENDED' ? <Button onClick={props.onEdit}>编辑</Button> : null}
      {campaign?.status === 'DRAFT' ? <Button type="primary" onClick={() => props.dto && void props.onAction(props.dto, 'publish')}>发布</Button> : null}
      {campaign?.status === 'PUBLISHED' ? <Button onClick={() => props.dto && void props.onAction(props.dto, 'pause')}>暂停</Button> : null}
      {campaign?.status === 'PAUSED' ? <Button type="primary" onClick={() => props.dto && void props.onAction(props.dto, 'publish')}>恢复</Button> : null}
    </Space>}>
      <div className="marketing-detail-head">
        <div><Tag color={STATUS_COLOR[status]}>{STATUS_TEXT[status] || status}</Tag><span>{enumText(PLAY_TYPES, content?.playType)}</span><span>{enumText(SIGNUP_MODES, campaign?.signupMode)}</span></div>
        <strong>{campaign?.payMode === 'PAID' ? `¥${money(campaign.price)}` : '免费'}</strong>
        <span>{campaign?.quotaTotal ? `已报名 ${campaign.quotaUsed || 0} / ${campaign.quotaTotal}` : `已报名 ${campaign?.quotaUsed || 0} · 不限名额`}</span>
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'overview', label: '数据与信息' }, { key: 'sessions', label: `活动场次 ${sessions.length}` }, { key: 'enrollments', label: `报名名单 ${enrollmentTotal}` }, { key: 'rewards', label: `奖励发放 ${rewards.length}` },
      ]} />
      {tab === 'overview' ? <>
        <section className="marketing-detail-stats">
          <div><span>浏览人数</span><b>{String(stats.uvCount ?? '—')}</b></div>
          <div><span>有效报名</span><b>{String(stats.enrollCount ?? campaign?.quotaUsed ?? '—')}</b></div>
          <div><span>已支付</span><b>{String(stats.paidCount ?? '—')}</b></div>
          <div><span>转化率</span><b>{stats.conversionRate == null ? '—' : `${(Number(stats.conversionRate) * 100).toFixed(1)}%`}</b></div>
        </section>
        <section className="work-card">
          <h2>活动信息</h2>
          <Descriptions size="small" column={3} items={[
            { key: 'campus', label: '校区', children: campaign?.campusNameText || '—' },
            { key: 'date', label: '活动日期', children: `${campaign?.activityStartDate || '—'} 至 ${campaign?.activityEndDate || '—'}` },
            { key: 'enroll', label: '报名时间', children: `${String(campaign?.enrollStartTime || '—').replace('T', ' ').slice(0, 16)} 至 ${String(campaign?.enrollEndTime || '—').replace('T', ' ').slice(0, 16)}` },
            { key: 'address', label: '地址', children: campaign?.address || '—' },
            { key: 'contact', label: '联系人', children: [campaign?.contactName, campaign?.contactPhone].filter(Boolean).join(' · ') || '—' },
            { key: 'code', label: '分享码', children: <Button type="link" onClick={async () => { if (await copyPlainText(String(campaign?.shareCode || ''))) message.success('分享码已复制') }}>{campaign?.shareCode || '—'}</Button> },
          ]} />
          <Space className="marketing-qr-actions">
            <Button onClick={async () => { try { const data = await postJson<JsonMap>(`/marketing/campaigns/${id}/wxacode?campusId=${props.campusId}`); const url = String(data.imageUrl || ''); if (url) window.open(url, '_blank', 'noopener,noreferrer'); else message.info('小程序码已生成') } catch (error) { message.error(tell(error, '生成小程序码失败')) } }}>生成活动小程序码</Button>
          </Space>
        </section>
        <section className="work-card">
          <h2>推广榜</h2>
          <Table rowKey={(row) => String(row.inviterMarketingUserId)} loading={loading} pagination={false} dataSource={ranking} columns={[
            { title: '推广人', dataIndex: 'inviterNickname', render: (value) => value || '匿名用户' },
            { title: '手机号', dataIndex: 'inviterPhoneMasked', render: (value) => value || '—' },
            { title: '带来浏览', dataIndex: 'visitCount' }, { title: '带来报名', dataIndex: 'enrollCount' },
          ]} />
        </section>
      </> : null}
      {tab === 'sessions' ? <section className="work-card">
        <div className="work-toolbar">{sessionEditable ? <Button type="primary" onClick={() => openSession()}>添加场次</Button> : null}<span className="range-label">仅“选择具体场次”的活动会向家长展示这里的时间。</span></div>
        <Table rowKey="id" dataSource={sessions} loading={loading} pagination={false} columns={[
          { title: '日期', dataIndex: 'sessionDate' },
          { title: '时间', render: (_, row: CampaignSession) => `${String(row.startTime || '').slice(0, 5)} - ${String(row.endTime || '').slice(0, 5)}` },
          { title: '教室', dataIndex: 'classroomText' }, { title: '老师', dataIndex: 'coachNameText' },
          { title: '名额', render: (_, row: CampaignSession) => `${row.quotaUsed || 0}/${row.quotaTotal || '不限'}` },
          { title: '状态', dataIndex: 'status', render: (value) => value === 'CLOSED' ? <Tag>关闭</Tag> : <Tag color="green">开放</Tag> },
          { title: '操作', render: (_, row: CampaignSession) => sessionEditable ? <Space><Button type="link" onClick={() => openSession(row)}>编辑</Button>{row.status !== 'CLOSED' ? <Popconfirm title="关闭后家长不能再报名该场次，已有报名不受影响。" onConfirm={() => void closeSession(row)}><Button type="link">关闭</Button></Popconfirm> : null}{Number(row.quotaUsed || 0) > 0 ? <Button type="link" danger disabled title="已有报名的场次不能删除，可改为关闭">删除</Button> : <Popconfirm title="确认删除这个场次？删除后无法恢复。" onConfirm={() => void removeSession(row)}><Button type="link" danger>删除</Button></Popconfirm>}</Space> : <span className="cell-muted">活动已结束</span> },
        ]} />
      </section> : null}
      {tab === 'enrollments' ? <section className="work-card">
        <div className="work-toolbar">
          <Input.Search placeholder="搜索学员或手机号" allowClear value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} onSearch={() => void loadEnrollments(1)} />
          <Select placeholder="报名状态" allowClear style={{ width: 130 }} value={filters.enrollStatus || undefined} options={[{ value: 'VALID', label: '有效' }, { value: 'CANCELLED', label: '已取消' }]} onChange={(value) => setFilters({ ...filters, enrollStatus: value || '' })} />
          <Select placeholder="新老客" allowClear style={{ width: 130 }} value={filters.customerType || undefined} options={[{ value: 'NEW', label: '新客' }, { value: 'OLD', label: '老客' }]} onChange={(value) => setFilters({ ...filters, customerType: value || '' })} />
          <Button onClick={() => void loadEnrollments(1)}>筛选</Button>
          <Button onClick={async () => { try { const file = await downloadFile(`/marketing/campaigns/${id}/enrollments/export`, { campusId: props.campusId }); triggerDownload(file.blob, file.filename) } catch (error) { message.error(tell(error, '导出失败')) } }}>导出 Excel</Button>
        </div>
        <Table rowKey="id" dataSource={enrollments} pagination={{ current: enrollmentPage, pageSize: 20, total: enrollmentTotal, showSizeChanger: false, onChange: (page) => void loadEnrollments(page) }} columns={[
          { title: '学员', dataIndex: 'studentName' }, { title: '联系电话', dataIndex: 'contactPhone', render: (value) => value || '—' },
          { title: '新老客', dataIndex: 'customerType', render: (value, row: Enrollment) => <Select size="small" value={value || 'NEW'} style={{ width: 86 }} options={[{ value: 'NEW', label: '新客' }, { value: 'OLD', label: '老客' }]} onChange={(next) => changeCustomerType(row, next)} /> },
          { title: '支付', render: (_, row: Enrollment) => row.payStatus === 'PAID' ? <Tag color="green">已支付 ¥{money(row.payAmount)}</Tag> : <Tag>{row.payStatus === 'NONE' ? '无需支付' : row.payStatus || '—'}</Tag> },
          { title: '来源', dataIndex: 'source', render: (value: string) => ({ DIRECT: '直接访问', SHARE: '分享', POSTER: '海报' } as Record<string, string>)[value] || value || '—' },
          { title: '报名时间', dataIndex: 'createTime', render: (value) => String(value || '—').replace('T', ' ').slice(0, 16) },
          { title: '状态', dataIndex: 'enrollStatus', render: (value) => value === 'VALID' ? <Tag color="green">有效</Tag> : <Tag>已取消</Tag> },
          { title: '操作', render: (_, row: Enrollment) => row.enrollStatus === 'VALID' ? <Popconfirm title={row.payStatus === 'PAID' ? '确认已线下退款并作废？未发放入账会冲销，已发放金额将在下次发放时扣除；该家长已原路领到的老带新奖励不用再退。' : '确认作废报名并归还名额？此操作不能撤销。'} onConfirm={async () => { await postJson(`/marketing/campaigns/${id}/enrollments/${row.id}/void?campusId=${props.campusId}`); await loadEnrollments(); await props.onReload() }}><Button type="link" danger>{row.payStatus === 'PAID' ? '退款作废' : '作废'}</Button></Popconfirm> : null },
        ]} />
      </section> : null}
      {tab === 'rewards' ? <section className="work-card">
        <Alert type="info" showIcon message="付费活动的立减奖励点“发放”会原路退回推广人微信，金额从机构营销入账中扣除；礼品、课时等由机构线下兑现后点“线下已兑现”。" />
        <div className="stat-line">
          <span>待发放<strong>{rewardCounts.PENDING}</strong></span>
          <span>已发放<strong>{rewardCounts.GRANTED}</strong></span>
          <span>奖励总数<strong>{rewards.length}</strong></span>
        </div>
        <div className="choice-tabs">
          {[['PENDING', '待发放'], ['GRANTED', '已发放'], ['VOIDED', '已作废']].map(([key, label]) => <button type="button" key={key} className={rewardStatus === key ? 'is-on' : ''} onClick={() => setRewardStatus(key)}>{label}<small>{rewardCounts[key as keyof typeof rewardCounts]}</small></button>)}
        </div>
        <Table rowKey={(row) => String(row.id)} dataSource={visibleRewards} pagination={false} locale={{ emptyText: '这一栏还没有奖励记录' }} columns={[
          { title: '获奖学员', dataIndex: 'studentName' }, { title: '奖励', dataIndex: 'rewardName' },
          { title: '达成档位', render: (_, row: JsonMap) => `${row.achievedReferralCount || 0}/${row.tierThreshold || 0} 人` },
          { title: '状态', dataIndex: 'statusText', render: (value, row: JsonMap) => <Space><Tag color={row.status === 'PENDING' ? 'orange' : row.status === 'REFUNDING' ? 'blue' : row.status === 'GRANTED' ? 'green' : 'default'}>{String(value || row.status || '—')}</Tag>{row.anomaly ? <Tag color="red">人数回落</Tag> : null}</Space> },
          { title: '退款', render: (_, row: JsonMap) => Number(row.refundAmount) > 0 && row.status !== 'PENDING' ? `${row.status === 'REFUNDING' ? '退款中' : '已原路退回'} ¥${money(row.refundAmount)}` : '—' },
          { title: '备注', render: (_, row: JsonMap) => String(row.grantRemark || row.voidReason || '—') },
          { title: '操作', render: (_, row: JsonMap) => {
            if (row.status === 'REFUNDING') return <Button type="link" onClick={() => mutateReward(row, 'grant')}>重试退款</Button>
            if (row.status !== 'PENDING') return null
            return <Space><Button type="link" onClick={() => mutateReward(row, 'grant')}>发放</Button><Button type="link" onClick={() => mutateReward(row, 'offline')}>线下已兑现</Button><Button type="link" danger onClick={() => mutateReward(row, 'void')}>作废</Button></Space>
          } },
        ]} />
      </section> : null}
      <SessionModal open={sessionEdit !== undefined} edit={sessionEdit} form={sessionForm} campaignId={id} campusId={props.campusId} onClose={() => setSessionEdit(undefined)} onSaved={loadDetailData} />
    </Drawer>
  )
}

function SessionModal(props: { open: boolean; edit: CampaignSession | null | undefined; form: FormInstance; campaignId: number; campusId: number; onClose: () => void; onSaved: () => Promise<void> }) {
  return <Modal open={props.open} title={props.edit ? '编辑活动场次' : '添加活动场次'} onCancel={props.onClose} onOk={() => props.form.submit()} okText="保存" destroyOnHidden>
    <Form form={props.form} layout="vertical" onFinish={async (values: JsonMap) => {
      try {
        if (String(values.endTime || '') <= String(values.startTime || '')) {
          message.warning('结束时间必须晚于开始时间')
          return
        }
        const quota = Number(values.quotaTotal || 0)
        const used = Number(props.edit?.quotaUsed || 0)
        if (quota > 0 && quota < used) {
          message.warning(`场次名额不能少于已报名人数 ${used}`)
          return
        }
        await postJson(`/marketing/campaigns/${props.campaignId}/sessions?campusId=${props.campusId}`, {
          ...(props.edit?.id ? { id: props.edit.id } : {}), ...values,
          startTime: `${String(values.startTime || '')}:00`, endTime: `${String(values.endTime || '')}:00`,
        })
        message.success('场次已保存')
        props.onClose()
        await props.onSaved()
      } catch (error) { message.error(tell(error, '场次保存失败')) }
    }}>
      <div className="form-grid form-grid-3">
        <Form.Item name="sessionDate" label="日期" rules={[{ required: true }]}><BusinessDatePicker /></Form.Item>
        <Form.Item name="startTime" label="开始时间" rules={[{ required: true }]}><Input type="time" /></Form.Item>
        <Form.Item name="endTime" label="结束时间" rules={[{ required: true }]}><Input type="time" /></Form.Item>
      </div>
      <div className="form-grid">
        <Form.Item name="classroomText" label="教室" rules={[{ max: 40 }]}><Input /></Form.Item>
        <Form.Item name="coachNameText" label="授课老师" rules={[{ max: 20 }]}><Input /></Form.Item>
      </div>
      <div className="form-grid form-grid-3">
        <Form.Item name="quotaTotal" label="名额（0 表示不限）" extra={Number(props.edit?.quotaUsed || 0) > 0 ? `已有 ${props.edit?.quotaUsed} 人报名；名额不能低于已报名人数，0 仍表示不限。` : undefined}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={[{ value: 'OPEN', label: '开放' }, { value: 'CLOSED', label: '关闭' }]} /></Form.Item>
        <Form.Item name="sortOrder" label="排序"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
      </div>
    </Form>
  </Modal>
}

export function SettlementDrawer(props: { open: boolean; row: SettlementCampaign | null; campusId: number; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<JsonMap[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const load = useCallback(async (nextPage: number) => {
    if (!props.open || !props.row?.campaignId) return
    setLoading(true)
    try {
      const data = await getJson<JsonMap>('/marketing/settlements', { campusId: props.campusId, campaignId: props.row.campaignId, pageNum: nextPage, pageSize: 20 })
      setRows((data.records as JsonMap[] | undefined) || [])
      setTotal(Number(data.total || 0))
      setPage(nextPage)
    } finally { setLoading(false) }
  }, [props.campusId, props.open, props.row?.campaignId])
  useEffect(() => { void load(1) }, [load])
  return <Drawer open={props.open} onClose={props.onClose} width={820} title={`${props.row?.headline || '活动'} · 入账明细`}>
    <Table rowKey={(row) => String(row.id)} loading={loading} dataSource={rows} pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: (value) => void load(value) }} columns={[
      { title: '类型', dataIndex: 'entryTypeText', render: (value, row: JsonMap) => value || row.entryType || '—' },
      { title: '学员', dataIndex: 'studentName', render: (value) => value || '—' },
      { title: '金额', dataIndex: 'amount', render: (value, row: JsonMap) => <b className={String(row.entryType || '').includes('DEDUCT') ? 'amount-negative' : ''}>{String(row.entryType || '').includes('DEDUCT') ? '-' : '+'}¥{money(value)}</b> },
      { title: '状态', dataIndex: 'statusText', render: (value, row: JsonMap) => value || row.status || '—' },
      { title: '时间', dataIndex: 'createTime', render: (value) => String(value || '—').replace('T', ' ').slice(0, 16) },
    ]} />
  </Drawer>
}
