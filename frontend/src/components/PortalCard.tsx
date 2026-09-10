import { useEffect, useState } from 'react'
import formatEventTimestamp from '../utils/formatEventTimestamp'

type PortalAction = 'stabilize' | 'close' | 'observe' | 'questionable' | 'open'

type PortalEvent = {
  timestamp: string
  portal_id: string
  portal_instance_id: number
  action: string
}

type PortalCardProps = {
  id: string
  portalInstanceId: number
  name: string
  destination: string
  energy: number
  stability: number
  creatures: number
  creatureStock: number
  status: string
  collapseAt: string
  risk: number | null
  riskLevel: string | null
  recommendation: string
  onCollapse: () => void
  onEventChange: () => void
}

function PortalCard({
  id,
  portalInstanceId,
  name,
  destination,
  energy,
  stability,
  creatures,
  creatureStock,
  status,
  collapseAt,
  risk,
  riskLevel,
  recommendation,
  onCollapse,
  onEventChange,
}: PortalCardProps) {
const [isExpanded, setIsExpanded] = useState(false)
const [events, setEvents] = useState<PortalEvent[]>([])
const [isEventsLoading, setIsEventsLoading] = useState(false)
const [eventsError, setEventsError] = useState('')
const [actionError, setActionError] = useState('')
const [isActionSubmitting, setIsActionSubmitting] = useState(false)
const [isCreatureSubmitting, setIsCreatureSubmitting] = useState(false)
const [isDeleting, setIsDeleting] = useState(false)

// Countdown отображает время из collapseAt, но состояние CLOSED/COLLAPSED
// всегда останавливает его и не запускает новый интервал.
const [remainingSeconds, setRemainingSeconds] = useState(() => {
  if (['CLOSED', 'COLLAPSED'].includes(status)) return 0

  const collapseTime = new Date(collapseAt).getTime()
  return Math.max(0, Math.floor((collapseTime - Date.now()) / 1000))
})

useEffect(() => {
  if (['CLOSED', 'COLLAPSED'].includes(status)) {
    return
  }

  const timer = setInterval(() => {
    const collapseTime = new Date(collapseAt).getTime()

    const seconds = Math.max(
      0,
      Math.floor((collapseTime - Date.now()) / 1000),
    )

    setRemainingSeconds(seconds)

        if (seconds === 0) {
        clearInterval(timer)
        onCollapse()
        }
  }, 1000)

  return () => clearInterval(timer)
}, [collapseAt, id, onCollapse, status])

const displayedRemainingSeconds = ['CLOSED', 'COLLAPSED'].includes(status)
  ? 0
  : remainingSeconds

// История загружается только после раскрытия карточки.
const loadEvents = async () => {
  setIsEventsLoading(true)
  setEventsError('')

  try {
    const response = await fetch('http://127.0.0.1:8000/events')

    if (!response.ok) {
      throw new Error('Не удалось загрузить историю изменений.')
    }

    const data: PortalEvent[] = await response.json()
    setEvents(
      data.filter((event) => event.portal_instance_id === portalInstanceId),
    )
  } catch (error) {
    setEventsError(
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить историю изменений.',
    )
  } finally {
    setIsEventsLoading(false)
  }
}

const toggleExpanded = () => {
  const nextExpanded = !isExpanded
  setIsExpanded(nextExpanded)

  if (nextExpanded) {
    void loadEvents()
  }
}

// Кнопки повторяют правила backend, который остаётся источником истины.
const actionAvailability: Record<PortalAction, boolean> = {
  stabilize: ['OPEN', 'OBSERVATION', 'QUESTIONABLE'].includes(status),
  close: ['OPEN', 'STABILIZED', 'OBSERVATION', 'QUESTIONABLE'].includes(status),
  observe: ['OPEN', 'STABILIZED', 'QUESTIONABLE'].includes(status)
    && riskLevel !== 'CRITICAL',
  questionable: ['OPEN', 'STABILIZED', 'OBSERVATION', 'QUESTIONABLE'].includes(status),
  open: ['CLOSED', 'COLLAPSED'].includes(status),
}

// После успешного действия callback-и обновляют список и общий журнал родителя.
const handleAction = async (action: PortalAction) => {
  if (
    !actionAvailability[action]
    || isActionSubmitting
    || isCreatureSubmitting
    || isDeleting
  ) return

  if (action === 'close' && creatures > 0) {
    const confirmed = window.confirm(
      `В портале находятся существа: ${creatures}. Подтвердить закрытие?`,
    )

    if (!confirmed) return
  }

  setActionError('')
  setIsActionSubmitting(true)

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/portals/${id}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'close' && creatures > 0 ? { confirm: true } : {}),
        }),
      },
    )
    const data = await response.json()

    if (!response.ok || data.error || data.warning) {
      throw new Error(data.error ?? data.warning ?? 'Не удалось выполнить действие.')
    }

    onCollapse()
    onEventChange()
    if (isExpanded) {
      void loadEvents()
    }
  } catch (error) {
    setActionError(
      error instanceof Error
        ? error.message
        : 'Не удалось выполнить действие. Попробуйте ещё раз.',
    )
  } finally {
    setIsActionSubmitting(false)
  }
}

// Переводит одно существо между порталом и persistent Creature Bank.
const handleCreatureChange = async (action: 'add_creatures' | 'remove_creatures') => {
  if (isActionSubmitting || isCreatureSubmitting || isDeleting) return
  if (action === 'add_creatures' && creatureStock === 0) return
  if (action === 'remove_creatures' && creatures === 0) return

  setActionError('')
  setIsCreatureSubmitting(true)

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/portals/${id}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount: 1 }),
      },
    )
    const data = await response.json()

    if (!response.ok || data.error || data.warning) {
      throw new Error(data.error ?? data.warning ?? 'Не удалось изменить количество существ.')
    }

    onCollapse()
    onEventChange()
    if (isExpanded) {
      void loadEvents()
    }
  } catch (error) {
    setActionError(
      error instanceof Error
        ? error.message
        : 'Не удалось изменить количество существ. Попробуйте ещё раз.',
    )
  } finally {
    setIsCreatureSubmitting(false)
  }
}

// Удаление подтверждается пользователем и выполняется через общий actions endpoint.
const handleDelete = async () => {
  if (isActionSubmitting || isCreatureSubmitting || isDeleting) return

  const confirmed = window.confirm(
    `Портал ${id} будет удалён. Это действие нельзя отменить. Продолжить?`,
  )

  if (!confirmed) return

  setActionError('')
  setIsDeleting(true)

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/portals/${id}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' }),
      },
    )
    const data = await response.json()

    if (!response.ok || data.error || data.warning) {
      throw new Error(data.error ?? data.warning ?? 'Не удалось удалить портал.')
    }

    onCollapse()
    onEventChange()
  } catch (error) {
    setActionError(
      error instanceof Error
        ? error.message
        : 'Не удалось удалить портал. Попробуйте ещё раз.',
    )
  } finally {
    setIsDeleting(false)
  }
}

    const statusLabels: Record<string, string> = {
  OPEN: 'Открыт',
  STABILIZED: 'Стабилизирован',
  OBSERVATION: 'Наблюдение',
  QUESTIONABLE: 'Требует внимания',
  CLOSED: 'Закрыт',
  COLLAPSED: 'Схлопнулся',
}

    const riskLabels: Record<string, string> = {
    LOW: 'Низкий',
    MEDIUM: 'Средний',
    HIGH: 'Высокий',
    CRITICAL: 'Критический',
    }

    const isRiskActive = !['CLOSED', 'COLLAPSED'].includes(status)
    const displayedRisk = isRiskActive ? risk : null
    const displayedRiskLevel = isRiskActive ? riskLevel : null
    const riskClass = isRiskActive && riskLevel
        ? `risk-${riskLevel.toLowerCase()}`
        : 'risk-none'

  return (
  <article className="portal-card">
    <div
      className="portal-card-main"
      onClick={toggleExpanded}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleExpanded()
        }
      }}
      aria-expanded={isExpanded}
    >
      <header>
        <h2>{id} — {name}</h2>
        <p className="destination">Мир: {destination}</p>
      </header>

    <section className="portal-section">
      <h3>Состояние</h3>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Энергия</span>
          <span className="stat-value">{energy}</span>
        </div>

        <div className="stat">
          <span className="stat-label">Стабильность</span>
          <span className="stat-value">{stability}</span>
        </div>

        <div className="stat">
          <span className="stat-label">Существа</span>
          <div className="creature-counter">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleCreatureChange('remove_creatures')
              }}
              disabled={creatures === 0 || isActionSubmitting || isCreatureSubmitting || isDeleting}
              aria-label="Вернуть существо в общий запас"
            >
              −
            </button>
            <span className="stat-value">{creatures}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleCreatureChange('add_creatures')
              }}
              disabled={creatureStock === 0 || isActionSubmitting || isCreatureSubmitting || isDeleting}
              aria-label="Отправить существо в портал"
            >
              +
            </button>
          </div>
        </div>

        <div className="stat">
            <span className="stat-label">Статус</span>
            <span className={`status-badge status-${status.toLowerCase()}`}>
                {statusLabels[status] ?? status}
            </span>
        </div>
      </div>
    </section>

    <section className="portal-section risk-info">
      <h3>Риск</h3>

      <p>
         До схлопывания:{' '}
         {Math.floor(displayedRemainingSeconds / 60)} мин.{' '}
        {displayedRemainingSeconds % 60} сек.
        </p>
      <p>Риск: {displayedRisk ?? '—'}</p>
      <p className={`risk-level ${riskClass}`}>
         Уровень риска:{' '}
        {displayedRiskLevel ? riskLabels[displayedRiskLevel] ?? displayedRiskLevel : '—'}
        </p>
    </section>

    <section className="portal-section">
      <h3>Рекомендация</h3>

      <div className="recommendation">
        {recommendation}
      </div>
    </section>

    {isExpanded && (
      <section className="portal-section portal-details">
        <h3>Подробная информация</h3>
        <dl className="details-list">
          <div><dt>Название</dt><dd>{name}</dd></div>
          <div><dt>Код портала</dt><dd>{id}</dd></div>
          <div><dt>Мир назначения</dt><dd>{destination}</dd></div>
          <div><dt>Энергия</dt><dd>{energy}</dd></div>
          <div><dt>Стабильность</dt><dd>{stability}</dd></div>
          <div><dt>Существа</dt><dd>{creatures}</dd></div>
          <div><dt>Статус</dt><dd>{statusLabels[status] ?? status}</dd></div>
          <div><dt>Риск</dt><dd>{displayedRisk ?? '—'}</dd></div>
          <div><dt>Уровень риска</dt><dd>{displayedRiskLevel ? riskLabels[displayedRiskLevel] ?? displayedRiskLevel : '—'}</dd></div>
          <div><dt>Рекомендация</dt><dd>{recommendation}</dd></div>
          {!['CLOSED', 'COLLAPSED'].includes(status) && (
            <div><dt>До схлопывания</dt><dd>{Math.floor(displayedRemainingSeconds / 60)} мин. {displayedRemainingSeconds % 60} сек.</dd></div>
          )}
        </dl>
      </section>
    )}

    {isExpanded && (
      <section className="portal-section event-history">
        <h3>История изменений</h3>
        {isEventsLoading && <p className="muted-text">Загрузка истории...</p>}
        {eventsError && <p className="action-error">{eventsError}</p>}
        {!isEventsLoading && !eventsError && events.length === 0 && (
          <p className="muted-text">История изменений пока пуста.</p>
        )}
        {!isEventsLoading && !eventsError && events.length > 0 && (
          <ul className="event-list">
            {events.map((event, index) => (
              <li key={`${event.timestamp}-${event.action}-${index}`}>
                <time>{formatEventTimestamp(event.timestamp)}</time>
                <span>{event.action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )}
    </div>

    <footer className="portal-actions" onClick={(event) => event.stopPropagation()}>
      <h3>Действия</h3>
      <div className="action-buttons">
        <button
          type="button"
          onClick={() => handleAction('stabilize')}
          disabled={!actionAvailability.stabilize || isActionSubmitting || isDeleting}
        >
          Стабилизировать
        </button>
        <button
          type="button"
          onClick={() => handleAction('close')}
          disabled={!actionAvailability.close || isActionSubmitting || isDeleting}
        >
          Закрыть
        </button>
        <button
          type="button"
          onClick={() => handleAction('observe')}
          disabled={!actionAvailability.observe || isActionSubmitting || isDeleting}
        >
          Отправить наблюдателя
        </button>
        <button
          type="button"
          onClick={() => handleAction('questionable')}
          disabled={!actionAvailability.questionable || isActionSubmitting || isDeleting}
        >
          Под вопросом
        </button>
        <button
          type="button"
          onClick={() => handleAction('open')}
          disabled={!actionAvailability.open || isActionSubmitting || isDeleting}
        >
          Открыть
        </button>
        <button
          className="delete-action"
          type="button"
          onClick={handleDelete}
          disabled={isActionSubmitting || isCreatureSubmitting || isDeleting}
        >
          {isDeleting ? 'Удаление...' : 'Удалить'}
        </button>
      </div>
      {actionError && <p className="action-error">{actionError}</p>}
    </footer>
  </article>
)
}

export default PortalCard