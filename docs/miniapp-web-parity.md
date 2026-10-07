# 小程序管理端与 Web 功能对照

## 范围

Web 端覆盖 `miniprogram/app.json` 中除待办以外的注册页面，不再只验收机构管理角色。机构管理、家长/学员、平台运营、营销公开页和只读分享页按角色拆分为不同 Web 工作区，但继续复用同一业务数据与后端规则。subpackages/todo/pages/todo-list/todo-list 与 subpackages/todo/pages/todo-edit/todo-edit 只在小程序提供，不进入 Web 验收矩阵。

移动端为了单手操作拆开的页面，可以在 Web 合并为标签、抽屉或弹窗；家长端与平台运营端则使用独立导航，避免角色菜单混杂。支付能力在 Web 保留订单和状态逻辑，微信 JSAPI 唤起改为扫码或提示继续在微信完成。

## 页面与功能映射

| 小程序页面/模块 | Web 入口 | Web 实现 |
| --- | --- | --- |
| 登录、协议、隐私 | `/login`、`/legal/agreement`、`/legal/privacy` | 手机号密码、微信扫码登录、协议与隐私页 |
| 首页工作台 | `/home` | 角色工作台、今日/明日课程、指标、老师分组、学员上课记录、快捷入口 |
| 我的 | `/account` | Web 登录密码、运营中心配置的网页端地址展示与复制、全部关联机构与权限、创建新机构 |
| 创建机构、初始化 | `/home`、`/account` | 机构额度、资料、权限、协同管理员、创建后切换与校区引导 |
| 学员列表、添加学员 | `/students` | 校区汇总、状态/老师筛选、搜索、分页、容量预检、新增与编辑 |
| 学员详情 | `/students?studentId=...` | 基本资料、多个学员卡、缴费、销课、费用项、老师调整、结业/恢复/删除 |
| 学员缴费与调整 | 学员详情内 | 课时卡、储值卡、时段卡；新增/续费/补缴/退费/调整；课程与服务分配；有效期和金额校验 |
| 学员快速打卡 | 学员列表与详情内 | 卡片选择、课程/服务选择、老师、重复提示、有效期与余额校验 |
| 学员转校 | 学员详情内 | 多卡选择、目标校区/老师/课程、余额和折扣处理 |
| 课表列表、课表管理 | `/schedule` | 新建、编辑、默认课表、启停、删除、校区分组、角色范围 |
| 课表详情 | `/schedule?timetableId=...` | 周课表、半小时格、创建/移动/编辑/删除/请假/恢复、试听、批量创建、日视图和汇总 |
| 课程管理 | `/courses` | 一对一/班课、老师、简称、单价、开课人数区间（最少/最多）、学员与权益汇总、删除约束 |
| 课时管理 | `/hours` | 时间周期、老师范围、课时明细、删除与汇总 |
| 机构管理、机构工资周期 | `/org` | 基本资料、权限、工资周期、协同管理员、解散机构 |
| 校区管理 | `/campus` | 校区额度、创建/编辑、上线/下线校验、人员和业务快捷入口 |
| 校区服务 | `/campus` 服务项目 | 服务价格、试听、退费费用、启停与编辑 |
| 老师/员工/职位/权限 | `/campus` 老师、职位、权限 | 入职、离职、交接、身份与职位约束、权限预设、管理员范围 |
| 校区工资设置 | `/campus` 工资设置 | 工资项、固定/课时工资、批量设置、金额校验 |
| 教务与校务设置 | `/campus` 教务、校务设置 | 课时规则、试听规则、规章制度、奖惩项 |
| 日常管理 | `/daily` | 奖惩记录新增/编辑/删除、记薪周期归属、制度展示 |
| 缴费管理 | `/payments` | 记录、类型与时间筛选、校区/老师/课程/学员统计、趋势图、下钻明细 |
| 工资管理 | `/salary` | 周期、老师范围、工资构成、发放状态、汇总 |
| 收支管理、财务设置 | `/finance` | 收支分类、收支记录、周期计划、待支出、校区对比图与明细 |
| 经营分析及三类明细 | `/profit` | 校区利润对比图、每日趋势图、课时成本、销课收入、经营支出明细与学员下钻 |
| 营销活动与模板 | `/marketing` | 系统方案、活动模板、新建/编辑/预览、发布/暂停/结束、活动场次与二维码 |
| 营销报名与推广 | `/marketing` 活动详情 | 报名筛选/分页/导出、新老客调整、退款作废、推广榜、奖励发放与作废 |
| 营销入账结算 | `/marketing` 入账结算 | 汇总、活动维度入账、扣减、净额和分页明细 |
| 会员中心 | `/membership` | 套餐、新购/续费/升级、学员扩容、PC 微信扫码支付、支付状态自动确认 |
| 问题反馈 | `/feedback` | 提交、历史记录和状态 |
| 使用文档 | `/guide` | 管理端功能说明与操作入口 |
| 家长/学员工作区 | `/parent/*` | 首页、成员、课程、课表、记录、统计、缴费、活动、我的和机构切换 |
| 家长分享页 | `/parent/share/*` | 只读周课表和课程统计，保持隐私提示与登录保护 |
| 平台运营中心 | `/platform` | 数据总览、用户、机构/校区、订单、反馈、结算、套餐和功能开关 |
| 营销公开页 | `/campaign/:shareCode`、`/my-enrollments`、`/my-referral/:shareCode` | 活动详情、场次与表单、报名/取消、推广进度、奖励、邀请人和海报 |

## 逐页验收矩阵

下表按 `miniprogram/app.json` 注册顺序逐页核对，不以 Web 菜单数量代替页面验收。小程序为了移动端操作会把同一业务拆成多个页面；Web 允许把这些页面合并为同一路由里的标签、抽屉或弹窗，但接口、校验、状态保护和最终业务结果必须一致。

| 小程序页面 | Web 对应位置 | 对齐结论 |
| --- | --- | --- |
| `pages/login/login` | `/login` | 手机号密码登录、协议确认、登录态恢复；微信环境登录在 Web 改为开放平台扫码 |
| `pages/index/index` | `/home` | 管理工作台、今日/明日课程、指标、老师分组、上课记录、快捷入口一致 |
| `pages/students/students` | `/students` | 校区汇总、筛选、搜索、排序、分页、新增、详情、老师调整、快捷打卡一致 |
| `pages/schedule/schedule` | `/schedule` | 人员课表、归档课表、默认课表、周视图和排课入口一致 |
| `pages/class-manage/class-manage` | `/courses` | 一对一/班课、老师、简称、单价、开课人数区间（最少/最多）、学员权益、删除保护一致 |
| `pages/mine/mine` | `/account` 及左侧业务菜单 | 资料、密码、网页端地址展示与复制、机构/校区切换、创建机构、会员与帮助入口一致。图标样式只在小程序切换 |
| `subpackages/account/pages/entry-role/entry-role` | 登录后角色路由 | Web 仅承载机构管理端，按账号角色直接收敛菜单，不重复展示家长端入口选择 |
| `subpackages/account/pages/legal/user-agreement/user-agreement` | `/legal/agreement` | 用户协议一致 |
| `subpackages/account/pages/legal/privacy-policy/privacy-policy` | `/legal/privacy` | 隐私政策一致 |
| `subpackages/student/pages/add-student/add-student` | `/students` 新增/编辑弹窗 | 学员资料、多卡、课程、老师、服务权益、折扣、有效期和容量预检一致 |
| `subpackages/student/pages/payment/payment` | 学员详情“缴费记录”编辑弹窗 | 新增、续费、补缴、退费、调整、转课时、提成分配和卡片绑定一致 |
| `subpackages/student/pages/payment-manage/payment-manage` | `/payments` | 时间/类型/校区/关键字筛选、汇总、趋势、分组统计、分页和下钻一致 |
| `subpackages/student/pages/student-course-records/student-course-records` | 学员详情“上课记录”及 `/hours` | 课程/老师筛选、卡片范围、课时明细和删除返还一致 |
| `subpackages/student/pages/student-detail/student-detail` | `/students?studentId=...` 详情抽屉 | 档案、多卡、缴费、销课、家长权限、费用项、结业/恢复/删除一致 |
| `subpackages/student/pages/student-coach-transfer/student-coach-transfer` | `/students` 批量换老师 | 源老师、目标老师、学员多选、校区范围和结果计数一致 |
| `subpackages/student/pages/parent-fee-items/parent-fee-items` | 学员详情“家长端” | 费用项新增/启停/删除、支付标记、家长访问权限一致 |
| `subpackages/student/pages/parent-fee-item-create/parent-fee-item-create` | 学员详情“家长端”费用方案弹窗 | 专属方案金额、课时、卡片、有效期、启用状态和编辑回显一致 |
| `subpackages/parent/pages/home/home` | `/parent/home` | 成员切换、本周课表、近期动态、课程与缴费快捷入口一致 |
| `subpackages/parent/pages/activities/activities` | `/parent/activities` | 可报名活动、状态、时间、地点和活动落地页下钻一致 |
| `subpackages/parent/pages/courses/courses` | `/parent/courses` | 自建/机构课程、权益摘要、新增、编辑、删除和详情下钻一致 |
| `subpackages/parent/pages/children/children` | `/parent/children` | 家庭成员、展示名、添加、编辑和删除保护一致 |
| `subpackages/parent/pages/timetable/timetable` | `/parent/timetable` | 成员切换、周切换、自建日程增改删、机构课程只读详情与分享一致 |
| `subpackages/parent/pages/course/course` | `/parent/course/:courseId` | 课程资料、缴费、上课记录、权益、编辑/删除和记录维护一致 |
| `subpackages/parent/pages/records/records` | `/parent/records` | 缴费与上课记录切换、成员范围、课程和状态信息一致 |
| `subpackages/parent/pages/course-stats/course-stats` | `/parent/course-stats` | 课程权益、缴费、到课/请假、综合出勤率、周/月趋势和分享一致 |
| `subpackages/parent/pages/pay/pay` | `/parent/pay` | 费用项、金额、订单创建和微信支付衔接提示一致 |
| `subpackages/parent/pages/mine/mine` | `/parent/mine` | 家庭资料、机构切换、活动、反馈和退出登录一致 |
| `subpackages/parent/pages/shared-timetable/shared-timetable` | `/parent/share/timetable/:shareCode` | 登录保护的只读周课表、成员和分享周期一致 |
| `subpackages/parent/pages/shared-course-stats/shared-course-stats` | `/parent/share/course-stats/:shareCode` | 登录保护的只读课程统计与隐私提示一致 |
| `subpackages/admin/pages/onboarding/onboarding` | `/home` 空机构引导 | 创建机构、创建校区、额度和下一步引导一致 |
| `subpackages/admin/pages/create-org/create-org` | `/home`、`/account` 创建机构弹窗 | 名称、资料、配额、创建后切换一致 |
| `subpackages/admin/pages/create-campus/create-campus` | `/home`、`/campus` 创建校区弹窗 | 名称、地址、联系人、联系电话、额度和创建后选中一致 |
| `subpackages/admin/pages/org-manage/org-manage` | `/org` | 机构资料、协同管理员、权限和解散保护一致 |
| `subpackages/admin/pages/org-salary-settings/org-salary-settings` | `/org` 工资周期 | 工资周期起止、查看权限和组织级设置一致 |
| `subpackages/admin/pages/campus-manage/campus-manage` | `/campus` | 校区列表、资料、上下线校验、删除校验和业务下钻一致 |
| `subpackages/admin/pages/campus-service-manage/campus-service-manage` | `/campus` 服务项目 | 服务单价、时长、试听、退费费用、启停与编辑一致 |
| `subpackages/admin/pages/daily-manage/daily-manage` | `/daily` | 奖惩记录增改删、工资周期归属和规章制度一致 |
| `subpackages/admin/pages/feedback-center/feedback-center` | `/feedback` | 分类、联系方式、内容、提交防重、历史状态和回复展开一致 |
| `subpackages/admin/pages/platform-console/platform-console` | `/platform` | 平台管理员权限保护、数据总览、用户、机构/校区、订单、反馈处理、结算打款、套餐和功能开关一致 |
| `subpackages/admin/pages/membership-center/membership-center` | `/membership` | 套餐、新购、续费、升级、学员扩容和支付状态确认一致；Web 使用 Native 二维码支付 |
| `subpackages/admin/pages/salary-manage/salary-manage` | `/salary` | 周期、老师范围、工资构成、发放/撤销、日期、方式和备注一致 |
| `subpackages/admin/pages/campus-salary-settings/campus-salary-settings` | `/campus` 工资设置 | 工资项、固定/课时工资、批量设置、金额校验一致 |
| `subpackages/admin/pages/campus-teacher-setup/campus-teacher-setup` | `/campus` 人员/职位/权限/工资/教务/校务 | 入职、导入、编辑、离职交接、职位、权限、工资项与校务设置一致 |
| `subpackages/admin/pages/coach-manage/coach-manage` | `/campus` 人员设置 | 老师列表、带课身份、校区范围和人员维护一致 |
| `subpackages/schedule/pages/schedule-manage/schedule-manage` | `/schedule` 左侧课表区 | 创建、复制、编辑、默认、归档、恢复、删除和角色范围一致 |
| `subpackages/schedule/pages/create-timetable/create-timetable` | `/schedule` 创建课表弹窗 | 工作日/周末时段、粒度、固定/单周、来源复制和数量上限一致 |
| `subpackages/schedule/pages/timetable-detail/timetable-detail` | `/schedule?timetableId=...` | 周切换、模板/实例、半小时格、批量、拖放、请假、恢复、试听和学员状态一致 |
| `subpackages/finance/pages/payment/payment` | 学员详情“缴费记录”编辑弹窗 | 新增、续费、补缴、退费、调整、转课时、有效期和提成分配一致 |
| `subpackages/finance/pages/payment-manage/payment-manage` | `/payments` | 时间/类型/校区/关键字筛选、汇总、趋势、分组统计、分页和学员下钻一致 |
| `subpackages/finance/pages/finance-manage/finance-manage` | `/finance` | 收支概览、时间范围、待支出、流水增改删和校区对比一致 |
| `subpackages/finance/pages/finance-settings/finance-settings` | `/finance` 收支项目/周期支出 | 分类、周期计划、启停/恢复、历史项目回显和周期提示一致 |
| `subpackages/finance/pages/profit-overview/profit-overview` | `/profit` | 校区利润对比、每日趋势、收入/成本/支出汇总和日期下钻一致 |
| `subpackages/finance/pages/teacher-cost-detail/teacher-cost-detail` | `/profit` 课时成本明细 | 老师分组、课程明细、日期范围和合计一致 |
| `subpackages/finance/pages/revenue-detail/revenue-detail` | `/profit` 销课收入明细 | 课程/学员分组、日期范围、合计和学员下钻一致 |
| `subpackages/finance/pages/operating-expense-detail/operating-expense-detail` | `/profit` 经营支出明细 | 支出类型、明细、日期范围和合计一致 |
| `subpackages/support/pages/user-guide/user-guide` | `/guide` | 机构管理端使用说明与相关功能入口一致 |
| `subpackages/marketing/pages/marketing-center/marketing-center` | `/marketing` | 系统方案、模板、活动、入账结算和功能开关一致 |
| `subpackages/marketing/pages/template-edit/template-edit` | `/marketing` 模板编辑弹窗 | 名称、文案、卖点、规则、排序、启停和长度限制一致 |
| `subpackages/marketing/pages/campaign-edit/campaign-edit` | `/marketing` 活动编辑弹窗 | 模板套用、报名/支付方式、时间、名额、场地、联系人、发布前校验一致 |
| `subpackages/marketing/pages/campaign-detail/campaign-detail` | `/marketing` 活动详情抽屉 | 状态操作、场次、报名、推广、奖励、二维码和统计一致 |
| `subpackages/marketing/pages/campaign-landing/campaign-landing` | `/campaign/:shareCode` | 活动视觉、场次、剩余名额、报名字段、协议、推荐关系、待支付识别、继续支付和状态自动确认一致 |
| `subpackages/marketing/pages/my-enrollment/my-enrollment` | `/my-enrollments` | 我的报名、待支付继续付款、状态、活动下钻和仅允许状态下取消报名一致 |
| `subpackages/marketing/pages/enrollment-list/enrollment-list` | 活动详情“报名” | 筛选、分页、导出、新老客调整和退款/作废一致 |
| `subpackages/marketing/pages/settlement-list/settlement-list` | `/marketing` 入账结算 | 汇总、活动维度入账、扣减、净额和分页一致 |
| `subpackages/marketing/pages/settlement-detail/settlement-detail` | 入账结算明细抽屉 | 活动入账明细、状态和分页一致 |
| `subpackages/marketing/pages/my-referral/my-referral` | `/my-referral/:shareCode` | 推广进度、奖励状态、邀请明细、链接分享和推广海报一致 |
| `subpackages/marketing/pages/poster-preview/poster-preview` | 活动预览及二维码弹层 | 活动预览、分享二维码和下载入口一致 |
| `subpackages/marketing/pages/referral-reward-manage/referral-reward-manage` | 活动详情“推广奖励” | 推广排行、奖励发放、备注、作废原因与状态保护一致 |

## 弹层验收

- Web 不使用原生 `window.alert`、`window.confirm` 或 `window.prompt`，避免浏览器风格弹窗破坏产品一致性。
- 当前业务代码包含 52 个表单 Modal、3 个详情 Drawer、22 个 Popconfirm 和 43 个 `Modal.confirm/info/error/warning/success`，共分布于 36 个业务文件。
- `src/styles/dialogs.css` 统一处理遮罩、圆角、阴影、标题层级、关闭按钮、内容滚动、底部操作区、危险按钮、确认图标、气泡确认和抽屉；业务专属弹层继续保留自己的内容布局。
- 学员快捷打卡和课程选择弹窗使用 `src/styles/work-student-checkin.css` 做专属信息层级，卡片、余额、课程/服务、日期、批量状态和提交动作均保留原业务判断。

## 视觉一致性验收

- `src/styles/global.css` 统一维护正文/辅助/标题字号、4/8/12/16/20/24/32 间距阶梯、32/38/44 控件高度、圆角、卡片表面和 Tab 规格；页面不再各自定义一套基础尺度。
- `src/styles/ui-consistency.css` 统一主 Tab（机构、校区、会员）、二级设置 Tab、首页/课表紧凑 Tab、列表卡片标题、工具栏、表单动作区和弹窗内无 footer 表单的提交按钮。
- `src/styles/dialogs.css` 是最后加载的弹层样式层，统一 Modal、Confirm、Popconfirm、Popover 和 Drawer；快捷打卡、课表格详情只保留业务内容布局，不改变统一的遮罩、层级和控件规格。
- 静态 `Modal.confirm/info/error/warning/success` 通过 `ConfigProvider.config` 复用主应用主题，不再产生独立默认主题或上下文警告。
- 视觉层级固定为：页面标题 27px、弹层/大分区标题 18px、卡片标题 15px、正文 13px、辅助文案 12px、微型状态 11px；信息图表和营销海报中的展示数字可按业务需要放大。
- 周课表在 1440×900 标准桌面宽度下完整显示周一至周日，较窄工作区继续使用课表内部横向滚动，不压缩操作按钮或课程文字到不可读。
- 普通长表单弹窗保留上下视口安全区；新增学员、创建课表等表单在 1440×900 下标题、滚动区和末尾操作均完整可达。
- 单个或少量校区的收支/经营图表居中分布，校区名称放宽显示；反馈表单限制舒适阅读宽度，避免超宽输入行和失衡留白。
- `npm run check:ui-contract` 会阻止设计令牌缺失、弹层样式加载顺序回退和新增浏览器原生 `window.alert/confirm/prompt`。

## 日历与日期选择验收

- Web 业务页不再使用浏览器原生 `input[type=date]` 或 `input[type=datetime-local]`；33 个日期入口统一收敛到 `BusinessDatePicker`、`BusinessDateRangePicker`、`BusinessDateTimePicker` 和 `BusinessMultiDatePicker`。
- 单日日历面板宽 390px、日期格约 40px，并统一中文年月、中文星期、月份/年份切换、今天快捷入口、选中/今天/禁用状态和高层级阴影。
- 财务、课时、缴费和经营分析的自定义区间改为双面板范围日历，支持今天、昨天、本周、本月快捷范围，同时保留原开始/结束日期参数。
- 营销报名起止时间使用同一视觉体系的日期时间选择器，提交格式仍为后端原有的 `YYYY-MM-DDTHH:mm`。
- 学员打卡与小程序 `datepickersingle` 对齐：支持单选/批量切换、日历内多日期选择、今天/昨天/清空、有效期起止、不能选择未来日期、已打卡日期标记、重复日期确认和批量接口提交。
- 桌面端打卡弹窗使用 920px 双栏布局，把打卡内容与日期并列；在 1920×878 实测中主体 `scrollHeight === clientHeight`，无需滚动即可完成选择和提交。较窄屏幕自动回退为单栏和安全滚动。
- `npm run check:ui-contract` 会阻止重新加入原生日期输入，避免后续页面绕过统一日历。

## 交互事件验收

页面映射不以“能打开”为完成标准。每个入口同时覆盖小程序中的点击、输入、筛选、切换、确认、撤销、分页/加载更多、状态保护和下钻事件：

| 领域 | PC 交互合同 |
| --- | --- |
| 首页 | 今日/明日切换、刷新、校区联动、老师课表下钻、单学员上课记录弹层与加载更多、快捷入口 |
| 学员 | 搜索、状态/卡类型/老师/排序筛选、分页、汇总卡联动、新增/编辑、批量换老师、快捷打卡、详情下钻 |
| 学员详情 | 多卡切换、档案修改、老师分配、归档/恢复/删除保护、缴费/调整/补缴/退费、销课编辑/删除、转校、家长权限与费用项 |
| 课程 | 一对一/班课切换、老师和学员选择、简称、单价、开课人数区间（最少/最多）、新增/编辑/删除约束、详情查看 |
| 课表 | 使用中/归档切换、校区折叠、默认课表、创建/编辑/复制/归档/恢复/删除、周切换、搜索与汇总 |
| 排课 | 半小时格点击与拖放、创建/编辑/占用、批量创建/删除、移动/复制、请假/恢复、试听、学员参与状态、整日课程与周总览 |
| 机构/校区 | 机构资料、权限、工资周期、协同管理员、解散保护；校区筛选、额度、新建/编辑、上下线/删除校验、电话与业务下钻 |
| 人员与设置 | 老师入职/编辑/离职/删除/交接、跨校导入、职位、权限预设、工资项与金额、教务规则、服务/体验类型、校务制度与奖惩项 |
| 日常/课时 | 奖惩记录新增/编辑/删除、记薪周期归属；课时周期、老师筛选、汇总、明细和删除 |
| 缴费/财务 | 日期和类型筛选、汇总卡和分组下钻、趋势、明细分页；收支项目、周期支出、待支出、收支记录增改删、校区对比 |
| 工资/经营 | 周期切换、人员展开、发放/撤销与日期备注；利润周期、校区图表、日趋势、成本/收入/支出明细及学员下钻 |
| 营销 | 方案/模板创建、草稿保存、发布/暂停/恢复/结束、场次增改关删、名额保护、报名筛选与作废、奖励发放/作废、结算明细 |
| 家长/学员 | 成员增改删、课程与自建日程增改删、周课表、记录、权益统计、趋势、费用订单、活动与机构切换、只读分享 |
| 营销公开页 | 活动场次、动态报名字段、推荐关系、报名/取消、待支付恢复、小程序支付引导、状态轮询、推广进度、邀请明细和海报 |
| 平台运营 | 平台管理员权限保护、总览分页、用户与机构查询、订单、反馈处理、套餐编辑、功能开关和结算打款 |
| 账号/会员/支持 | 密码与机构权限、机构/校区切换、创建机构；套餐/续费/升级/扩容和扫码支付状态；反馈提交/历史展开、使用文档 |

## 共用接口

- Web 和小程序均请求同一个 Spring Boot 服务及同一批业务资源，例如 `/students/**`、`/schedules/**`、`/finance/**`、`/marketing/**`。
- Web 会发送与小程序一致的 JWT、`X-Org-Id` 和校区参数，机构及校区切换后重新加载上下文。
- 家长营销公开页通过 `POST /marketing/landing/web-login` 将已登录 Web 用户安全映射到隔离的营销身份，再沿用小程序的 `X-Marketing-Token` 接口；营销令牌过期不会清除主 Web 登录态。
- 会员小程序继续使用 JSAPI 支付；PC Web 使用同一订单、回调和状态查询逻辑，通过新增的 Native 支付入口返回二维码：
  - `POST /auth/membership/create-native-payment`
  - `POST /auth/membership/addon/create-native-payment`
  - 支付结果仍由原 `/pay/status/{orderNo}` 接口确认。
- 营销报名页会识别既有待支付报名，Web 统一引导回小程序完成同一笔报名的支付，不重复创建报名或订单；页面会自动轮询并确认支付结果。
- 平台营销功能开关 `/platform-features` 会同步控制 Web 的营销入口和路由。

## 工程约束与验证

- 页面按领域拆分；`npm run check:source-size` 强制 `src` 中所有 TypeScript、TSX 和 CSS 文件不超过 800 行。
- 视觉合同：`npm run check:ui-contract`
- 页面与行为合同：`npm run check:parity` 会读取小程序 `app.json`，保证除待办列表和待办编辑外的每一个注册页面都出现在逐页验收矩阵中，并校验机构端角色路由、登录回跳、OAuth state、新增学员多卡和营销续付等关键实现没有回退。
- 浏览器回归：登录/协议页和 17 个机构业务路由按真实数据加载；可见 Tab 实测统一为 32px 高、13px 字号，并抽查普通表单 Modal、长表单、Confirm、快捷打卡、学员详情、校区设置和标准桌面完整周视图。
- 路由页面使用懒加载，避免所有业务页一次性进入首屏。
- Web 生产构建：`npm run build`
- 后端编译：`mvn clean compile -DskipTests`
- 后端全量测试：`mvn test`（当前 1321 项，0 失败、0 错误）

## 独立客源管理

| 小程序页面 | Web 入口与行为 |
| --- | --- |
| `subpackages/leads/pages/list/list` | `/leads`：客源概况、搜索、销售/状态/渠道/跟进时间筛选、分页 |
| `subpackages/leads/pages/edit/edit` | `/leads` 新建/编辑弹窗：资料录入、销售分配 |
| `subpackages/leads/pages/detail/detail` | `/leads?leadId=...`：档案、操作时间线、分页历史 |
| `subpackages/leads/pages/follow/follow` | 详情内记录跟进：沟通方式、结果、状态及下次跟进时间 |

共用 `/api/leads` 接口，数据按机构隔离，不绑定校区；只读取销售职位人员，不创建学员、课表、课程、缴费或营销关系。当前机构成员均可操作，客源细分权限留待后续。状态为新客源、已联系、有意向、待成交、已成交、已结束；已成交/已结束会清空跟进计划，重新跟进可恢复状态。时间以北京时间记录。销售负责人可暂不分配，记录跟进前需分配本机构在职销售。历史记录追加保存，不提供修改或删除。

启用方式：后端使用现有 AutoTable update 模式创建 `customer_lead`、`customer_lead_event` 两张表；部署或重启新版本后端后，再发布两端。客源入口位于 Web 的「客户跟进」导航和首页，小程序首页及「我的 → 客户跟进」。无在职销售时可先录入，再通过现有人员职位配置添加销售后分配。

首轮隔离验收（2026-10-04）：Web `npm run build` 通过；隔离浏览器测试数据走通录入、销售分配、跟进状态变更、历史回显、搜索、重置与空结果；小程序客源模块 TypeScript 检查（跳过既有第三方类型声明）、微信 WXML/WXSS 编译及 `leads-workflow.test.ts` 通过；后端 `CustomerLeadServiceTest` 8 项真实 H2 SQL/事务测试通过，覆盖机构隔离、销售范围、字段清空、并发版本冲突、审计失败回滚、筛选分页、到期统计和状态恢复。该轮使用隔离测试数据，未进行真机验收。

全量回归基线：后端 1328 项中原有 FinanceTimeWindowServiceTest 的 4 项报错；修改前 HEAD 的 1320 项复现相同 4 项。小程序既有 646 个测试脚本中 87 个失败，使用修改前 HEAD 对照复现（涉及跨仓库的脚本已补齐同版后端路径核对）；新增客源运行测试通过。上述旧失败不属于本次客源模块。

### 本地联调与界面复核（2026-10-04）

使用已启动的本地后端 `127.0.0.1:8081` 和微信开发者工具 iPhone 16 模拟器复核，不替换接口响应。健康检查显示服务与 MySQL 正常。

- 实际走通首页和「我的」两处入口、录入、编辑、可选年龄清空、返回后数据刷新、录入与修改时间线、关键词空结果、重置和状态选择筛选。
- 在当前机构创建了 2 条明确标记“非真实客户”的记录：小程序录入的 `验收客源1004`（ID 1）和 Web 录入的 `Web验收1004`（ID 2）；经用户授权，另新增“销售”职位及“验收测试销售”（人员 ID 75，测试电话 19900001006，在职、非带课老师）。未修改已有客户、人员、课表或财务数据。
- 修复小程序原生按钮宽度覆盖导致底部按钮偏窄；校验错误现在同时显示轻提示与固定保存区提示，修改字段后消除旧提示，并为提示预留滚动空间。
- 优化首次加载状态、筛选空结果的重置入口、长销售姓名和资料的换行截断、录入时间线重复标题。
- Web 增加持续显示的保存错误提示、未来跟进时间校验、筛选空结果的重置按钮、长姓名布局及历史记录加载中的重复点击保护。Web 构建与小程序客源流程测试、范围内类型检查通过。
- Web 登录后实际走通录入、编辑、空白姓名和无效电话校验、关键词空结果、重置、客户状态及渠道筛选、详情历史；Web 新建记录在小程序中可见，小程序创建和编辑的资料也在 Web 中正确回显。
- 双端并发编辑实测：保持 Web 旧表单，先从小程序保存新版本，再提交 Web 旧版本；服务端拒绝覆盖，Web 持续显示“客源已被更新，请刷新详情后重试”，刷新后可以继续编辑。拒绝的备注未写入历史或覆盖现有备注。
- 切换到另一个已加入的机构后，列表和统计为空；打开原机构的客源详情链接会显示“客源不存在或不属于当前机构”。测试后已恢复最初机构。
- Web 在 1440×1000 和项目最小桌面宽度 1160×800 下检查了列表、详情、编辑及错误提示布局。运行日志未发现 JavaScript 错误。临时视口设置已恢复。
- 补充 HTTP 接口测试通过：使用真实控制器、全局异常处理和 SQL 事务服务，验证两端的 ISO 日期时间请求、保存后日期回显、年龄范围校验、过去时间拒绝、成交清空计划和历史记录。`CustomerLeadServiceTest` 当前 9 项全部通过。
- 新增销售后完成实际双端验收：Web 为 ID 2 分配销售并记录电话沟通、已联系和次日 15:30 回访；小程序正确回显，并新增微信沟通、有意向和次日 10:00 回访，Web 同步正确。Web 标记已成交后，两端均清空当前计划，历史计划仍留在时间线。
- 小程序为 ID 1 分配销售并标记已结束，Web 随后重新跟进为待成交并安排次日 16:00 回访，小程序正确回显。最终 ID 1 为待成交、2 次跟进；ID 2 为已成交、3 次跟进。列表统计为 2 条客源、0 条新客源、0 条待分配、1 条成交；销售筛选、待分配空结果和重置均符合预期。
- 实际检查小程序跟进表单、原生状态/方式/日期/时间选择器、空内容提示、过去时间拒绝、保存中按钮禁用、成交/结束提示和跟进历史布局；界面与数据流程未发现未解决问题。小程序使用微信开发者工具模拟器，本轮未做物理手机测试。
- 修复准备销售时发现的人员设置问题：打开新增人员表单重新加载职位，新增职位立即可选；移除新增职位弹窗挂载前的表单重置，消除首次打开的未连接表单警告。复测弹窗取消后清空、销售选项加载通过，未新增运行错误。最终 Web 生产构建及三项工程合同检查通过。
