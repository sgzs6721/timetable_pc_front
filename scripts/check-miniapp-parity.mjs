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
const institutionRouteGuard = readFileSync(join(root, 'src/routing/InstitutionRouteGuard.tsx'), 'utf8')

function source(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

const registeredPages = [
  ...app.pages,
  ...app.subPackages.flatMap((subPackage) => subPackage.pages.map((page) => `${subPackage.root}${page}`)),
]
const missingPages = registeredPages.filter((page) => !document.includes(`\`${page}\``))

const requiredRoutes = [
  '/parent/home',
  '/parent/activities',
  '/parent/courses',
  '/parent/children',
  '/parent/timetable',
  '/parent/course/:courseId',
  '/parent/records',
  '/parent/course-stats',
  '/parent/pay',
  '/parent/mine',
  '/parent/share/timetable/:shareCode',
  '/parent/share/course-stats/:shareCode',
  '/campaign/:shareCode',
  '/my-enrollments',
  '/my-referral/:shareCode',
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
  || !passwordLogin.includes('state=${encodeURIComponent(oauthState)}')
  || !wechatLogin.includes("consumeWechatOAuthState(callbackState)")) {
  authContractFailures.push('微信扫码登录必须使用随机、限时、一次性校验的 OAuth state')
}
if (!routes.includes('<Route element={<InstitutionRouteGuard />}>')
  || !institutionRouteGuard.includes('navForUser(shell.user, currentOrg)')
  || !institutionRouteGuard.includes('status="403"')
  || !institutionRouteGuard.includes("'/home', '/account', '/membership', '/guide', '/feedback'")) {
  authContractFailures.push('机构业务路由必须在请求页面数据前按账号角色拦截越权直达')
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
    need: ['setParams({ studentId: String(student.id) })', 'onlySubstitute: true'],
  },
  {
    label: '转校必须包含内部一对一课程，并对目标老师做服务端与前端双重带课身份筛选',
    file: 'src/pages/student-campus-transfer.tsx',
    need: ['includeInternal: true', 'onlySubstitute: true', 'filter(isActiveTeachingCoach)'],
  },
  {
    label: '首页快捷入口必须按角色、会员状态和校区状态收敛',
    file: 'src/pages/HomePage.tsx',
    need: ['MANAGER_QUICK_ACTIONS', 'TEACHER_QUICK_ACTIONS', 'MEMBER_QUICK_ACTIONS', 'navForUser(', 'subscriptionBlocksPath(', 'disabledReason'],
  },
  {
    label: '营销待支付报名必须隔离账号与活动，复用已有订单并引导到小程序确认支付',
    files: ['src/marketing-public/MarketingLandingPage.tsx', 'src/marketing-public/MarketingMyPages.tsx', 'src/api/marketing-public.ts'],
    need: ['createdEnrollmentId', 'loadSequence', 'view.shareCode !== shareCode', 'window.setInterval(', 'openPayGuide()', '不会创建重复报名', '前往小程序支付', 'OWNER_TOKEN_KEY', 'getToken() !== accountToken'],
  },
]

const behaviorContractFailures = behaviorContracts.flatMap((contract) => {
  const contents = (contract.files || [contract.file]).map(source).join('\n')
  const missing = contract.need.filter((needle) => !contents.includes(needle))
  return missing.length ? [`${contract.label}（缺少：${missing.join('、')}）`] : []
})

if (missingPages.length || missingRoutes.length || authContractFailures.length || behaviorContractFailures.length) {
  if (missingPages.length) console.error(`逐页验收矩阵缺少：\n- ${missingPages.join('\n- ')}`)
  if (missingRoutes.length) console.error(`Web 路由缺少：\n- ${missingRoutes.join('\n- ')}`)
  if (authContractFailures.length) console.error(`认证与角色入口契约缺少：\n- ${authContractFailures.join('\n- ')}`)
  if (behaviorContractFailures.length) console.error(`关键功能行为契约缺少：\n- ${behaviorContractFailures.join('\n- ')}`)
  process.exit(1)
}

console.log(`小程序页面与行为映射检查通过（${registeredPages.length} 个注册页面，${requiredRoutes.length} 个角色专属 Web 路由，${behaviorContracts.length} 组关键行为合同）`)
