import { Button, Modal, message } from 'antd'
import { useState } from 'react'
import { delJson } from '../api/biz'
import { money, tell } from './kit'
import type { Card, PayLaunch, PayRecord, Student } from './students-model'
import {
  canAdjustPayment,
  canEditPayment,
  childPaymentDisplay,
  deletePaymentContent,
  deletePaymentPeerLabel,
  deletePaymentTitle,
  groupPayments,
  isTransferInRecord,
  paymentAmountText,
  paymentAvgText,
  paymentChildLine,
  paymentCommissionText,
  paymentRemarkText,
  paymentRemainingText,
  paymentSummaryMetrics,
  paymentValidityCell,
  signedPaymentAmount,
  supplementSectionFoldable,
  supplementSectionTitle,
} from './student-payments'
import { CardRecordTabs, cardBalanceView, orderedStudentCards } from './students-domain'
import { TransferRecordEditor } from './student-transfer-record-editor'

export function StudentPaymentHistory(props: {
  student: Student
  rows: PayRecord[]
  parentPaidIds: number[]
  manage: boolean
  focusCardId?: number
  onCardChange: (cardId?: number) => void
  onPay: () => void
  setPayOpen: (value: PayLaunch | null) => void
  onChanged: () => Promise<void>
}) {
  const cards = orderedStudentCards(props.student.cards || [])
  const cumulative = props.rows.reduce((sum, row) => sum + signedPaymentAmount(row), 0)
  return (
    <div className="student-record-page student-payment-history">
      {cards.length > 1 ? <div className="student-record-cumulative"><span>{props.student.name}</span><em>累计缴费金额</em><strong>¥{money(Math.max(0, cumulative))}</strong></div> : null}
      <CardRecordTabs cards={cards} rows={props.rows} focusId={props.focusCardId} onCardChange={props.onCardChange}>
        {(rows, card) => <PaymentCardPage {...props} rows={rows} card={card} />}
      </CardRecordTabs>
    </div>
  )
}

function PaymentCardPage(props: {
  student: Student
  rows: PayRecord[]
  card?: Card
  parentPaidIds: number[]
  manage: boolean
  onPay: () => void
  setPayOpen: (value: PayLaunch | null) => void
  onChanged: () => Promise<void>
}) {
  const [openIds, setOpenIds] = useState<number[]>([])
  const [transferRecord, setTransferRecord] = useState<PayRecord | null>(null)
  const summary = paymentSummaryMetrics(props.rows, props.card, props.student, false)
  const grouped = groupPayments(props.rows)
  const cardView = props.card ? cardBalanceView(props.card) : null
  return (
    <div className="student-record-card-page">
      <section className="student-record-summary student-payment-summary">
        <header>
          <div>
            <span className="student-record-summary-name">{props.student.name}</span>
            <h3>{summary.head?.title || '缴费记录'}</h3>
            {summary.head?.subtitle ? <p>{summary.head.subtitle}</p> : null}
          </div>
          <div className="student-record-summary-side">
            {summary.head?.value ? <strong>{summary.head.value}</strong> : null}
            {summary.head?.course ? <small>{summary.head.course}</small> : cardView ? <small>{cardView.tag}</small> : null}
            {props.manage ? <Button type="primary" onClick={props.onPay}>缴费</Button> : null}
          </div>
        </header>
        {summary.metrics.length ? <div className="student-record-metrics">
          {summary.metrics.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
        </div> : null}
      </section>
      {!grouped.length ? <div className="student-record-empty"><strong>该卡暂无缴费记录</strong><span>完成缴费后，流水会按当前卡片归档展示</span></div> : (
        <div className="student-payment-list">
          {grouped.map((row) => <PaymentEntry
            key={row.id}
            row={row}
            card={props.card}
            student={props.student}
            parentPaid={props.parentPaidIds.includes(row.id)}
            manage={props.manage}
            open={openIds.includes(row.id)}
            onToggle={() => setOpenIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
            setPayOpen={props.setPayOpen}
            onTransferEdit={setTransferRecord}
            onChanged={props.onChanged}
          />)}
        </div>
      )}
      <TransferRecordEditor record={transferRecord} card={props.card} student={props.student} onClose={() => setTransferRecord(null)} onSaved={props.onChanged} />
    </div>
  )
}

function PaymentEntry(props: {
  row: PayRecord & { supplements: PayRecord[] }
  card?: Card
  student: Student
  parentPaid: boolean
  manage: boolean
  open: boolean
  onToggle: () => void
  setPayOpen: (value: PayLaunch | null) => void
  onTransferEdit: (record: PayRecord) => void
  onChanged: () => Promise<void>
}) {
  const row = props.row
  const category = String(props.card?.cardCategory || props.student.cardCategory || 'HOURS').toUpperCase()
  const validity = paymentValidityCell(row, props.card, props.student, 'main')
  const remaining = paymentRemainingText(row, props.card, props.student, 'main')
  const avg = paymentAvgText(row)
  const remark = paymentRemarkText(row)
  const commission = paymentCommissionText(row)
  const sectionTitle = supplementSectionTitle(row.supplements)
  const foldable = supplementSectionFoldable(sectionTitle, row.supplements.length)
  const shownChildren = (props.open || !foldable ? row.supplements : row.supplements.slice(0, 1)).map((item) => childPaymentDisplay(item, row))
  const course = String(row.courseTypeLabel || row.courseType || props.card?.studentGroupName || '').trim()
  const services = (props.card?.serviceItemNames || []).map((item) => String(item || '').trim()).filter(Boolean).join('、')
  return (
    <article className={`student-payment-entry is-${row.type || 'new'}`}>
      <header>
        <div className="student-payment-entry-title">
          <span>{props.parentPaid ? '学员端在线缴费' : (row.typeText || '缴费')}</span>
          <time>{row.paymentDate || ''}</time>
        </div>
        {props.manage ? <div className="student-payment-entry-actions">
          {canAdjustPayment(row) ? <Button type="link" onClick={() => props.setPayOpen({ adjust: row })}>调整</Button> : null}
          {row.adjustmentReason !== 'transfer' ? <Button type="link" onClick={() => props.setPayOpen(row)}>编辑</Button> : isTransferInRecord(row) ? <Button type="link" onClick={() => props.onTransferEdit(row)}>编辑</Button> : null}
          <Button type="link" danger onClick={() => confirmPaymentDelete(row, props.card, props.onChanged)}>删除</Button>
        </div> : null}
      </header>
      {course ? <p className="student-payment-course">{course}</p> : null}
      <div className="student-payment-entry-metrics">
        <div><span>收款金额</span><strong>{paymentAmountText(row)}</strong></div>
        {category === 'HOURS' ? <>
          <div><span>正课</span><strong>{Number(row.hours || 0)}</strong></div>
          <div><span>赠课</span><strong>{Number(row.giftHours || 0)}</strong></div>
          {avg ? <div><span>折合均价</span><strong>{avg}</strong></div> : null}
        </> : null}
        {category === 'PERIOD' && validity.text ? <div className="is-wide"><span>{validity.text === '已退费' ? '已退费' : '有效期'}</span>{validity.text === '已退费' ? null : <strong className={validity.tone ? `is-${validity.tone}` : ''}>{validity.text}</strong>}</div> : null}
        {category === 'STORED_VALUE' ? <div className="is-wide"><span>{props.card?.courseCategory === false ? '适用服务' : '课程权益'}</span><strong>{props.card?.courseCategory === false ? (services || '未配置服务') : (course || '未配置课程权益')}</strong></div> : null}
      </div>
      {remaining || (category !== 'PERIOD' && validity.text) ? <div className="student-payment-entry-footer"><span>{remaining}</span>{category !== 'PERIOD' && validity.text ? <em className={validity.tone ? `is-${validity.tone}` : ''}>{validity.text}</em> : null}</div> : null}
      {remark || commission ? <div className="student-payment-note">{remark ? <span>备注：{remark}</span> : null}{commission ? <span>提成：{commission}</span> : null}</div> : null}
      {row.supplements.length ? <div className="student-payment-adjustments">
        <button type="button" disabled={!foldable} onClick={props.onToggle}><span>{sectionTitle}</span><em>共 {row.supplements.length} 笔{foldable ? (props.open ? ' · 收起' : ' · 展开') : ''}</em></button>
        {shownChildren.map((child) => <div key={child.id} className="student-payment-adjustment-row">
          <div><strong>{paymentChildLine(child, false)}</strong><span>{child.paymentDate}</span></div>
          {props.manage ? <div>{canEditPayment(child) ? <Button type="link" onClick={() => props.setPayOpen(child)}>编辑</Button> : isTransferInRecord(child) ? <Button type="link" onClick={() => props.onTransferEdit(child)}>编辑</Button> : null}<Button type="link" danger onClick={() => confirmPaymentDelete(child, props.card, props.onChanged)}>删除</Button></div> : null}
        </div>)}
      </div> : null}
    </article>
  )
}

function confirmPaymentDelete(row: PayRecord, card: Card | undefined, onChanged: () => Promise<void>) {
  const storedService = String(row.displayMode || '').trim() === 'stored_service'
  const hours = Number(row.totalHours ?? (Number(row.hours || 0) + Number(row.giftHours || 0)))
  const serviceCount = Array.isArray(row.serviceRights) ? row.serviceRights.length : 0
  Modal.confirm({
    title: deletePaymentTitle(row),
    content: <div><p>{deletePaymentContent(row)}</p>{row.adjustmentReason === 'transfer' ? <p>关联记录：{String(row.transferTargetStudentName || '对方学员')} · {deletePaymentPeerLabel(row)}</p> : null}<p>{storedService ? `服务数量：${serviceCount} 项` : `课时数：${hours} 课时`}</p><p>金额：¥{money(row.amount)}</p>{card ? <p>所属卡片：{card.cardName || card.studentGroupName || cardBalanceView(card).tag}</p> : null}</div>,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await delJson(`/payment-records/${row.id}`)
        message.success('已删除')
        await onChanged()
      } catch (error) {
        message.error(tell(error, '删除失败，请稍后重试'))
        throw error
      }
    },
  })
}
