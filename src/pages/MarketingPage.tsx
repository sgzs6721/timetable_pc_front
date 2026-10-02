import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import type { Campus } from '../api/types'
import { BusinessDatePicker, BusinessDateTimePicker } from '../components/BusinessDatePicker'
import { NeedCampus, PageHead, money, tell, useShell } from './kit'
import { CampaignDetailDrawer, SettlementDrawer } from './marketing-detail'
import { ReferralTierEditor, validateReferralTiers } from './marketing-referral'
import { FIELD_OPTIONS, PAY_MODES, PLAY_TYPES, SIGNUP_MODES, STATUS_COLOR, STATUS_TEXT, THEMES, enumText, parseEnabledFields, parseReferralTiers, parseStringList, serializeReferralTiers, type CampaignDto, type CampaignSession, type JsonMap, type MarketingTemplate, type SettlementCampaign } from './marketing-model'
import { MARKETING_PRESETS, presetCampaignValues, type MarketingPreset } from './marketing-presets'
import { MarketingPreviewModal } from './marketing-preview'
import './MarketingPage.css'

function templateInitial(template?: MarketingTemplate | null): JsonMap {
  return template ? {
    ...template,
    sellingPointsText: parseStringList(template.sellingPoints).join('\n'),
    enrollmentFieldKeys: parseEnabledFields(template.enrollmentFields),
    referralTiersDefault: parseReferralTiers(template.referralRewardTiersDefault),
    enabled: Number(template.enabled ?? 1) !== 0,
  } : {
    playType: 'TRIAL_CLASS', signupModeDefault: 'INTENT', payModeDefault: 'FREE', posterTheme: 'BLUE', enabled: true, sortOrder: 0,
    enrollmentFieldKeys: ['gender', 'birthDate', 'levelText', 'intentSlots', 'remark'],
  }
}

function templatePayload(values: JsonMap): JsonMap {
  const enabledFields = Object.fromEntries(FIELD_OPTIONS.map((item) => [item.value, (values.enrollmentFieldKeys as string[] | undefined)?.includes(item.value) || false]))
  const points = String(values.sellingPointsText || '').split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 6)
  return {
    templateName: String(values.templateName || '').trim(),
    playType: values.playType,
    headline: String(values.headline || '').trim(),
    subHeadline: String(values.subHeadline || '').trim(),
    coverImageUrl: String(values.coverImageUrl || '').trim(),
    sellingPoints: points.length ? JSON.stringify(points) : '',
    detailText: String(values.detailText || '').trim(),
    noticeText: String(values.noticeText || '').trim(),
    enrollmentFields: JSON.stringify(enabledFields),
    signupModeDefault: values.signupModeDefault,
    payModeDefault: values.payModeDefault,
    referralEnabledDefault: values.referralEnabledDefault ? 1 : 0,
    referralRewardTiersDefault: serializeReferralTiers(values.referralTiersDefault),
    posterTheme: values.posterTheme,
    enabled: values.enabled ? 1 : 0,
    sortOrder: Number(values.sortOrder || 0),
  }
}

function campaignInitial(dto: CampaignDto | null, campus?: Campus): JsonMap {
  const item = dto?.campaign
  const content = dto?.content
  return item ? {
    ...item,
    headline: content?.headline,
    subHeadline: content?.subHeadline,
    coverImageUrl: content?.coverImageUrl,
    sellingPointsText: parseStringList(content?.sellingPoints).join('\n'),
    detailText: content?.detailText,
    noticeText: content?.noticeText,
    posterTheme: content?.posterTheme || 'BLUE',
    referralEnabled: Number(item.referralEnabled || 0) === 1,
    referralTiers: parseReferralTiers(item.referralRewardTiers),
    enrollStartTime: item.enrollStartTime?.slice(0, 16),
    enrollEndTime: item.enrollEndTime?.slice(0, 16),
  } : {
    campusNameText: campus?.name || '',
    address: campus?.address || '',
    contactName: campus?.contactPerson || '',
    contactPhone: campus?.contactPhone || '',
    signupMode: 'INTENT', payMode: 'FREE', quotaTotal: 0, referralEnabled: false,
  }
}

function campaignPayload(values: JsonMap): JsonMap {
  const points = String(values.sellingPointsText || '').split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 6)
  const overridePresent = ['headline', 'subHeadline', 'coverImageUrl', 'sellingPointsText', 'detailText', 'noticeText', 'posterTheme']
    .some((key) => String(values[key] || '').trim())
  return {
    templateId: Number(values.templateId),
    campusNameText: String(values.campusNameText || '').trim(),
    address: String(values.address || '').trim(),
    signupMode: values.signupMode,
    payMode: values.payMode,
    price: values.payMode === 'PAID' ? Number(values.price || 0) : 0,
    originalPrice: values.payMode === 'PAID' ? Number(values.originalPrice || 0) : 0,
    quotaTotal: Number(values.quotaTotal || 0),
    enrollStartTime: localDateTime(values.enrollStartTime),
    enrollEndTime: localDateTime(values.enrollEndTime),
    activityStartDate: values.activityStartDate || null,
    activityEndDate: values.activityEndDate || null,
    contactName: String(values.contactName || '').trim(),
    contactPhone: String(values.contactPhone || '').trim(),
    referralEnabled: values.referralEnabled ? 1 : 0,
    referralRewardTiers: serializeReferralTiers(values.referralTiers),
    contentOverride: overridePresent ? {
      headline: String(values.headline || '').trim(),
      subHeadline: String(values.subHeadline || '').trim(),
      coverImageUrl: String(values.coverImageUrl || '').trim(),
      sellingPoints: points.length ? JSON.stringify(points) : '',
      detailText: String(values.detailText || '').trim(),
      noticeText: String(values.noticeText || '').trim(),
      posterTheme: values.posterTheme || 'BLUE',
    } : null,
  }
}

function templatePreviewDto(template: MarketingTemplate): CampaignDto {
  return {
    campaign: { id: 0, payMode: template.payModeDefault || 'FREE', quotaTotal: 0 },
    content: {
      playType: template.playType,
      headline: template.headline,
      subHeadline: template.subHeadline,
      coverImageUrl: template.coverImageUrl,
      sellingPoints: template.sellingPoints,
      detailText: template.detailText,
      noticeText: template.noticeText,
      posterTheme: template.posterTheme,
    },
  }
}

function localDateTime(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  return text.length === 16 ? `${text}:00` : text
}

function campaignValidation(values: JsonMap, quotaUsed = 0): string {
  if (!String(values.campusNameText || '').trim()) return '请填写校区展示名称'
  if (!String(values.address || '').trim()) return '请填写活动地址'
  if (values.payMode === 'PAID') {
    const price = Number(values.price || 0)
    const original = Number(values.originalPrice || 0)
    if (!(price > 0)) return '付费报名的活动价必须大于 0'
    if (original > 0 && original < price) return '划线原价不能低于活动价'
  }
  const quotaTotal = Number(values.quotaTotal || 0)
  if (quotaTotal > 0 && quotaTotal < quotaUsed) return `名额不能少于已报名人数 ${quotaUsed}`
  const enrollStart = String(values.enrollStartTime || '')
  const enrollEnd = String(values.enrollEndTime || '')
  if (enrollStart && enrollEnd && enrollEnd <= enrollStart) return '报名结束时间必须晚于报名开始时间'
  const activityStart = String(values.activityStartDate || '')
  const activityEnd = String(values.activityEndDate || '')
  if (activityStart && activityEnd && activityEnd < activityStart) return '活动结束日期不能早于开始日期'
  const phone = String(values.contactPhone || '').trim()
  if (!/^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8}(?:-\d{1,5})?)$/.test(phone)) return '请填写正确的联系电话，手机号或带区号的固定电话'
  return validateReferralTiers(values, 'referralEnabled', 'referralTiers')
}

function localNowText(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function MarketingPage() {
  const shell = useShell()
  const campusId = shell.campusId
  const campus = shell.campuses.find((item) => item.id === campusId)
  const campusName = campus?.name || ''
  const [activeTab, setActiveTab] = useState('campaigns')
  const [loading, setLoading] = useState(false)
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([])
  const [templates, setTemplates] = useState<MarketingTemplate[]>([])
  const [settlements, setSettlements] = useState<SettlementCampaign[]>([])
  const [settlementSummary, setSettlementSummary] = useState<JsonMap>({})
  const [templateEdit, setTemplateEdit] = useState<MarketingTemplate | null | undefined>(undefined)
  const [campaignEdit, setCampaignEdit] = useState<CampaignDto | null | undefined>(undefined)
  const [detail, setDetail] = useState<CampaignDto | null>(null)
  const [settlementDetail, setSettlementDetail] = useState<SettlementCampaign | null>(null)
  const [preview, setPreview] = useState<MarketingPreset | CampaignDto | null>(null)
  const [previewPreset, setPreviewPreset] = useState<MarketingPreset | null>(null)
  const [creatingPreset, setCreatingPreset] = useState('')
  const [templateForm] = Form.useForm()
  const [campaignForm] = Form.useForm()
  const campaignPayMode = Form.useWatch('payMode', campaignForm)
  const campaignPublished = Boolean(campaignEdit?.campaign && campaignEdit.campaign.status !== 'DRAFT')

  const load = useCallback(async () => {
    if (!campusId) return
    setLoading(true)
    try {
      const [campaignRows, templateRows, settlementPage] = await Promise.all([
        getJson<CampaignDto[]>('/marketing/campaigns', { campusId }),
        getJson<MarketingTemplate[]>('/marketing/templates', { campusId, enabledOnly: 0 }),
        getJson<JsonMap>('/marketing/settlements/campaigns', { campusId }),
      ])
      setCampaigns(campaignRows || [])
      setTemplates(templateRows || [])
      setSettlementSummary(settlementPage || {})
      setSettlements((settlementPage?.records as SettlementCampaign[] | undefined) || [])
    } catch (error) {
      message.error(tell(error, '营销中心加载失败'))
    } finally {
      setLoading(false)
    }
  }, [campusId])

  useEffect(() => { void load() }, [load])

  function openTemplate(item: MarketingTemplate | null) {
    setTemplateEdit(item)
    templateForm.resetFields()
    templateForm.setFieldsValue(templateInitial(item))
  }

  function applyTemplate(id: number) {
    const template = templates.find((item) => item.id === id)
    if (!template) return
    campaignForm.setFieldsValue({
      signupMode: template.signupModeDefault || 'INTENT',
      payMode: template.payModeDefault || 'FREE',
      headline: template.headline,
      subHeadline: template.subHeadline,
      coverImageUrl: template.coverImageUrl,
      sellingPointsText: parseStringList(template.sellingPoints).join('\n'),
      detailText: template.detailText,
      noticeText: template.noticeText,
      posterTheme: template.posterTheme || 'BLUE',
      referralEnabled: Number(template.referralEnabledDefault || 0) === 1,
      referralTiers: parseReferralTiers(template.referralRewardTiersDefault),
    })
  }

  async function openCampaign(item: CampaignDto | null) {
    setCampaignEdit(item)
    campaignForm.resetFields()
    if (item?.campaign?.id && campusId) {
      try {
        const full = await getJson<CampaignDto>(`/marketing/campaigns/${item.campaign.id}`, { campusId })
        setCampaignEdit(full)
        campaignForm.setFieldsValue(campaignInitial(full, campus))
      } catch (error) {
        message.error(tell(error, '活动详情加载失败'))
      }
    } else {
      campaignForm.setFieldsValue(campaignInitial(null, campus))
    }
  }

  async function usePreset(preset: MarketingPreset) {
    if (!campusId || creatingPreset) return
    setCreatingPreset(preset.id)
    try {
      let template = templates.find((item) => item.templateName === preset.templateName)
      if (!template) {
        template = await postJson<MarketingTemplate>(`/marketing/templates?campusId=${campusId}`, templatePayload(preset))
        setTemplates((current) => [...current, template!])
      }
      if (!template?.id) throw new Error('系统方案初始化失败，请重试')
      await openCampaign(null)
      campaignForm.setFieldsValue({ ...campaignInitial(null, campus), ...presetCampaignValues(preset, campusName, template.id) })
      setPreview(null)
      setPreviewPreset(null)
      message.success('活动方案已带入，请补充时间、地址和联系人后保存')
    } catch (error) {
      message.error(tell(error, '活动方案生成失败'))
    } finally {
      setCreatingPreset('')
    }
  }

  async function openDetail(item: CampaignDto) {
    if (!campusId || !item.campaign?.id) return
    try {
      setDetail(await getJson<CampaignDto>(`/marketing/campaigns/${item.campaign.id}`, { campusId }))
    } catch (error) {
      message.error(tell(error, '活动详情加载失败'))
    }
  }

  async function campaignAction(item: CampaignDto, action: 'publish' | 'pause' | 'end') {
    if (!campusId || !item.campaign?.id) return
    try {
      if (action === 'publish' && item.campaign.signupMode === 'SESSION') {
        const sessions = await getJson<CampaignSession[]>(`/marketing/campaigns/${item.campaign.id}/sessions`, { campusId })
        if (!sessions.length) {
          message.warning('按场次报名的活动至少需要一个场次才能发布')
          await openDetail(item)
          return
        }
      }
      if (action === 'publish') {
        const deadline = String(item.campaign.enrollEndTime || '')
        if (!deadline) {
          message.warning('请先选择报名截止时间')
          await openCampaign(item)
          return
        }
        if (deadline <= localNowText()) {
          message.warning('报名截止时间已过，请先延长报名时间再发布')
          await openCampaign(item)
          return
        }
      }
      await postJson(`/marketing/campaigns/${item.campaign.id}/${action}?campusId=${campusId}`)
      message.success(action === 'publish' ? '活动已发布' : action === 'pause' ? '活动已暂停' : '活动已结束')
      setDetail(null)
      await load()
    } catch (error) {
      message.error(tell(error, '操作失败'))
    }
  }

  const overview = useMemo(() => ({
    total: campaigns.length,
    ongoing: campaigns.filter((item) => item.displayStatus === 'ONGOING').length,
    draft: campaigns.filter((item) => item.displayStatus === 'DRAFT').length,
    enrolled: campaigns.reduce((sum, item) => sum + Number(item.campaign?.quotaUsed || 0), 0),
  }), [campaigns])

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="营销中心" extra="活动模板、招生发布、报名转化与营销入账统一管理">
        <Button onClick={() => void load()} loading={loading}>刷新</Button>
        <Button onClick={() => openTemplate(null)}>新建模板</Button>
        <Button type="primary" onClick={() => void openCampaign(null)}>新建活动</Button>
      </PageHead>

      <section className="marketing-hero">
        <div><span>活动总数</span><b>{overview.total}</b></div>
        <div><span>进行中</span><b>{overview.ongoing}</b></div>
        <div><span>草稿待发布</span><b>{overview.draft}</b></div>
        <div><span>累计报名</span><b>{overview.enrolled}</b></div>
        <div className="marketing-hero-note"><strong>{campusName}</strong><span>当前数据均按所选校区隔离</span></div>
      </section>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'campaigns', label: `营销活动 ${campaigns.length}` },
        { key: 'templates', label: `活动模板 ${templates.length}` },
        { key: 'settlements', label: `入账结算 ${settlements.length}` },
      ]} />

      {activeTab === 'campaigns' ? (
        <section className="marketing-grid" aria-busy={loading}>
          {campaigns.map((dto) => {
            const campaign = dto.campaign!
            const content = dto.content || {}
            const status = dto.displayStatus || campaign.status || 'DRAFT'
            return (
              <article className={`marketing-card theme-${String(content.posterTheme || 'BLUE').toLowerCase()}`} key={campaign.id}>
                <div className="marketing-card-cover">
                  <span>{enumText(PLAY_TYPES, content.playType)}</span>
                  <Tag color={STATUS_COLOR[status]}>{STATUS_TEXT[status] || status}</Tag>
                  <h2>{content.headline || '未命名活动'}</h2>
                  <p>{content.subHeadline || '暂无副标题'}</p>
                </div>
                <div className="marketing-card-body">
                  <div className="marketing-card-metrics">
                    <span><b>{campaign.payMode === 'PAID' ? `¥${money(campaign.price)}` : '免费'}</b>活动价格</span>
                    <span><b>{campaign.quotaTotal ? `${campaign.quotaUsed || 0}/${campaign.quotaTotal}` : `${campaign.quotaUsed || 0}/不限`}</b>已报名/名额</span>
                    <span><b>{enumText(SIGNUP_MODES, campaign.signupMode)}</b>报名方式</span>
                  </div>
                  <div className="marketing-card-actions">
                    <Button type="link" onClick={() => { setPreviewPreset(null); setPreview(dto) }}>预览</Button>
                    <Button type="link" onClick={() => void openDetail(dto)}>详情与数据</Button>
                    {campaign.status !== 'ENDED' ? <Button type="link" onClick={() => void openCampaign(dto)}>编辑</Button> : null}
                    {campaign.status === 'DRAFT' ? <Button type="link" onClick={() => void campaignAction(dto, 'publish')}>发布</Button> : null}
                    {campaign.status === 'PUBLISHED' ? <Button type="link" onClick={() => void campaignAction(dto, 'pause')}>暂停</Button> : null}
                    {campaign.status === 'PAUSED' ? <Button type="link" onClick={() => void campaignAction(dto, 'publish')}>恢复</Button> : null}
                    {campaign.status !== 'ENDED' ? <Popconfirm title="确认结束活动？结束后不可恢复。" onConfirm={() => void campaignAction(dto, 'end')}><Button type="link" danger>结束</Button></Popconfirm> : null}
                    {campaign.status === 'DRAFT' ? <Popconfirm title="确认删除这个草稿？" onConfirm={async () => { await delJson(`/marketing/campaigns/${campaign.id}`, { campusId }); await load() }}><Button type="link" danger>删除</Button></Popconfirm> : null}
                  </div>
                </div>
              </article>
            )
          })}
          {!loading && campaigns.length === 0 ? <div className="marketing-empty"><b>还没有营销活动</b><span>可直接新建活动，系统会自动沉淀为可复用模板。</span><Button type="primary" onClick={() => void openCampaign(null)}>新建活动</Button></div> : null}
        </section>
      ) : null}

      {activeTab === 'templates' ? (
        <>
        <section className="marketing-presets">
          <div className="marketing-presets-head"><div><h2>精选活动方案</h2><p>文案、报名配置和转化路径均已准备好，补充校区信息即可发布。</p></div><Tag color="blue">4 套</Tag></div>
          <div className="marketing-preset-grid">
            {MARKETING_PRESETS.map((preset) => (
              <article key={preset.id} className={`marketing-preset-card theme-${preset.posterTheme.toLowerCase()}`}>
                <div><Tag>{preset.badge}</Tag><small>{preset.audienceText}</small></div>
                <h3>{preset.templateName}</h3>
                <p>{preset.headline}</p>
                <div className="marketing-preset-path"><span>{preset.mechanicText}</span><i>→</i><span>{preset.outcomeText}</span></div>
                <strong>{preset.highlightText}</strong><small>{preset.highlightSubText}</small>
                <Space><Button onClick={() => { setPreviewPreset(preset); setPreview(preset) }}>预览</Button><Button type="primary" loading={creatingPreset === preset.id} onClick={() => void usePreset(preset)}>生成活动</Button></Space>
              </article>
            ))}
          </div>
        </section>
        <section className="work-card">
          <Table rowKey="id" loading={loading} dataSource={templates} pagination={false} columns={[
            { title: '模板名称', dataIndex: 'templateName', render: (value, row: MarketingTemplate) => <div><b>{value || '未命名模板'}</b><div className="cell-muted">{row.headline || '暂无活动标题'}</div></div> },
            { title: '玩法', dataIndex: 'playType', render: (value) => enumText(PLAY_TYPES, value) },
            { title: '默认报名', dataIndex: 'signupModeDefault', render: (value) => enumText(SIGNUP_MODES, value) },
            { title: '支付', dataIndex: 'payModeDefault', render: (value) => enumText(PAY_MODES, value) },
            { title: '主题', dataIndex: 'posterTheme', render: (value) => enumText(THEMES, value) },
            { title: '状态', dataIndex: 'enabled', render: (value) => Number(value ?? 1) === 0 ? <Tag>已停用</Tag> : <Tag color="green">启用</Tag> },
            { title: '排序', dataIndex: 'sortOrder', width: 76 },
            { title: '操作', width: 280, render: (_, row: MarketingTemplate) => <Space><Button type="link" onClick={() => { setPreviewPreset(null); setPreview(templatePreviewDto(row)) }}>预览</Button><Button type="link" onClick={() => openTemplate(row)}>编辑</Button><Button type="link" disabled={Number(row.enabled ?? 1) === 0} onClick={() => { void openCampaign(null).then(() => { campaignForm.setFieldValue('templateId', row.id); applyTemplate(row.id) }) }}>用此模板创建活动</Button><Popconfirm title="确认删除模板？" onConfirm={async () => { await delJson(`/marketing/templates/${row.id}`, { campusId }); await load() }}><Button type="link" danger>删除</Button></Popconfirm></Space> },
          ]} />
        </section>
        </>
      ) : null}

      {activeTab === 'settlements' ? (
        <>
          <section className="marketing-settlement-summary">
            <div><span>累计入账</span><b>¥{money(settlementSummary.totalCredit)}</b></div>
            <div><span>待入账</span><b>¥{money(settlementSummary.pendingCredit)}</b></div>
            <div><span>待扣减</span><b>¥{money(settlementSummary.pendingDeduction)}</b></div>
            <div><span>待结算净额</span><b>¥{money(settlementSummary.pendingNet)}</b></div>
          </section>
          <section className="work-card">
            <Alert type="info" showIcon message="结算明细为只读，平台完成发放后状态会自动更新。" />
            <Table rowKey={(row) => String(row.campaignId)} loading={loading} dataSource={settlements} pagination={false} columns={[
              { title: '活动', dataIndex: 'headline', render: (value) => value || '未命名活动' },
              { title: '累计入账', dataIndex: 'totalCredit', render: (value) => `¥${money(value)}` },
              { title: '待入账', dataIndex: 'pendingCredit', render: (value) => `¥${money(value)}` },
              { title: '待扣减', dataIndex: 'pendingDeduction', render: (value) => `¥${money(value)}` },
              { title: '待结算净额', dataIndex: 'pendingNet', render: (value) => <b>¥{money(value)}</b> },
              { title: '入账笔数', dataIndex: 'creditCount' },
              { title: '最近变动', dataIndex: 'lastTime', render: (value) => String(value || '—').replace('T', ' ').slice(0, 16) },
              { title: '操作', width: 90, render: (_, row: SettlementCampaign) => <Button type="link" onClick={() => setSettlementDetail(row)}>查看明细</Button> },
            ]} />
          </section>
        </>
      ) : null}

      <Modal open={templateEdit !== undefined} title={templateEdit ? '编辑活动模板' : '新建活动模板'} width={820} onCancel={() => setTemplateEdit(undefined)} okText="保存模板" onOk={() => templateForm.submit()} destroyOnHidden>
        <Form form={templateForm} layout="vertical" onFinish={async (values) => {
          if (!campusId) return
          const tierError = validateReferralTiers(values, 'referralEnabledDefault', 'referralTiersDefault')
          if (tierError) { message.warning(tierError); return }
          try {
            const payload = templatePayload(values)
            if (templateEdit?.id) await putJson(`/marketing/templates/${templateEdit.id}?campusId=${campusId}`, payload)
            else await postJson(`/marketing/templates?campusId=${campusId}`, payload)
            message.success('模板已保存')
            setTemplateEdit(undefined)
            await load()
          } catch (error) { message.error(tell(error, '模板保存失败')) }
        }} initialValues={templateInitial(templateEdit)}>
          <div className="form-grid form-grid-3">
            <Form.Item name="templateName" label="模板名称" rules={[{ required: true }, { max: 20 }]}><Input placeholder="例如：秋季体验课" /></Form.Item>
            <Form.Item name="playType" label="玩法类型" rules={[{ required: true }]}><Select options={PLAY_TYPES} /></Form.Item>
            <Form.Item name="posterTheme" label="海报主题" rules={[{ required: true }]}><Select options={THEMES} /></Form.Item>
          </div>
          <Form.Item name="headline" label="活动主标题" rules={[{ required: true }, { max: 30 }]}><Input /></Form.Item>
          <Form.Item name="subHeadline" label="活动副标题" rules={[{ max: 120 }]}><Input /></Form.Item>
          <Form.Item name="coverImageUrl" label="封面图片地址" rules={[{ max: 255 }]}><Input placeholder="https://..." /></Form.Item>
          <Form.Item name="sellingPointsText" label="活动卖点（每行一条，最多 6 条）"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
          <div className="form-grid">
            <Form.Item name="detailText" label="活动详情" rules={[{ max: 2000 }]}><Input.TextArea rows={5} /></Form.Item>
            <Form.Item name="noticeText" label="报名须知" rules={[{ max: 1000 }]}><Input.TextArea rows={5} /></Form.Item>
          </div>
          <Form.Item name="enrollmentFieldKeys" label="报名表单字段"><Select mode="multiple" options={FIELD_OPTIONS} /></Form.Item>
          <div className="form-grid form-grid-3">
            <Form.Item name="signupModeDefault" label="默认报名方式"><Select options={SIGNUP_MODES} /></Form.Item>
            <Form.Item name="payModeDefault" label="默认支付方式"><Select options={PAY_MODES} /></Form.Item>
            <Form.Item name="sortOrder" label="显示顺序"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="form-grid">
            <Form.Item name="referralEnabledDefault" label="默认开启老带新" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="enabled" label="启用模板" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <ReferralTierEditor form={templateForm} name="referralTiersDefault" enabledName="referralEnabledDefault" />
        </Form>
      </Modal>

      <Modal open={campaignEdit !== undefined} title={campaignEdit?.campaign ? '编辑营销活动' : '新建营销活动'} width={920} onCancel={() => setCampaignEdit(undefined)} okText="保存活动" onOk={() => campaignForm.submit()} destroyOnHidden>
        <Form form={campaignForm} layout="vertical" onFinish={async (values) => {
          if (!campusId) return
          const validation = campaignValidation(values, Number(campaignEdit?.campaign?.quotaUsed || 0))
          if (validation) { message.warning(validation); return }
          try {
            const payload = campaignPayload(values)
            if (!(Number(payload.templateId) > 0)) {
              const generated = await postJson<MarketingTemplate>(`/marketing/templates?campusId=${campusId}`, templatePayload({
                ...values,
                templateName: `${String(values.headline || '自定义活动').trim().slice(0, 14)}模板`,
                playType: 'TRIAL_CLASS',
                enrollmentFieldKeys: FIELD_OPTIONS.map((item) => item.value),
                signupModeDefault: values.signupMode,
                payModeDefault: values.payMode,
                referralEnabledDefault: values.referralEnabled,
                referralTiersDefault: values.referralTiers,
                enabled: true,
                sortOrder: templates.length * 10 + 10,
              }))
              if (!generated?.id) throw new Error('自定义活动模板初始化失败')
              payload.templateId = generated.id
              setTemplates((current) => [...current, generated])
            }
            if (campaignEdit?.campaign?.id) await putJson(`/marketing/campaigns/${campaignEdit.campaign.id}?campusId=${campusId}`, payload)
            else await postJson(`/marketing/campaigns?campusId=${campusId}`, payload)
            message.success('活动已保存')
            setCampaignEdit(undefined)
            await load()
          } catch (error) { message.error(tell(error, '活动保存失败')) }
        }} initialValues={campaignInitial(campaignEdit || null, campus)}>
          {campaignEdit?.campaign?.status && campaignEdit.campaign.status !== 'DRAFT' ? <Alert className="form-alert" type="warning" showIcon message="活动已发布：模板、报名方式、支付方式、活动价和报名开始时间不可修改；其余字段以后台实际校验为准。" /> : null}
          <div className="form-grid form-grid-3">
            <Form.Item name="templateId" label="活动模板（可选）"><Select allowClear placeholder="不选则自动保存为自定义模板" disabled={campaignPublished} options={templates.filter((item) => Number(item.enabled ?? 1) !== 0 || item.id === campaignEdit?.campaign?.templateId).map((item) => ({ value: item.id, label: item.templateName }))} onChange={(value) => { if (value) applyTemplate(value) }} /></Form.Item>
            <Form.Item name="signupMode" label="报名方式" rules={[{ required: true }]}><Select disabled={campaignPublished} options={SIGNUP_MODES} /></Form.Item>
            <Form.Item name="payMode" label="支付方式" rules={[{ required: true }]}><Select disabled={campaignPublished} options={PAY_MODES} /></Form.Item>
          </div>
          <div className="form-grid form-grid-3">
            <Form.Item name="campusNameText" label="校区展示名称" rules={[{ required: true }, { max: 40 }]}><Input /></Form.Item>
            <Form.Item name="address" label="活动地址" rules={[{ required: true, whitespace: true }, { max: 120 }]}><Input /></Form.Item>
            <Form.Item name="quotaTotal" label="总名额（0 表示不限）" rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="form-grid form-grid-3">
            {campaignPayMode === 'PAID' ? <Form.Item name="price" label="活动价" rules={[{ required: true, message: '请输入活动价' }]}><InputNumber min={0.01} max={999999.99} precision={2} style={{ width: '100%' }} disabled={campaignPublished} /></Form.Item> : <div className="marketing-free-note"><b>免费报名</b><span>活动不会发起在线支付</span></div>}
            {campaignPayMode === 'PAID' ? <Form.Item name="originalPrice" label="划线原价"><InputNumber min={0} max={999999.99} precision={2} style={{ width: '100%' }} /></Form.Item> : <div />}
            <Form.Item name="posterTheme" label="海报主题"><Select options={THEMES} /></Form.Item>
          </div>
          <div className="form-grid">
            <Form.Item name="enrollStartTime" label="报名开始时间" rules={[{ required: true }]}><BusinessDateTimePicker disabled={campaignPublished} /></Form.Item>
            <Form.Item name="enrollEndTime" label="报名结束时间" rules={[{ required: true }]}><BusinessDateTimePicker /></Form.Item>
            <Form.Item name="activityStartDate" label="活动开始日期"><BusinessDatePicker /></Form.Item>
            <Form.Item name="activityEndDate" label="活动结束日期"><BusinessDatePicker /></Form.Item>
          </div>
          <div className="form-grid">
            <Form.Item name="contactName" label="联系人" rules={[{ required: true, whitespace: true }, { max: 20 }]}><Input /></Form.Item>
            <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true }, { max: 20 }]}><Input /></Form.Item>
          </div>
          <div className="form-grid">
            <Form.Item name="headline" label="活动主标题" rules={[{ required: true }, { max: 30 }]}><Input /></Form.Item>
            <Form.Item name="subHeadline" label="活动副标题" rules={[{ max: 120 }]}><Input /></Form.Item>
          </div>
          <Form.Item name="coverImageUrl" label="封面图片地址" rules={[{ max: 255 }]}><Input maxLength={255} /></Form.Item>
          <Form.Item name="sellingPointsText" label="活动卖点（每行一条，最多 6 条）" rules={[{ max: 1000 }]}><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
          <div className="form-grid">
            <Form.Item name="detailText" label="活动详情" rules={[{ max: 2000 }]}><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>
            <Form.Item name="noticeText" label="报名须知" rules={[{ max: 1000 }]}><Input.TextArea rows={4} maxLength={1000} showCount /></Form.Item>
          </div>
          {campaignPublished ? <Alert className="form-alert" type="info" showIcon message="老带新规则发布后保持原配置；如需更换奖励规则，请结束本活动后另发一个。" /> : null}
          <Form.Item name="referralEnabled" label="开启老带新" valuePropName="checked"><Switch disabled={campaignPublished} /></Form.Item>
          <ReferralTierEditor form={campaignForm} name="referralTiers" enabledName="referralEnabled" disabled={campaignPublished} />
        </Form>
      </Modal>

      <CampaignDetailDrawer open={Boolean(detail)} dto={detail} campusId={campusId || 0} onClose={() => setDetail(null)} onEdit={() => { const current = detail; setDetail(null); if (current) void openCampaign(current) }} onAction={campaignAction} onReload={async () => { if (!detail?.campaign?.id || !campusId) return; setDetail(await getJson(`/marketing/campaigns/${detail.campaign.id}`, { campusId })); await load() }} />
      <SettlementDrawer open={Boolean(settlementDetail)} row={settlementDetail} campusId={campusId || 0} onClose={() => setSettlementDetail(null)} />
      <MarketingPreviewModal data={preview} onClose={() => { setPreview(null); setPreviewPreset(null) }} onUse={previewPreset ? () => void usePreset(previewPreset) : undefined} />
    </NeedCampus>
  )
}
