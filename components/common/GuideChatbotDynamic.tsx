'use client'

import dynamic from 'next/dynamic'

const GuideChatbot = dynamic(() => import('./GuideChatbot'), { ssr: false })

export default GuideChatbot
