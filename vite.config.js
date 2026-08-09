import { defineConfig } from 'vite'

const insertVersion = () => ({
  name: 'insert-version',
  transformIndexHtml: {
    order: 'pre',
    handler (html) {
      const packageVersion = process.env.npm_package_version || 'dev'
      const displayVersion = packageVersion === 'dev'
        ? packageVersion
        : packageVersion.split('.').slice(0, 2).join('.')
      return html.replace('%VERSION%', displayVersion)
    }
  }
})

export default defineConfig({
  base: './',
  plugins: [insertVersion()],
  server: {
    port: 3001,
    strictPort: true,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
