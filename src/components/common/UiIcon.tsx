import type { ReactNode } from 'react'

type UiIconName =
  | 'arrow'
  | 'calendar'
  | 'chevron'
  | 'close'
  | 'collapse'
  | 'expand'
  | 'filter'
  | 'focus'
  | 'list'
  | 'mail'
  | 'map'
  | 'pin'
  | 'search'
  | 'sparkles'
  | 'users'

type UiIconProps = {
  name: UiIconName
  className?: string
}

const paths: Record<UiIconName, ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  calendar: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  collapse: <path d="m8 14 4-4 4 4" />,
  expand: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />,
  filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
  focus: <path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4m13 5h4a1 1 0 0 0 1-1v-4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  mail: <path d="M4 5h16v14H4V5Zm0 2 8 6 8-6" />,
  map: <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />,
  pin: <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  search: <path d="m20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />,
  sparkles: <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 13l1 2.8L9 17l-3 1.2L5 21l-1-2.8L1 17l3-1.2L5 13Z" />,
  users: <path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m6.5-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5 4a4 4 0 0 1 4 4v2m-3-18a4 4 0 0 1 0 8" />,
}

export default function UiIcon({ name, className = 'h-4 w-4' }: UiIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
