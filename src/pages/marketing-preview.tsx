import { Button, Modal, Tag } from 'antd'
import { money } from './kit'
import { parseStringList, type CampaignDto } from './marketing-model'
import type { MarketingPreset } from './marketing-presets'

type PreviewData = MarketingPreset | CampaignDto

function isCampaignPreview(data: PreviewData): data is CampaignDto {
  return !('id' in data)
}

function previewContent(data: PreviewData) {
  if (isCampaignPreview(data)) {
    return {
      headline: data.content?.headline || '未命名活动',
      subHeadline: data.content?.subHeadline || '',
      sellingPoints: parseStringList(data.content?.sellingPoints),
      detailText: data.content?.detailText || '',
      noticeText: data.content?.noticeText || '',
      theme: data.content?.posterTheme || 'BLUE',
      price: data.campaign?.payMode === 'PAID' ? (data.campaign.price == null ? '付费报名' : `¥${money(data.campaign.price)}`) : '免费报名',
      quota: data.campaign?.quotaTotal ? `限 ${data.campaign.quotaTotal} 人` : '名额不限',
    }
  }
  return {
    headline: data.headline,
    subHeadline: data.subHeadline,
    sellingPoints: data.sellingPointsText.split(/\n+/).filter(Boolean),
    detailText: data.detailText,
    noticeText: data.noticeText,
    theme: data.posterTheme,
    price: data.payModeDefault === 'PAID' ? `¥${money(data.priceDefault)}` : '免费报名',
    quota: data.quotaDefault ? `限 ${data.quotaDefault} 人` : '名额不限',
  }
}

export function MarketingPreviewModal(props: { data: PreviewData | null; onClose: () => void; onUse?: () => void }) {
  if (!props.data) return null
  const view = previewContent(props.data)
  return (
    <Modal width={760} open title="活动效果预览" onCancel={props.onClose} footer={props.onUse ? [<Button key="cancel" onClick={props.onClose}>返回</Button>, <Button key="use" type="primary" onClick={props.onUse}>使用此方案</Button>] : <Button onClick={props.onClose}>关闭</Button>}>
      <article className={`marketing-preview theme-${String(view.theme).toLowerCase()}`}>
        <div className="marketing-preview-hero">
          <Tag color="blue">活动预览</Tag>
          <h2>{view.headline}</h2>
          <p>{view.subHeadline}</p>
          <div><strong>{view.price}</strong><span>{view.quota}</span></div>
        </div>
        <div className="marketing-preview-body">
          {view.sellingPoints.length ? <section><h3>活动亮点</h3><div className="marketing-preview-points">{view.sellingPoints.map((item) => <span key={item}>{item}</span>)}</div></section> : null}
          {view.detailText ? <section><h3>活动详情</h3><p>{view.detailText}</p></section> : null}
          {view.noticeText ? <section><h3>报名须知</h3><p>{view.noticeText}</p></section> : null}
        </div>
      </article>
    </Modal>
  )
}
