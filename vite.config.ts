import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-data',
      configureServer(server) {
        server.middlewares.use('/data', (req, res) => {
          let filePath = req.url!.replace(/^\/data/, '')
          if (filePath.endsWith('/')) filePath += 'index.html'
          const fullPath = path.join(__dirname, 'data', filePath)
          try {
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) {
              // List directory
              const files = fs.readdirSync(fullPath)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(files.map(f => ({ filename: f, path: `/data${filePath}${f}` }))))
            } else {
              const content = fs.readFileSync(fullPath)
              res.writeHead(200)
              res.end(content)
            }
          } catch (e) {
            res.writeHead(404)
            res.end('Not found')
          }
        })
      }
    }
  ],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist'
  }
})
