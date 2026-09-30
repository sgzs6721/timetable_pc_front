import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { getToken } from './session'
import { AppShell } from './layouts/AppShell'
import { AccountPage } from './pages/AccountPage'
import { CampusPage } from './pages/CampusPage'
import { CoursesPage } from './pages/CoursesPage'
import { DailyPage } from './pages/DailyPage'
import { FeedbackPage } from './pages/FeedbackPage'
import { FinancePage } from './pages/FinancePage'
import { GuidePage } from './pages/GuidePage'
import { HomePage } from './pages/HomePage'
import { HoursPage } from './pages/HoursPage'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { MembershipPage } from './pages/MembershipPage'
import { OrgPage } from './pages/OrgPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { ProfitPage } from './pages/ProfitPage'
import { SalaryPage } from './pages/SalaryPage'
import { SchedulePage } from './pages/SchedulePage'
import { StudentsPage } from './pages/StudentsPage'
import { WechatCallbackPage } from './pages/WechatCallbackPage'

function RequireAuth() {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/wechat" element={<WechatCallbackPage />} />
      <Route path="/legal/:doc" element={<LegalPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/hours" element={<HoursPage />} />
        <Route path="/org" element={<OrgPage />} />
        <Route path="/campus" element={<CampusPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/salary" element={<SalaryPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/profit" element={<ProfitPage />} />
        <Route path="/membership" element={<MembershipPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
