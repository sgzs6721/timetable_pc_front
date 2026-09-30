import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import 'antd/dist/reset.css'
import './styles/global.css'
import './styles/work.css'
import './styles/design.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#5269e8',
          colorInfo: '#5269e8',
          colorSuccess: '#13a976',
          colorWarning: '#f09243',
          colorError: '#df5b64',
          colorText: '#172033',
          colorTextSecondary: '#7c8699',
          colorTextTertiary: '#a8afbd',
          colorBorder: '#e8eaf0',
          colorBorderSecondary: '#eceef3',
          colorBgLayout: '#f5f6f8',
          colorBgContainer: '#ffffff',
          borderRadius: 10,
          borderRadiusLG: 14,
          controlHeight: 36,
          fontFamily: 'Inter, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
          boxShadow: '0 1px 2px rgba(20, 29, 47, 0.03), 0 6px 20px rgba(20, 29, 47, 0.035)',
          boxShadowSecondary: '0 16px 40px rgba(20, 29, 47, 0.08)',
        },
        components: {
          Button: {
            primaryShadow: 'none',
            defaultHoverBorderColor: '#cfd3de',
            defaultHoverColor: '#172033',
          },
          Table: {
            headerBg: '#f7f8fa',
            headerColor: '#687286',
            headerSplitColor: 'transparent',
            borderColor: '#f0f1f5',
            rowHoverBg: '#f7f8fb',
            cellPaddingBlock: 12,
            cellPaddingInline: 14,
          },
          Modal: { titleFontSize: 16 },
          Tabs: { inkBarColor: '#5269e8', itemSelectedColor: '#5269e8', itemHoverColor: '#4055d0' },
          Segmented: { itemSelectedBg: '#172033', itemSelectedColor: '#ffffff', trackBg: '#ffffff' },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
