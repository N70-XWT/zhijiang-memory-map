import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

export const metadata: Metadata = {
  title: '枝江娱乐 线下活动回忆地图',
  description: '枝江娱乐线下活动第一轮前端原型',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

