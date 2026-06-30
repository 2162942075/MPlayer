import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    // 分块配置 - 保守方案
    rollupOptions: {
      output: {
        manualChunks: {
          // 分离React相关库
          'vendor-react': ['react', 'react-dom'],
          // 分离Antd UI库
          'vendor-antd': ['antd', '@ant-design/icons'],
          // 其他第三方库保持在默认vendor中
        }
      }
    },
    // 调整警告阈值，避免不必要的警告
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
  },
  base: './',
}) 