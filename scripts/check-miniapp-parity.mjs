import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const miniappRoot = resolve(root, '../timetable_miniapp1/miniprogram')
const app = JSON.parse(readFileSync(join(miniappRoot, 'app.json'), 'utf8'))
const document = readFileSync(join(root, 'docs/miniapp-web-parity.md'), 'utf8')
const routes = readFileSync(join(root, 'src/App.tsx'), 'utf8')
const http = readFileSync(join(root, 'src/api/http.ts'), 'utf8')
const session = readFileSync(join(root, 'src/session.ts'), 'utf8')
const passwordLogin = readFileSync(join(root, 'src/pages/LoginPage.tsx'), 'utf8')
const wechatLogin = readFileSync(join(root, 'src/pages/WechatCallbackPage.tsx'), 'utf8')
const wechatAuth = readFileSync(join(root, 'src/wechat-auth.ts'), 'utf8')
const institutionRouteGuard = readFileSync(join(root, 'src/routing/InstitutionRouteGuard.tsx'), 'utf8')

function source(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

const registeredPages = [
  ...app.pages,
  ...app.subPackages.flatMap((subPackage) => subPackage.pages.map((page) => `${subPackage.root}${page}`)),
]
// Web 只承载机构管理后台；待办、家长/学员工作区与学员营销落地页只在小程序提供。
const webExcludedPages = new Set(registeredPages.filter((page) => page.startsWith('subpackages/parent/pages/') || [
  'subpackages/todo/pages/todo-list/todo-list',
  'subpackages/todo/pages/todo-edit/todo-edit',
  'subpackages/marketing/pages/campaign-landing/campaign-landing',
  'subpackages/marketing/pages/my-enrollment/my-enrollment',
  'subpackages/marketing/pages/my-referral/my-referral',
].includes(page)))
const missingPages = registeredPages.filter((page) => !webExcludedPages.has(page) && !document.includes(`\`${page}\``))

const requiredRoutes = [
  '/home',
  '/account',
  '/students',
  '/schedule',
  '/courses',
  '/hours',
  '/org',
  '/campus',
  '/daily',
  '/payments',
  '/salary',
  '/finance',
  '/profit',
  '/membership',
  '/marketing',
  '/leads',
  '/guide',
  '/feedback',
]
const missingRoutes = requiredRoutes.filter((route) => !routes.includes(`path="${route}"`))
const authContractFailures = []
if (!routes.includes('rememberLoginRedirect(target)')
  || !routes.includes('location.pathname')
  || !routes.includes('location.search')
  || !routes.includes('location.hash')) {
  authContractFailures.push('受保护路由必须保存包含 query/hash 的原始深链')
}
if (!session.includes('LOGIN_REDIRECT_TTL_MS')
  || !session.includes('target.origin !== window.location.origin')
  || !session.includes('sessionStorage.removeItem(LOGIN_REDIRECT_KEY)')) {
  authContractFailures.push('登录回跳必须同源、限时并且一次性消费')
}
if (!passwordLogin.includes('consumeLoginRedirect()') || !wechatLogin.includes('consumeLoginRedirect()')) {
  authContractFailures.push('密码登录与微信扫码登录都必须消费原始深链')
}
if (!passwordLogin.includes('网页管理端仅供机构员工使用') || !wechatLogin.includes('网页管理端仅供机构员工使用')) {
  authContractFailures.push('家长与学员账号必须被 Web 管理后台拒绝并引导至小程序')
}
if (routes.includes('/parent/') || routes.includes('/campaign/:shareCode') || routes.includes('/my-enrollments') || routes.includes('/my-referral/')) {
  authContractFailures.push('Web 管理后台不能注册家长、学员或公开报名路由')
}
if (!http.includes('rememberLoginRedirect(returnTarget)')) {
  authContractFailures.push('登录态过期的 401 也必须保存当前深链')
}
if (!http.includes('clearAuthentication()') || http.includes('clearSession()')) {
  authContractFailures.push('登录接口失败只能清理持久认证，不能清除待消费深链或 OAuth state')
}
if (!http.includes("resolveApiBaseUrl().replace(/\\/+$/, '')")
  || http.includes("replace(/\\/api\\/?$/, '')")) {
  authContractFailures.push('头像与营销海报的 /files 相对地址必须保留后端 /api context path')
}
if (!session.includes('window.crypto.getRandomValues(bytes)')
  || !session.includes('WECHAT_OAUTH_STATE_TTL_MS')
  || !session.includes('sessionStorage.removeItem(WECHAT_OAUTH_STATE_KEY)')
  || !passwordLogin.includes('createWechatOAuthState()')
  || !wechatAuth.includes('state,')
  || !wechatLogin.includes("consumeWechatOAuthState(callbackState)")) {
  authContractFailures.push('微信扫码登录必须使用随机、限时、一次性校验的 OAuth state')
}
if (!routes.includes('<Route element={<InstitutionRouteGuard />}>')
  || !institutionRouteGuard.includes('navForUser(shell.user, currentOrg)')
  || !institutionRouteGuard.includes('status="403"')
  || !institutionRouteGuard.includes("'/home', '/account', '/membership', '/guide', '/feedback'")) {
  authContractFailures.push('机构业务路由必须在请求页面数据前按账号角色拦截越权直达')
}
if (!routes.includes('path="/maintenance"')
  || !http.includes('isMaintenanceResponse(error?.response?.status')
  || !source('src/pages/MaintenancePage.tsx').includes('/auth/validate?_maintenance_check=')) {
  authContractFailures.push('HTTP 503 + 50301 必须进入公开维护页，并支持不经过拦截器的恢复检测')
}

const behaviorContracts = [
  {
    label: '新增学员必须默认选择性别但不预建卡，并完整提交多卡、课程与老师关系',
    file: 'src/pages/student-profile.tsx',
    need: [
      'initialValues={{ gender: 1, cards: [] }}',
      "courseCategory: activeCardCategory === 'HOURS'",
      'oneToOne: false',
      'coachMemberId: coachIds[0]',
      'coachMemberIds: coachIds',
      'cards: payloads',
      'props.onSaved(created)',
      'normalizeCardConfigDraftOrder(values.cards || [])',
      'cardDraftError(',
      'birthDateMax()',
    ],
  },
  {
    label: '新增成功必须回到新学员详情，新增和筛选的老师源只请求带课人员',
    file: 'src/pages/StudentsPage.tsx',
    need: ['setParams({ studentId: String(student.id) })', 'onlySubstitute: true', "'/students/create-eligibility'", 'checkingStudentCapacity'],
  },
  {
    label: '转校必须包含内部一对一课程，允许多卡同时转移，并对目标老师做带课身份筛选',
    file: 'src/pages/student-campus-transfer.tsx',
    need: ['includeInternal: true', 'onlySubstitute: true', 'filter(isActiveTeachingCoach)', 'selected: !disabled && event.target.checked'],
  },
  {
    label: '打卡必须按当前课程老师优先排序，至少选1位且不超过课程配置人数',
    files: ['src/pages/checkin-options.ts', 'src/pages/student-card-desk.tsx', 'src/pages/student-quick-checkin.tsx', 'src/pages/student-checkins.tsx'],
    need: ["label === '未命名课程'", 'buildCheckInCoachSelection(', 'maxCount', 'coachIds', '至少选择 1 位'],
  },
  {
    label: '固定课表对比必须过滤删除标记，并把跨行取消时段保持为单一连续块',
    files: ['src/pages/schedule-board-helpers.tsx', 'src/pages/SchedulePage.tsx', 'src/pages/schedule-cell-dialog.tsx', 'src/styles/work-schedule-board.css'],
    need: ['Number(row.uiChangeStatus) !== 3 && Number(row.uiChangeStatus) !== 4', 'subtractMinuteRange(range, blockers)', 'left < lessonEnd && right > lessonStart', 'templateMode ? visibleLeaveSlices(lesson, own, cancelMarks) : []', '<em>班级</em>', '让跨行的固定课仍是一个完整取消框'],
  },
  {
    label: '本周拖动固定课实例不能修改模板，拖动时必须隔离页面回弹',
    files: ['src/pages/schedule-mutations.ts', 'src/pages/SchedulePage.tsx', 'src/styles/work-schedule-board.css'],
    need: [
      'if (isVirtualTemplateInstance(schedule, timetable))',
      "await postJson<Schedule>('/schedules/cell', instanceCell(schedule, timetable, campusId, {",
      'scheduleDate: target.date,',
      "document.documentElement.classList.toggle('schedule-dragging', active)",
      'overscroll-behavior: contain;',
      'body.schedule-dragging',
    ],
  },
  {
    label: '课表管理员必须刷新权限并使用机构全量校区与课表视图',
    files: ['src/pages/schedule-controller.ts', 'src/pages/schedule-dialogs.tsx'],
    need: [
      "getJson<Campus[]>('/campus/list', { timetableView: true })",
      "managerView ? { status } : { campusId, status }",
      'shell.reload()',
      'scheduleCampuses',
      'activeTimetableCampusId',
      'canManageCurrent',
      "ids.every((id) => canManageCampus(id))",
    ],
  },
  {
    label: '课表有效期、已实例化周次与老师历史排课权限必须和小程序一致',
    files: ['src/pages/schedule-policy.ts', 'src/pages/schedule-controller.ts', 'src/pages/SchedulePage.tsx', 'src/pages/schedule-timetable-forms.tsx', 'src/pages/campus-staff.tsx'],
    need: [
      '结束日期只能往后延长',
      '排课日期不能早于课表开始日期',
      'dateRangeIncludesDayOfWeek',
      '该星期不在课表日期范围内',
      'assertTemplateDayManageable',
      '管理员未开启老师修改历史课表权限',
      '/instantiated-weeks',
      'teacherPastScheduleEditable',
      'coachId: values.occupy',
      '<TimetableDateFields original={props.current} />',
    ],
  },
  {
    label: '客源录入必须优先当前校区、限制姓名长度并保护销售人员筛选名单',
    files: ['src/pages/LeadsPage.tsx', 'src/pages/leads-editor.tsx', 'src/pages/leads-detail.tsx', 'src/pages/leads-model.ts', 'src/access.ts', 'src/nav.ts'],
    need: [
      'currentCampusId={shell.campusId}',
      '客户姓名不能超过6个字',
      '联系人不能超过6个字',
      'canFilterLeadSalespeople',
      'canFilterOwners ? <Select',
      'canAssignOwner={canFilterOwners}',
      'LEAD_PHONE_MAX_LENGTH = 11',
      'nextFollowContent',
      '请填写下次跟进事项',
    ],
  },
  {
    label: '销售岗位（包括带课销售）必须按客源校区只读查看学员、课程和活动课表',
    files: ['src/access.ts', 'src/nav.ts', 'src/pages/StudentsPage.tsx', 'src/pages/CoursesPage.tsx', 'src/pages/schedule-controller.ts', 'src/pages/SchedulePage.tsx'],
    need: [
      'hasSalesCampusScope',
      'isSalesReadOnlyUser',
      'user?.isSubstituteTeacher !== true',
      'SALES_READ_ONLY_NAV',
      "{ key: 'schedule', label: '校区课表', path: '/schedule' }",
      'canViewLeads(shell.user, currentOrg)',
      'canViewLeadCampus(shell.user, campusId)',
      'const canViewAllStudents = canManageRole || salesReadOnly',
      'const canViewAllCourses = canManageCourses || salesReadOnly',
      '销售岗位仅可查看负责校区',
      'if (salesCampusView) return false',
      "Number(item.isDefault) === 1",
      "title={salesCampusView ? '校区课表'",
    ],
  },
  {
    label: '退费允许只退金额，不能强制填写正课或赠课扣减',
    file: 'src/pages/student-payments.tsx',
    need: [
      'if (type === \'refund\' && hoursCard) {',
      'if (hours > regularAvailable)',
      'if (gift > giftAvailable)',
    ],
    reject: ['请填写退费正课', '请填写退费赠课'],
  },
  {
    label: '跨校区导入人员仅机构管理员或协同管理员可用',
    files: ['src/pages/CampusPage.tsx', 'src/pages/campus-staff.tsx'],
    need: ['canImportCampusStaff={canImportCampusStaff}', '仅机构管理员或协同管理员可导入'],
  },
  {
    label: '转入流水仅可改有效期，补缴有效期不能早于补缴日期',
    files: ['src/pages/student-transfer-record-editor.tsx', 'src/pages/student-payments.tsx', 'src/pages/student-payment-editor.tsx'],
    need: [
      '仅可修改有效期，转入来源和转出目标保留系统生成内容',
      "return '补缴有效期不能早于补缴日期'",
      'minDateMessage="补缴有效期不能早于补缴日期"',
    ],
  },
  {
    label: '校区编辑锁定负责人电话，课程定价切换卡类型保留独立草稿',
    files: ['src/pages/CampusPage.tsx', 'src/pages/campus-course-pricing.tsx'],
    need: [
      "if (!current) {",
      "disabled={editing !== 'new'}",
      'type CategoryDrafts = Record<CardCategory, CategoryDraft>',
      '[draft.category]: {',
      'const target = categoryDrafts[category]',
    ],
  },
  {
    label: '校区服务必须按校区支持微信支付分账资料校验、检测保存、停用和只读比例',
    files: ['src/pages/CampusPage.tsx', 'src/pages/campus-profit-sharing.tsx'],
    need: [
      '`/campus/${id}/profit-sharing`',
      "!/^\\d{8,32}$/.test(normalizedMerchantId)",
      '商户法定全称不能超过100个字',
      "save('商户资料检测通过')",
      'void disable()',
      '由平台管理员设置，校区端仅展示',
      "key: 'profitSharing'",
    ],
  },
  {
    label: '营销入口必须同时服从平台开关、访问模式、会员状态和角色路由',
    files: ['src/access.ts', 'src/layouts/AppShell.tsx', 'src/routing/InstitutionRouteGuard.tsx'],
    need: [
      'normalizeFeatureAccessMode',
      "mode === 'developing'",
      "mode === 'members' && !isPaidMember(user)",
      'marketingAccessProblem',
      'shell.marketingEnabled',
      'shell.marketingAccessMode',
    ],
  },
  {
    label: '校区设置必须包含学员删除关联记录策略，老师交接必须能查看有效学员卡名单',
    files: ['src/pages/campus-academic.tsx', 'src/pages/campus-staff-handover.tsx'],
    need: ['deletePaymentRecordsOnStudentDelete', 'deleteCheckInRecordsOnStudentDelete', 'activeCardStudents', '有效学员卡名单'],
  },
  {
    label: '服务类学员卡除退费外必须保留至少一个服务类别',
    file: 'src/pages/student-payment-editor.tsx',
    need: ["values.type !== 'refund'", '请选择服务类别'],
  },
  {
    label: '首页快捷入口必须按角色、会员状态和校区状态收敛',
    files: ['src/pages/HomePage.tsx', 'src/pages/home-actions.ts'],
    need: ['MANAGER_QUICK_ACTIONS', 'TEACHER_QUICK_ACTIONS', 'MEMBER_QUICK_ACTIONS', 'navForUser(', 'subscriptionBlocksPath(', 'disabledReason'],
  },
]

const behaviorContractFailures = behaviorContracts.flatMap((contract) => {
  const contents = (contract.files || [contract.file]).map(source).join('\n')
  const missing = contract.need.filter((needle) => !contents.includes(needle))
  const forbidden = (contract.reject || []).filter((needle) => contents.includes(needle))
  return [
    ...(missing.length ? [`${contract.label}（缺少：${missing.join('、')}）`] : []),
    ...(forbidden.length ? [`${contract.label}（仍包含：${forbidden.join('、')}）`] : []),
  ]
})

if (missingPages.length || missingRoutes.length || authContractFailures.length || behaviorContractFailures.length) {
  if (missingPages.length) console.error(`逐页验收矩阵缺少：\n- ${missingPages.join('\n- ')}`)
  if (missingRoutes.length) console.error(`Web 路由缺少：\n- ${missingRoutes.join('\n- ')}`)
  if (authContractFailures.length) console.error(`认证与角色入口契约缺少：\n- ${authContractFailures.join('\n- ')}`)
  if (behaviorContractFailures.length) console.error(`关键功能行为契约缺少：\n- ${behaviorContractFailures.join('\n- ')}`)
  process.exit(1)
}

console.log(`小程序页面与行为映射检查通过（${registeredPages.length} 个注册页面，其中 ${webExcludedPages.size} 个仅小程序页面不要求 Web 对照，${requiredRoutes.length} 个角色专属 Web 路由，${behaviorContracts.length} 组关键行为合同）`)
