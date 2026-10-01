import net from 'node:net'
import { defineConfig, type HttpServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined
          if (
            id.includes('/node_modules/react/')
            || id.includes('/node_modules/react-dom/')
            || id.includes('/node_modules/react-router')
            || id.includes('/node_modules/scheduler/')
            || id.includes('/node_modules/@remix-run/router/')
          ) return 'react-vendor'
          if (id.includes('/node_modules/antd/')) return 'antd'
          if (id.includes('/node_modules/@ant-design/icons')) return 'ant-design-icons'
          if (id.includes('/node_modules/@ant-design/') || id.includes('/node_modules/@rc-component/') || /\/node_modules\/rc-[^/]+\//.test(id)) return 'antd-components'
          if (id.includes('/node_modules/axios/')) return 'axios'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
  preview: {
    host: '127.0.0.1',
  },
})
