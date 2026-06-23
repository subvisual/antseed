import { createFileRoute } from '@tanstack/react-router'

import FundingApp from '../components/FundingApp'

// Client-only route. `ssr: false` keeps this page out of the build-time prerender
// (which runs in Node, where the workspace's duplicated React 18/19 copies crash
// SSR) and out of any server render — the MoonPay SDK and browser APIs only ever
// run in the browser. No lazy import or mount gate needed.
export const Route = createFileRoute('/')({ ssr: false, component: FundingApp })
