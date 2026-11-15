import { useState } from 'react'
import { CheckInCard } from '../src/pages/student-checkins'
import { QuickCheckIn } from '../src/pages/student-quick-checkin'
import { checkInRecords, checkInStudent, checkInPayments, checkInCoaches, checkInGroups } from './parity-fixtures'

export function CheckInPreview() {
  const [rows, setRows] = useState([...checkInRecords])
  const [checkingIn, setCheckingIn] = useState(false)
  return (
    <section className="work-card">
      <CheckInCard student={checkInStudent} card={checkInStudent.cards![0]} rows={rows} payments={checkInPayments} groups={checkInGroups} coaches={checkInCoaches} financialHidden={false} manage onCheckIn={() => setCheckingIn(true)} onChanged={async () => setRows([...checkInRecords])} />
      {checkingIn ? <QuickCheckIn student={checkInStudent} services={[]} coaches={checkInCoaches} groups={checkInGroups} onClose={() => setCheckingIn(false)} onDone={() => setCheckingIn(false)} /> : null}
    </section>
  )
}
