import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom'
import { discardLoginRedirect, getToken, rememberLoginRedirect } from './session'
import { AppShell, type ShellContext } from './layouts/AppShell'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { WechatCallbackPage } from './pages/WechatCallbackPage'
import { InstitutionRouteGuard } from './routing/InstitutionRouteGuard'

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
const LeadsPage = lazy(() => import('./pages/LeadsPage').then((module) => ({ default: module.LeadsPage })))
const MembershipPage = lazy(() => import('./pages/MembershipPage').then((module) => ({ default: module.MembershipPage })))
const OrgPage = lazy(() => import('./pages/OrgPage').then((module) => ({ default: module.OrgPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((module) => ({ default: module.PaymentsPage })))
const ProfitPage = lazy(() => import('./pages/ProfitPage').then((module) => ({ default: module.ProfitPage })))
const SalaryPage = lazy(() => import('./pages/SalaryPage').then((module) => ({ default: module.SalaryPage })))
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })))
const StudentsPage = lazy(() => import('./pages/StudentsPage').then((module) => ({ default: module.StudentsPage })))
const ParentLayout = lazy(() => import('./parent/ParentLayout').then((module) => ({ default: module.ParentLayout })))
const ParentHomePage = lazy(() => import('./parent/ParentHomePage').then((module) => ({ default: module.ParentHomePage })))
const ParentChildrenPage = lazy(() => import('./parent/ParentChildrenPage').then((module) => ({ default: module.ParentChildrenPage })))
const ParentTimetablePage = lazy(() => import('./parent/ParentTimetablePage').then((module) => ({ default: module.ParentTimetablePage })))
const ParentCoursesPage = lazy(() => import('./parent/ParentCoursesPage').then((module) => ({ default: module.ParentCoursesPage })))
const ParentMinePage = lazy(() => import('./parent/ParentMinePage').then((module) => ({ default: module.ParentMinePage })))
const ParentActivitiesPage = lazy(() => import('./parent/ParentActivitiesPage').then((module) => ({ default: module.ParentActivitiesPage })))
const ParentRecordsPage = lazy(() => import('./parent/ParentRecordsPage').then((module) => ({ default: module.ParentRecordsPage })))
const ParentStatsPage = lazy(() => import('./parent/ParentStatsPage').then((module) => ({ default: module.ParentStatsPage })))
const ParentCoursePage = lazy(() => import('./parent/ParentCoursePage').then((module) => ({ default: module.ParentCoursePage })))
const ParentPayPage = lazy(() => import('./parent/ParentPayPage').then((module) => ({ default: module.ParentPayPage })))
const SharedTimetablePage = lazy(() => import('./parent/ParentSharedPages').then((module) => ({ default: module.SharedTimetablePage })))
const SharedCourseStatsPage = lazy(() => import('./parent/ParentSharedPages').then((module) => ({ default: module.SharedCourseStatsPage })))
const PlatformConsolePage = lazy(() => import('./platform/PlatformConsolePage').then((module) => ({ default: module.PlatformConsolePage })))
const MarketingLandingPage = lazy(() => import('./marketing-public/MarketingLandingPage').then((module) => ({ default: module.MarketingLandingPage })))
const MarketingEnrollmentsPage = lazy(() => import('./marketing-public/MarketingMyPages').then((module) => ({ default: module.MarketingEnrollmentsPage })))
const MarketingReferralPage = lazy(() => import('./marketing-public/MarketingMyPages').then((module) => ({ default: module.MarketingReferralPage })))

function RequireAuth() {
  const location = useLocation()
  if (!getToken()) {
    const keepsOriginalLoginLanding = location.pathname === '/parent'
      || location.pathname.startsWith('/parent/')
      || location.pathname === '/platform'
    if (keepsOriginalLoginLanding) {
      discardLoginRedirect()
      return <Navigate to="/login" replace />
    }
    const target = `${location.pathname}${location.search}${location.hash}`
    return <RememberThenLogin key={target} target={target} />
  }
  return <Outlet />
}

function RememberThenLogin({ target }: { target: string }) {
  const [remembered, setRemembered] = useState(false)
  useEffect(() => {
    rememberLoginRedirect(target)
    setRemembered(true)
  }, [target])
  if (!remembered) return <div className="route-loading">正在跳转登录…</div>
  return <Navigate to="/login" replace />
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
        <Route element={<Suspense fallback={<div className="route-loading">正在加载家长学习空间…</div>}><ParentLayout /></Suspense>}>
          <Route path="/parent" element={<Navigate to="/parent/home" replace />} />
          <Route path="/parent/home" element={<ParentHomePage />} />
          <Route path="/parent/children" element={<ParentChildrenPage />} />
          <Route path="/parent/timetable" element={<ParentTimetablePage />} />
          <Route path="/parent/courses" element={<ParentCoursesPage />} />
          <Route path="/parent/mine" element={<ParentMinePage />} />
          <Route path="/parent/activities" element={<ParentActivitiesPage />} />
          <Route path="/parent/records" element={<ParentRecordsPage />} />
          <Route path="/parent/course-stats" element={<ParentStatsPage />} />
          <Route path="/parent/course/:courseId" element={<ParentCoursePage />} />
          <Route path="/parent/pay" element={<ParentPayPage />} />
        </Route>
        <Route path="/parent/share/timetable/:shareCode" element={<Suspense fallback={<div className="route-loading">正在打开分享课表…</div>}><SharedTimetablePage /></Suspense>} />
        <Route path="/parent/share/course-stats/:shareCode" element={<Suspense fallback={<div className="route-loading">正在打开课程统计…</div>}><SharedCourseStatsPage /></Suspense>} />
        <Route path="/platform" element={<Suspense fallback={<div className="route-loading">正在验证平台运营权限…</div>}><PlatformConsolePage /></Suspense>} />
        <Route path="/campaign/:shareCode" element={<Suspense fallback={<div className="route-loading">正在打开活动…</div>}><MarketingLandingPage /></Suspense>} />
        <Route path="/my-enrollments" element={<Suspense fallback={<div className="route-loading">正在加载报名记录…</div>}><MarketingEnrollmentsPage /></Suspense>} />
        <Route path="/my-referral/:shareCode" element={<Suspense fallback={<div className="route-loading">正在加载推广数据…</div>}><MarketingReferralPage /></Suspense>} />
        <Route element={<AppShell />}>
        <Route element={<SuspendedShellOutlet />}>
        <Route element={<InstitutionRouteGuard />}>
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
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        </Route>
        </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
