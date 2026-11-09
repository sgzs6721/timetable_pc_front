import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Separate preview entry: no production APIs, authentication, or persistent writes.
const server = await createServer({
  configFile: false,
  plugins: [react()],
  optimizeDeps: { entries: ['tests/parity-preview.html'] },
  resolve: { alias: [{ find: /^\.\.\/api\/biz$/, replacement: fileURLToPath(new URL('../tests/parity-fixtures.ts', import.meta.url)) }] },
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
})
await server.listen()
console.log('Parity preview: http://127.0.0.1:5178/tests/parity-preview.html')
