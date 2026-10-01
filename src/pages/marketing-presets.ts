import type { JsonMap } from './marketing-model'

export interface MarketingPreset extends JsonMap {
  id: string
  badge: string
  templateName: string
  audienceText: string
  mechanicText: string
  outcomeText: string
  highlightText: string
  highlightSubText: string
  headline: string
  subHeadline: string
  sellingPointsText: string
  detailText: string
  noticeText: string
  signupModeDefault: string
  payModeDefault: string
  quotaDefault: number
  priceDefault?: number
  originalPriceDefault?: number
  posterTheme: string
}

export const MARKETING_PRESETS: MarketingPreset[] = [
  {
    id: 'trial', badge: '拉新体验', templateName: '新生体验课模板', audienceText: '首次到店新客', mechanicText: '预约体验', outcomeText: '体验转化',
    highlightText: '免费体验', highlightSubText: '限量 20 个新客名额', playType: 'TRIAL_CLASS',
    headline: '第一次上课，也可以很有成就感', subHeadline: '专业老师带领体验，帮助孩子找到兴趣与节奏',
    sellingPointsText: '零基础友好\n小班专业指导\n课后成长建议',
    detailText: '面向首次到店的新学员，由专业老师带领完成一节完整体验课。课程结束后提供针对性的学习建议与阶段规划。',
    noticeText: '请提前 10 分钟到场；如需改期，请至少提前 2 小时联系校区。',
    enrollmentFieldKeys: ['gender', 'birthDate', 'levelText', 'intentSlots', 'remark'], signupModeDefault: 'INTENT', payModeDefault: 'FREE', quotaDefault: 20, posterTheme: 'BLUE', enabled: true, sortOrder: 10,
  },
  {
    id: 'open-day', badge: '老带新', templateName: '老带新转介绍模板', audienceText: '在读学员家庭', mechanicText: '好友转介绍', outcomeText: '新客报名',
    highlightText: '双方有礼', highlightSubText: '好友报名成功，老学员与新学员都得礼', playType: 'DISCOUNT_PACKAGE',
    headline: '带好友一起学，双方都有礼', subHeadline: '老学员分享专属链接，好友报名后双方获得学习礼遇',
    sellingPointsText: '专属链接自动记录\n好友报名双方得礼\n邀请进度随时可查',
    detailText: '老学员将专属活动链接分享给好友。好友通过链接完成报名后，系统自动记录邀请关系；校区确认有效报名后，为老学员和新学员分别发放对应礼遇。',
    noticeText: '同一位新学员仅计入一位邀请人；奖励以校区核验后的有效报名为准。',
    enrollmentFieldKeys: ['birthDate', 'levelText', 'intentSlots', 'remark'], signupModeDefault: 'INTENT', payModeDefault: 'FREE', quotaDefault: 50, posterTheme: 'GREEN', enabled: true, sortOrder: 20,
    referralEnabledDefault: true,
    referralTiersDefault: [{ threshold: '1', rewardType: 'GIFT', rewardName: '双方学习礼包' }, { threshold: '3', rewardType: 'COURSE_HOURS', rewardName: '老学员奖励 1 节课时' }],
  },
  {
    id: 'summer', badge: '付费转化', templateName: '暑期成长营模板', audienceText: '暑期学员', mechanicText: '限额付费', outcomeText: '课程成交',
    highlightText: '¥699', highlightSubText: '原价 ¥899 · 限 30 人', playType: 'DISCOUNT_PACKAGE',
    headline: '暑期不虚度，集中突破正当时', subHeadline: '阶段课程限时招募，系统学习更容易看到进步',
    sellingPointsText: '阶段目标清晰\n学习成果反馈\n限时优惠名额',
    detailText: '为暑期学习设计的阶段课程，通过连续训练、过程反馈与成果展示，帮助孩子建立稳定的学习节奏。',
    noticeText: '名额有限，以完成报名为准；具体排课由校区老师联系确认。',
    enrollmentFieldKeys: ['gender', 'birthDate', 'levelText', 'intentSlots', 'remark'], signupModeDefault: 'INTENT', payModeDefault: 'PAID', quotaDefault: 30, priceDefault: 699, originalPriceDefault: 899, posterTheme: 'ORANGE', enabled: true, sortOrder: 30,
  },
  {
    id: 'referral', badge: '转发有礼', templateName: '社群转发有礼模板', audienceText: '校区家长', mechanicText: '分享助力', outcomeText: '社群裂变',
    highlightText: '3 档奖励', highlightSubText: '分享越有效，解锁奖励越丰富', playType: 'DISCOUNT_PACKAGE',
    headline: '分享活动给好友，解锁专属奖励', subHeadline: '每一次有效报名都会累计，邀请进度和奖励状态随时可查',
    sellingPointsText: '专属分享码自动归因\n有效报名实时累计\n多档奖励逐级解锁',
    detailText: '家长将活动转发给好友或社群，好友通过专属链接报名后计入有效邀请。系统自动累计邀请人数，并在达到对应档位时生成待发奖励。',
    noticeText: '仅好友完成有效报名后计入；异常或取消报名不计入奖励进度。',
    enrollmentFieldKeys: ['birthDate', 'levelText', 'intentSlots', 'remark'], signupModeDefault: 'INTENT', payModeDefault: 'FREE', quotaDefault: 80, posterTheme: 'PURPLE', enabled: true, sortOrder: 40,
    referralEnabledDefault: true,
    referralTiersDefault: [{ threshold: '1', rewardType: 'GIFT', rewardName: '分享参与礼' }, { threshold: '3', rewardType: 'COURSE_HOURS', rewardName: '奖励 1 节课时' }, { threshold: '5', rewardType: 'DISCOUNT', rewardName: '续费优惠券' }],
  },
]

export function presetCampaignValues(preset: MarketingPreset, campusName: string, templateId: number): JsonMap {
  return {
    templateId,
    campusNameText: campusName,
    signupMode: preset.signupModeDefault,
    payMode: preset.payModeDefault,
    quotaTotal: preset.quotaDefault,
    price: preset.priceDefault,
    originalPrice: preset.originalPriceDefault,
    headline: preset.headline,
    subHeadline: preset.subHeadline,
    sellingPointsText: preset.sellingPointsText,
    detailText: preset.detailText,
    noticeText: preset.noticeText,
    posterTheme: preset.posterTheme,
    referralEnabled: Boolean(preset.referralEnabledDefault),
    referralTiers: preset.referralTiersDefault || [],
  }
}
