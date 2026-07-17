const CONTACT_EMAIL = 'xiebaon70@outlook.com'
const MAILTO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('枝江回忆地图反馈建议')}`

export default function FeedbackContactLink() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[380] max-w-[calc(100vw-1.5rem)] md:bottom-5 md:left-5">
      <a
        href={MAILTO_HREF}
        aria-label={`发送反馈邮件到 ${CONTACT_EMAIL}`}
        className="pointer-events-auto inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl border border-orange-200/80 bg-[#fffaf5]/95 px-3 py-2 text-xs text-slate-700 shadow-[0_10px_30px_rgba(124,45,18,0.13)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
          <UiIcon name="mail" className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-slate-900">反馈与建议</span>
          <span className="hidden break-all leading-4 text-slate-500 md:block">{CONTACT_EMAIL}</span>
        </span>
      </a>
    </div>
  )
}
import UiIcon from '@/components/common/UiIcon'
