'use client'

export const FTYPE_META: Record<string, { color: string; label: string; gradient: [string, string]; soft: string }> = {
  '청년센터': {
    color: '#DB2777',
    label: '청',
    gradient: ['#F9A8D4', '#EC4899'],
    soft: '#FCE7F3',
  },
  '도서관': {
    color: '#2563EB',
    label: '도',
    gradient: ['#93C5FD', '#3B82F6'],
    soft: '#DBEAFE',
  },
  '체육관': {
    color: '#D97706',
    label: '체',
    gradient: ['#FCD34D', '#F59E0B'],
    soft: '#FEF3C7',
  },
  '문화센터': {
    color: '#7C3AED',
    label: '문',
    gradient: ['#C4B5FD', '#8B5CF6'],
    soft: '#EDE9FE',
  },
}

export const DEFAULT_META = {
  color: '#4B5563',
  label: '시',
  gradient: ['#D1D5DB', '#9CA3AF'] as [string, string],
  soft: '#F3F4F6',
}

interface MapPinProps {
  ftype: string
  size?: number
  selected?: boolean
}

export function getPinSvg(ftype: string, size = 40, selected = false): string {
  const meta = FTYPE_META[ftype] ?? DEFAULT_META
  const uid = `${ftype.replace(/\s+/g, '-')}-${size}-${selected ? 'sel' : 'n'}`
  const ringWidth = selected ? 3 : 0
  const outerRing = selected
    ? `<circle cx="20" cy="18" r="16" fill="none" stroke="white" stroke-width="2.5" opacity="0.9" />
       <circle cx="20" cy="18" r="16" fill="none" stroke="${meta.color}" stroke-width="1" opacity="0.35" />`
    : ''
  const innerR = selected ? 10.5 : 9.5
  const fontSize = selected ? 13 : 12
  const fontWeight = selected ? 700 : 600

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.25}" viewBox="0 0 40 50" role="img" aria-label="${ftype} 마커">
    <defs>
      <linearGradient id="pin-grad-${uid}" x1="20" y1="2" x2="20" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${meta.gradient[0]}" />
        <stop offset="100%" stop-color="${meta.gradient[1]}" />
      </linearGradient>
      <linearGradient id="inner-grad-${uid}" x1="20" y1="8" x2="20" y2="29" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="${meta.soft}" />
      </linearGradient>
      <filter id="pin-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="${selected ? 4 : 3}" stdDeviation="${selected ? 4 : 3}" flood-color="#0F172A" flood-opacity="${selected ? 0.22 : 0.16}" />
      </filter>
    </defs>
    <ellipse cx="20" cy="45.5" rx="${selected ? 10 : 9}" ry="${selected ? 3 : 2.5}" fill="#0F172A" opacity="0.12" />
    ${outerRing}
    <path d="M20 2C11.2 2 4 9.2 4 18c0 6.2 3.4 11.6 8.4 14.6L20 48l7.6-15.4C32.6 29.6 36 24.2 36 18 36 9.2 28.8 2 20 2z"
          fill="url(#pin-grad-${uid})" filter="url(#pin-shadow-${uid})" stroke="rgba(255,255,255,0.7)" stroke-width="${selected ? 2 : 1.5}" />
    <ellipse cx="${selected ? 14 : 14.5}" cy="${selected ? 9.5 : 10.5}" rx="${selected ? 7 : 6}" ry="${selected ? 4.5 : 4}" fill="white" opacity="0.28" />
    <circle cx="20" cy="18.5" r="${innerR}" fill="url(#inner-grad-${uid})" />
    <circle cx="20" cy="18.5" r="${innerR}" fill="none" stroke="rgba(15,23,42,0.06)" stroke-width="1" />
    <text x="20" y="${selected ? 23.5 : 22.8}" text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="-0.3"
          fill="${meta.color}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard', 'Noto Sans KR', sans-serif">${meta.label}</text>
  </svg>`
}

export default function MapPin({ ftype, size = 40, selected = false }: MapPinProps) {
  const svg = getPinSvg(ftype, size, selected)
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}
