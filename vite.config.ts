import net from 'node:net'
import { defineConfig, type HttpServer, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const API_PORT = 8081

function apiTargetForHost(hostHeader: string | undefined): string {
  const raw = hostHeader || ''
  const hostname = raw.startsWith('[')
    ? raw.slice(1).split(']')[0]
    : raw.split(':')[0]
  if (hostname === 'localhost' || hostname === '::1') {
    return `http://localhost:${API_PORT}`
  }
  return `http://127.0.0.1:${API_PORT}`
}

type ApiProxyOptions = ProxyOptions & {
  router: (req: { headers: { host?: string } }) => string
}

const apiProxy: ApiProxyOptions = {
  target: `http://127.0.0.1:${API_PORT}`,
  changeOrigin: true,
  router(req) {
    return apiTargetForHost(req.headers.host)
  },
}

function attachLoopbackTwin(httpServer: HttpServer | null | undefined) {
  if (!httpServer) return
  httpServer.once('listening', () => {
    const address = httpServer.address()
    if (!address || typeof address === 'string') return
    const twinHost = address.address === '127.0.0.1' ? '::1' : address.address === '::1' ? '127.0.0.1' : ''
    if (!twinHost) return
    const bridge = net.createServer((socket) => {
      const upstream = net.connect(address.port, address.address)
      const closeBoth = () => {
        socket.destroy()
        upstream.destroy()
      }
      upstream.on('error', closeBoth)
      socket.on('error', closeBoth)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    bridge.on('error', (error) => {
      console.warn(`[dual-loopback] ${twinHost}:${address.port} 未能监听: ${error.message}`)
    })
    bridge.listen(address.port, twinHost)
    httpServer.on('close', () => bridge.close())
  })
}

function dualLoopbackPlugin(): Plugin {
  return {
    name: 'dual-loopback',
    configureServer(server) {
      attachLoopbackTwin(server.httpServer)
    },
    configurePreviewServer(server) {
      attachLoopbackTwin(server.httpServer)
    },
  }
}

export default defineConfig({
  plugins: [react(), dualLoopbackPlugin()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiProxy,
    },
  },
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiProxy,
    },
  },
})
