import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { getToken } from './session'
import { AppShell } from './layouts/AppShell'
import { AccountPage } from './pages/AccountPage'
import { HomePage } from './pages/HomePage'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
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
        <Route path="/students" element={<ModulePage />} />
        <Route path="/schedule" element={<ModulePage />} />
        <Route path="/courses" element={<ModulePage />} />
        <Route path="/hours" element={<ModulePage />} />
        <Route path="/org" element={<ModulePage />} />
        <Route path="/campus" element={<ModulePage />} />
        <Route path="/daily" element={<ModulePage />} />
        <Route path="/payments" element={<ModulePage />} />
        <Route path="/salary" element={<ModulePage />} />
        <Route path="/finance" element={<ModulePage />} />
        <Route path="/profit" element={<ModulePage />} />
        <Route path="/membership" element={<ModulePage />} />
        <Route path="/guide" element={<ModulePage />} />
        <Route path="/feedback" element={<ModulePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
