import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  // Dedupe to a single React across the client bundle. The workspace also hosts
  // React 18 apps, so pnpm hoists React 18 at the root while this app needs 19.
  resolve: { tsconfigPaths: true, dedupe: ['react', 'react-dom'] },
  // No SPA-shell prerender. The index route is `ssr: false` (client-only), so the
  // hook-driven page never renders in Node — the Start server just serves the
  // shell and the browser mounts the app. Server functions work as before.
  plugins: [tailwindcss(), tanstackStart({ prerender: { enabled: false } }), viteReact()],
})

export default config
