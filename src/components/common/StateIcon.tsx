import UiIcon from './UiIcon'

type Props = {
  kind: 'disclosure' | 'list'
  active: boolean
}

// Keep the same icon nodes mounted so rapid toggles reverse from the current pose.
export default function StateIcon({ kind, active }: Props) {
  return (
    <span className="memory-state-icon" data-active={active} aria-hidden="true">
      {kind === 'disclosure' ? (
        <UiIcon name="chevron" className="memory-state-chevron h-4 w-4" />
      ) : (
        <>
          <UiIcon name="list" className="memory-state-icon-base h-4 w-4" />
          <UiIcon name="close" className="memory-state-icon-alternate h-4 w-4" />
        </>
      )}
    </span>
  )
}
