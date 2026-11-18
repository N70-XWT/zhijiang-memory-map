export type SelectionSource =
  | 'url'
  | 'marker'
  | 'timeline'
  | 'scroll'
  | 'list'
  | 'adjacent'
  | 'filter'
  | 'reset'
export type PanelMode = 'closed' | 'list' | 'detail'
export type SelectionState = {
  activityId: string | null
  panel: PanelMode
  source: SelectionSource
  revision: number
  returnToList: boolean
}
export type SelectionAction =
  | { type: 'select'; id: string; source: SelectionSource }
  | { type: 'restore'; id: string | null }
  | { type: 'close' }
  | { type: 'list' }
  | { type: 'reset' }
  | { type: 'filter'; validIds: string[] }

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case 'select':
      return {
        activityId: action.id,
        panel: action.source === 'scroll' ? state.panel : 'detail',
        source: action.source,
        revision: state.revision + 1,
        returnToList: action.source === 'list' || state.returnToList,
      }
    case 'restore':
      return {
        activityId: action.id,
        panel: action.id ? 'detail' : 'closed',
        source: 'url',
        revision: state.revision + 1,
        returnToList: false,
      }
    case 'close':
      return { ...state, panel: 'closed', returnToList: false }
    case 'list':
      return { ...state, panel: state.panel === 'list' ? 'closed' : 'list' }
    case 'reset':
      return {
        activityId: null,
        panel: 'closed',
        source: 'reset',
        revision: state.revision + 1,
        returnToList: false,
      }
    case 'filter':
      return state.activityId && !action.validIds.includes(state.activityId)
        ? {
            activityId: null,
            panel: state.panel === 'detail' ? 'closed' : state.panel,
            source: 'filter',
            revision: state.revision + 1,
            returnToList: false,
          }
        : state
  }
}

// A layout scroll can never arm a user selection. Every new operation invalidates old callbacks.
export class TimelineScrollGate {
  private generation = 0
  private user = false
  beginUser() {
    this.user = true
    return ++this.generation
  }
  beginProgrammatic() {
    this.user = false
    return ++this.generation
  }
  ticket() {
    return this.user ? this.generation : null
  }
  consume(ticket: number | null) {
    if (ticket === null || !this.user || ticket !== this.generation)
      return false
    this.user = false
    return true
  }
}
