import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const miniappRoot = resolve(root, '../timetable_miniapp1/miniprogram')
const app = JSON.parse(readFileSync(join(miniappRoot, 'app.json'), 'utf8'))
const document = readFileSync(join(root, 'docs/miniapp-web-parity.md'), 'utf8')
const routes = readFileSync(join(root, 'src/App.tsx'), 'utf8')

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
  '/platform',
  '/campaign/:shareCode',
  '/my-enrollments',
  '/my-referral/:shareCode',
]
const missingRoutes = requiredRoutes.filter((route) => !routes.includes(`path="${route}"`))

if (missingPages.length || missingRoutes.length) {
  if (missingPages.length) console.error(`逐页验收矩阵缺少：\n- ${missingPages.join('\n- ')}`)
  if (missingRoutes.length) console.error(`Web 路由缺少：\n- ${missingRoutes.join('\n- ')}`)
  process.exit(1)
}

console.log(`小程序页面映射检查通过（${registeredPages.length} 个注册页面，${requiredRoutes.length} 个角色专属 Web 路由）`)
