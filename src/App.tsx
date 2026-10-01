import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useOutletContext } from 'react-router-dom'
import { getToken } from './session'
import { AppShell, type ShellContext } from './layouts/AppShell'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { WechatCallbackPage } from './pages/WechatCallbackPage'

const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })))
const CampusPage = lazy(() => import('./pages/CampusPage').then((module) => ({ default: module.CampusPage })))
const CoursesPage = lazy(() => import('./pages/CoursesPage').then((module) => ({ default: module.CoursesPage })))
const DailyPage = lazy(() => import('./pages/DailyPage').then((module) => ({ default: module.DailyPage })))
const FeedbackPage = lazy(() => import('./pages/FeedbackPage').then((module) => ({ default: module.FeedbackPage })))
const FinancePage = lazy(() => import('./pages/FinancePage').then((module) => ({ default: module.FinancePage })))
const GuidePage = lazy(() => import('./pages/GuidePage').then((module) => ({ default: module.GuidePage })))
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })))
const HoursPage = lazy(() => import('./pages/HoursPage').then((module) => ({ default: module.HoursPage })))
const MarketingPage = lazy(() => import('./pages/MarketingPage').then((module) => ({ default: module.MarketingPage })))
const MembershipPage = lazy(() => import('./pages/MembershipPage').then((module) => ({ default: module.MembershipPage })))
const OrgPage = lazy(() => import('./pages/OrgPage').then((module) => ({ default: module.OrgPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((module) => ({ default: module.PaymentsPage })))
const ProfitPage = lazy(() => import('./pages/ProfitPage').then((module) => ({ default: module.ProfitPage })))
const SalaryPage = lazy(() => import('./pages/SalaryPage').then((module) => ({ default: module.SalaryPage })))
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })))
const StudentsPage = lazy(() => import('./pages/StudentsPage').then((module) => ({ default: module.StudentsPage })))

function RequireAuth() {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function SuspendedShellOutlet() {
  const shell = useOutletContext<ShellContext>()
  return (
    <Suspense fallback={<div className="route-loading">正在加载工作台…</div>}>
      <Outlet context={shell} />
    </Suspense>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/wechat" element={<WechatCallbackPage />} />
      <Route path="/legal/:doc" element={<LegalPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
        <Route element={<SuspendedShellOutlet />}>
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
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
