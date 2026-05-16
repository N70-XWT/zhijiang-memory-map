const CONTACT_EMAIL = 'xiebaon70@outlook.com'
const MAILTO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('枝江回忆地图反馈建议')}`

export default function FeedbackContactLink() {
  return (
    <div className="pointer-events-none absolute bottom-16 left-3 z-[380] max-w-[calc(100vw-1.5rem)] md:bottom-5 md:left-20">
      <a
        href={MAILTO_HREF}
        aria-label={`发送反馈邮件到 ${CONTACT_EMAIL}`}
        className="pointer-events-auto inline-flex max-w-full flex-col gap-0.5 rounded-xl border border-slate-300/90 bg-slate-50/95 px-3 py-2 text-xs text-slate-700 shadow-md backdrop-blur-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
      >
        <span className="font-semibold text-slate-900">建议或意见</span>
        <span className="break-all leading-4">{CONTACT_EMAIL}</span>
      </a>
    </div>
  )
}
