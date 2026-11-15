import { Switch } from 'antd'

export function CheckInTeacherHoursSwitch(props: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className={`checkin-teacher-hours${props.checked ? ' is-active' : ''}`}>
      <div>
        <strong>不记录老师课时</strong>
        <small>只销课，不计入老师课时统计</small>
      </div>
      <Switch aria-label="不记录老师课时" checked={props.checked} onChange={props.onChange} />
    </div>
  )
}

export function SkipTeacherHoursTag() {
  return <span className="skip-teacher-hours-tag">不计老师课时</span>
}
