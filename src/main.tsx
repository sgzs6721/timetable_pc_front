import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import 'antd/dist/reset.css'
import './styles/global.css'
import './styles/work.css'
import './styles/finance-settings.css'
import './styles/finance-comparison.css'
import './styles/finance-overview-filter.css'
import './styles/design.css'
import './styles/staff.css'
import './styles/page-styles.css'
import './styles/ui-consistency.css'
import './styles/calendar.css'
import './styles/dialogs.css'
import './styles/buttons.css'

const buttonConfig = { autoInsertSpace: false }
const appTheme = {
  token: {
    colorPrimary: '#315ff4',
    colorInfo: '#315ff4',
    colorSuccess: '#0c9b6c',
    colorWarning: '#e98b36',
    colorError: '#dc5260',
    colorText: '#17233d',
    colorTextSecondary: '#5f6d87',
    colorTextTertiary: '#8e99ad',
    colorBorder: '#e3e9f2',
    colorBorderSecondary: '#edf1f6',
    colorBgLayout: '#f3f6fb',
    colorBgContainer: '#ffffff',
    colorBgContainerDisabled: '#f1f3f7',
    colorTextDisabled: '#98a3b6',
    borderRadius: 11,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    controlHeight: 38,
    controlHeightLG: 44,
    fontSize: 13,
    fontSizeSM: 12,
    fontSizeLG: 14,
    fontSizeHeading4: 17,
    fontSizeHeading5: 15,
    fontFamily: 'Inter, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    boxShadow: '0 1px 2px rgba(23, 35, 61, 0.035), 0 8px 24px rgba(38, 59, 108, 0.055)',
    boxShadowSecondary: '0 16px 46px rgba(30, 45, 82, 0.11)',
    motionDurationFast: '0.16s',
    motionDurationMid: '0.22s',
  },
  components: {
    Button: {
      defaultShadow: '0 1px 2px rgba(23, 35, 61, 0.035)',
      primaryShadow: '0 7px 16px rgba(49, 95, 244, 0.18)',
      dangerShadow: '0 7px 16px rgba(220, 82, 96, 0.16)',
      controlHeight: 38,
      controlHeightLG: 44,
      contentFontSize: 13,
      contentFontSizeLG: 14,
      contentFontSizeSM: 12,
      fontWeight: 600,
      borderRadius: 10,
      borderColorDisabled: '#dfe4ec',
      paddingInline: 16,
      paddingInlineLG: 20,
      paddingInlineSM: 11,
      defaultHoverBorderColor: '#b7c5dc',
      defaultHoverColor: '#17233d',
      defaultActiveBg: '#f1f4f9',
      defaultActiveBorderColor: '#9fadc2',
      defaultActiveColor: '#17233d',
      linkHoverBg: '#edf2ff',
      textHoverBg: '#f1f4f9',
    },
    Table: {
      headerBg: '#f7f9fd',
      headerColor: '#65728b',
      headerSplitColor: 'transparent',
      borderColor: '#edf1f6',
      rowHoverBg: '#f6f9ff',
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
    },
    Modal: { titleFontSize: 18 },
    Form: { labelFontSize: 13, itemMarginBottom: 16, verticalLabelPadding: '0 0 8px' },
    Input: { inputFontSize: 13, inputFontSizeLG: 14, inputFontSizeSM: 12 },
    Tabs: {
      titleFontSize: 13,
      itemColor: '#697791',
      itemSelectedColor: '#315ff4',
      itemHoverColor: '#224bd4',
      inkBarColor: 'transparent',
      horizontalItemGutter: 4,
      horizontalItemPadding: '7px 15px',
    },
    Tag: { defaultBg: '#f1f4f9', defaultColor: '#60708b' },
    Segmented: { itemSelectedBg: '#ffffff', itemSelectedColor: '#315ff4', trackBg: '#eef2f8' },
    Select: { optionSelectedBg: '#edf2ff' },
    Pagination: { itemActiveBg: '#edf2ff' },
  },
} satisfies NonNullable<React.ComponentProps<typeof ConfigProvider>['theme']>

ConfigProvider.config({
  theme: appTheme,
  holderRender: (children) => (
    <ConfigProvider locale={zhCN} button={buttonConfig} theme={appTheme}>
      {children}
    </ConfigProvider>
  ),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      button={buttonConfig}
      theme={appTheme}
    >
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
