import { AlipayCircleFilled, BankFilled, CreditCardFilled, WalletFilled, WechatFilled } from '@ant-design/icons'
import { Radio } from 'antd'
import type { ComponentProps } from 'react'

const PAYMENT_METHODS = [
  { value: 1, label: '支付宝', icon: <AlipayCircleFilled />, tone: 'is-alipay' },
  { value: 2, label: '微信', icon: <WechatFilled />, tone: 'is-wechat' },
  { value: 3, label: '银行卡', icon: <CreditCardFilled />, tone: 'is-bank-card' },
  { value: 4, label: '公户', icon: <BankFilled />, tone: 'is-corporate' },
  { value: 5, label: '现金', icon: <WalletFilled />, tone: 'is-cash' },
]

type PaymentMethodPickerProps = Omit<ComponentProps<typeof Radio.Group>, 'options' | 'optionType'>

export function PaymentMethodPicker({ className, ...props }: PaymentMethodPickerProps) {
  return (
    <Radio.Group {...props} className={['payment-method-picker', className].filter(Boolean).join(' ')}>
      {PAYMENT_METHODS.map((item) => (
        <Radio.Button key={item.value} value={item.value}>
          <span className={`payment-method-picker__option ${item.tone}`}>{item.icon}<span>{item.label}</span></span>
        </Radio.Button>
      ))}
    </Radio.Group>
  )
}
