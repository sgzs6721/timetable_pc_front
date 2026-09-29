import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './styles/global.css'
import 'antd/dist/reset.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2C6E7A',
          colorInfo: '#2C6E7A',
          colorText: '#1A2C33',
          colorTextSecondary: '#5E727A',
          colorBorder: '#D7E2E6',
          colorBgLayout: '#F4F7F8',
          borderRadius: 10,
          fontFamily: '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Button: {
            primaryShadow: 'none',
            defaultHoverBorderColor: '#2C6E7A',
            defaultHoverColor: '#2C6E7A',
          },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
