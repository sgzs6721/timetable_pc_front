import { Button, Form, Input, InputNumber, Select, Space, message } from 'antd'
import type { FormInstance } from 'antd'
import type { JsonMap, ReferralTier } from './marketing-model'

const REWARD_TYPES = [
  { value: 'GIFT', label: '礼品' },
  { value: 'DISCOUNT', label: '立减' },
  { value: 'COURSE_HOURS', label: '课时' },
]

const PRESETS: Array<{ key: string; label: string; desc: string; tiers: ReferralTier[] }> = [
  { key: 'starter', label: '轻量拉新', desc: '1 人送小礼，3 人送课时', tiers: [{ threshold: 1, rewardType: 'GIFT', rewardName: '乒乓球训练礼包' }, { threshold: 3, rewardType: 'COURSE_HOURS', rewardName: '赠送 1 节训练课' }] },
  { key: 'growth', label: '阶梯增长', desc: '1、3、5 人逐级加码', tiers: [{ threshold: 1, rewardType: 'GIFT', rewardName: '运动水杯' }, { threshold: 3, rewardType: 'COURSE_HOURS', rewardName: '赠送 1 节训练课' }, { threshold: 5, rewardType: 'DISCOUNT', rewardName: '续费优惠券' }] },
  { key: 'partner', label: '好友同行', desc: '适合双人体验与组队报名', tiers: [{ threshold: 1, rewardType: 'DISCOUNT', rewardName: '好友同行体验礼' }, { threshold: 2, rewardType: 'GIFT', rewardName: '双人训练礼包' }] },
]

export function ReferralTierEditor(props: { form: FormInstance; name: string; enabledName: string; disabled?: boolean }) {
  const enabled = Form.useWatch(props.enabledName, props.form)
  if (!enabled) return null
  return (
    <section className="referral-editor">
      <div className="referral-editor-head">
        <div><b>奖励档位</b><span>达到推荐人数后发放对应奖励，最多 4 档</span></div>
        <Space wrap>
          {PRESETS.map((preset) => (
            <Button key={preset.key} size="small" disabled={props.disabled} onClick={() => { props.form.setFieldValue(props.name, preset.tiers.map((item) => ({ ...item }))); message.success(`已套用“${preset.label}”`) }}>
              {preset.label}<small>{preset.desc}</small>
            </Button>
          ))}
        </Space>
      </div>
      <Form.List name={props.name} initialValue={[{ threshold: 1, rewardType: 'GIFT', rewardName: '' }]}>
        {(fields, { add, remove }) => (
          <>
            <div className="referral-tier-list">
              {fields.map((field, index) => (
                <div className="referral-tier" key={field.key}>
                  <span className="referral-tier-index">档位 {index + 1}</span>
                  <Form.Item name={[field.name, 'threshold']} label="推荐人数" rules={[{ required: true, message: '请填写人数' }]}>
                    <InputNumber min={1} max={9999} precision={0} addonAfter="人" disabled={props.disabled} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'rewardType']} label="奖励类型" rules={[{ required: true }]}>
                    <Select options={REWARD_TYPES} style={{ width: 120 }} disabled={props.disabled} />
                  </Form.Item>
                  <Form.Item className="referral-tier-name" name={[field.name, 'rewardName']} label="奖励名称" rules={[{ required: true, whitespace: true, message: '请填写奖励名称' }, { max: 40 }]}>
                    <Input placeholder="例如：赠送 1 节训练课" maxLength={40} disabled={props.disabled} />
                  </Form.Item>
                  <Button danger type="text" disabled={props.disabled || fields.length <= 1} onClick={() => remove(field.name)}>删除</Button>
                </div>
              ))}
            </div>
            <Button disabled={props.disabled || fields.length >= 4} onClick={() => add({ threshold: undefined, rewardType: 'GIFT', rewardName: '' })}>添加奖励档位</Button>
          </>
        )}
      </Form.List>
    </section>
  )
}

export function validateReferralTiers(values: JsonMap, enabledKey: string, tiersKey: string): string {
  if (!values[enabledKey]) return ''
  const tiers = (values[tiersKey] as ReferralTier[] | undefined) || []
  if (!tiers.length || tiers.length > 4) return '老带新奖励需要设置 1 到 4 个档位'
  const seen = new Set<number>()
  for (const tier of tiers) {
    const threshold = Number(tier.threshold || 0)
    if (!Number.isInteger(threshold) || threshold <= 0) return '奖励档位人数必须为大于 0 的整数'
    if (seen.has(threshold)) return '奖励档位人数不能重复'
    seen.add(threshold)
    if (!String(tier.rewardName || '').trim()) return '请填写每个档位的奖励名称'
  }
  return ''
}
