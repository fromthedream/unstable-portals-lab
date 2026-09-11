import { useCallback, useEffect, useState } from 'react'
import PortalCard from './components/PortalCard'
import formatEventTimestamp from './utils/formatEventTimestamp'
import './App.css'
import { API_URL } from './config'

type Portal = {
  id: string
  portal_instance_id: number
  name: string
  destination_world: string
  energy: number
  stability: number
  creatures_inside: number
  status: string
  collapse_at: string
  time_to_collapse: number
  risk: number | null
  risk_level: string | null
  recommendation: string
}

type PortalEvent = {
  timestamp: string
  portal_id: string
  portal_instance_id: number
  action: string
}

function App() {
  const [portals, setPortals] = useState<Portal[]>([])
  const [creatureStock, setCreatureStock] = useState(0)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [portalName, setPortalName] = useState('')
  const [destinationWorld, setDestinationWorld] = useState('')
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeSection, setActiveSection] = useState<'portals' | 'events' | 'worklog'>('portals')
  const [events, setEvents] = useState<PortalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState('')

  // Обновляет порталы и общий запас существ из backend.
  const loadPortals = useCallback(() => {
    Promise.all([
      fetch(`${API_URL}/portals`),
      fetch(`${API_URL}/creatures`),
    ])
      .then(async ([portalsResponse, stockResponse]) => {
        if (!portalsResponse.ok || !stockResponse.ok) {
          throw new Error('Не удалось обновить состояние лаборатории.')
        }

        return Promise.all([
          portalsResponse.json(),
          stockResponse.json(),
        ])
      })
      .then(([data, stock]) => {
        setPortals(data)
        setCreatureStock(stock.free_creatures)
      })
      .catch((error) => console.error(error))
  }, [])

  // Первичная загрузка и polling для изменений, сделанных вне React.
  useEffect(() => {
    loadPortals()

    const interval = setInterval(loadPortals, 5000)

    return () => clearInterval(interval)
  }, [loadPortals])

  // Загружает общий журнал только при переходе на вкладку событий.
  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    setEventsError('')

    try {
      const response = await fetch(`${API_URL}/events`)

      if (!response.ok) {
        throw new Error('Не удалось загрузить общий журнал событий.')
      }

      const data: PortalEvent[] = await response.json()
      setEvents(
        [...data].sort(
          (first, second) =>
            new Date(second.timestamp).getTime()
            - new Date(first.timestamp).getTime(),
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ''

      setEventsError(
        message === 'Failed to fetch'
          ? 'Не удалось связаться с сервером событий.'
          : message || 'Не удалось загрузить общий журнал событий.',
      )
    } finally {
      setEventsLoading(false)
    }
  }, [])

  const closeCreateForm = () => {
    if (isSubmitting) return

    setIsCreateOpen(false)
    setPortalName('')
    setDestinationWorld('')
    setCreateError('')
  }

  // Backend сам генерирует остальные параметры нового портала.
  const handleCreatePortal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = portalName.trim()
    const destination = destinationWorld.trim()

    if (!name || !destination) {
      setCreateError('Заполните название портала и мир назначения.')
      return
    }

    setIsSubmitting(true)
    setCreateError('')

    try {
      const response = await fetch(`${API_URL}/portals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          destination_world: destination,
        }),
      })

      if (!response.ok) {
        throw new Error('Не удалось создать портал.')
      }

      closeCreateForm()
      loadPortals()
      if (activeSection === 'events') {
        void loadEvents()
      }
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : 'Не удалось создать портал. Попробуйте ещё раз.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Сводка использует готовые значения risk/status из API.
  const summary = {
    open: portals.filter(
      (portal) => !['CLOSED', 'COLLAPSED'].includes(portal.status),
    ).length,
    critical: portals.filter(
      (portal) => portal.risk_level === 'CRITICAL',
    ).length,
    closed: portals.filter((portal) => portal.status === 'CLOSED').length,
    attention: portals.filter(
      (portal) =>
        ['HIGH', 'CRITICAL'].includes(portal.risk_level ?? '')
        || portal.status === 'QUESTIONABLE',
    ).length,
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Лаборатория нестабильных порталов</h1>
            <p>
              Система мониторинга нестабильных пространственных переходов
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setCreateError('')
              setIsCreateOpen(true)
            }}
          >
            Создать портал
          </button>
        </div>
      </header>

      <section className="creature-stock" aria-label="Общий запас существ">
        <span>Общий запас существ</span>
        <strong>{creatureStock}</strong>
      </section>

      <nav className="section-tabs" aria-label="Основные разделы">
        <button
          className={activeSection === 'portals' ? 'tab-button active' : 'tab-button'}
          type="button"
          onClick={() => setActiveSection('portals')}
        >
          Порталы
        </button>
        <button
          className={activeSection === 'events' ? 'tab-button active' : 'tab-button'}
          type="button"
          onClick={() => {
            setActiveSection('events')
            // Вкладка переключается внутри App, отдельной переадресации нет.
            void loadEvents()
          }}
        >
          Журнал событий
        </button>
        <button
          className={activeSection === 'worklog' ? 'tab-button active' : 'tab-button'}
          type="button"
          onClick={() => setActiveSection('worklog')}
        >
          AI Worklog
        </button>
      </nav>

      {isCreateOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-portal-title">
            <div className="modal-header">
              <h2 id="create-portal-title">Создать портал</h2>
              <button
                className="icon-button"
                type="button"
                onClick={closeCreateForm}
                disabled={isSubmitting}
                aria-label="Закрыть форму"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePortal}>
              <label>
                Название портала
                <input
                  value={portalName}
                  onChange={(event) => setPortalName(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </label>

              <label>
                Мир назначения
                <input
                  value={destinationWorld}
                  onChange={(event) => setDestinationWorld(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </label>

              {createError && <p className="form-error">{createError}</p>}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeCreateForm}
                  disabled={isSubmitting}
                >
                  Отмена
                </button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activeSection === 'portals' ? (
        <>
          <section className="summary-grid" aria-label="Сводка по порталам">
            <div className="summary-card">
              <span>Открыто</span>
              <strong>{summary.open}</strong>
            </div>
            <div className="summary-card summary-card-critical">
              <span>Критический риск</span>
              <strong>{summary.critical}</strong>
            </div>
            <div className="summary-card">
              <span>Закрыто</span>
              <strong>{summary.closed}</strong>
            </div>
            <div className="summary-card summary-card-attention">
              <span>Требуют внимания</span>
              <strong>{summary.attention}</strong>
            </div>
          </section>

          {portals.length === 0 ? (
            <section className="empty-state" aria-live="polite">
              <h2>Порталов пока нет</h2>
              <p>Создайте первый портал, чтобы начать мониторинг.</p>
            </section>
          ) : (
            <section className="portals">
              {portals.map((portal) => (
                <PortalCard
                  key={portal.id}
                  id={portal.id}
                  portalInstanceId={portal.portal_instance_id}
                  name={portal.name}
                  destination={portal.destination_world}
                  energy={portal.energy}
                  stability={portal.stability}
                  creatures={portal.creatures_inside}
                  creatureStock={creatureStock}
                  status={portal.status}
                  collapseAt={portal.collapse_at}
                  risk={portal.risk}
                  riskLevel={portal.risk_level}
                  recommendation={portal.recommendation}
                  onCollapse={loadPortals}
                  onEventChange={loadEvents}
                />
              ))}
            </section>
          )}
        </>
      ) : activeSection === 'events' ? (
        <section className="event-log" aria-labelledby="event-log-title">
          <h2 id="event-log-title">Журнал событий</h2>
          {eventsLoading && <p className="muted-text">Загрузка...</p>}
          {eventsError && <p className="form-error">{eventsError}</p>}
          {!eventsLoading && !eventsError && events.length === 0 && (
            <p className="muted-text">Событий пока нет</p>
          )}
          {!eventsLoading && !eventsError && events.length > 0 && (
            <>
              <div className="global-event-header" aria-hidden="true">
                <span>Время</span>
                <span>ID портала</span>
                <span>Состояние</span>
              </div>
              <ul className="global-event-list">
                {events.map((event, index) => (
                  <li key={`${event.timestamp}-${event.portal_id}-${index}`}>
                    <time>{formatEventTimestamp(event.timestamp)}</time>
                    <span>{event.portal_id}</span>
                    <span>{event.action}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="worklog" aria-labelledby="worklog-title">
          <header className="worklog-header">
            <p className="worklog-kicker">Прозрачность процесса</p>
            <h2 id="worklog-title">AI Worklog</h2>
            <p>
              Краткий журнал совместной разработки: решения принимал разработчик,
              а AI помогал исследовать код, формулировать варианты и проверять изменения.
            </p>
          </header>

          <div className="worklog-meta-grid">
            <div className="worklog-card">
              <h3>AI-инструменты</h3>
              <p><strong>GitHub Copilot</strong> — основной AI-инструмент при разработке.</p>
              <p><strong>ChatGPT</strong> — проектирование, проверка решений, анализ ошибок и формулирование требований.</p>
            </div>
            <div className="worklog-card">
              <h3>Метрики</h3>
              <p><strong>Время:</strong> точное суммарное время не фиксировалось; работа выполнялась итерационно в несколько сессий.</p>
              <p><strong>Токены:</strong> количество токенов не отслеживалось.</p>
            </div>
          </div>

          <section className="worklog-section">
            <h3>Этапы разработки</h3>
            <div className="worklog-stage-grid">
              <article className="worklog-stage">
                <span>01</span><h4>Проектирование и базовая архитектура</h4>
                <p><strong>Цель:</strong> определить границы FastAPI/React приложения.</p>
                <p><strong>Человек:</strong> выбрал минимальный scope и проверяемые сценарии.</p>
                <p><strong>AI:</strong> помогал разбирать структуру проекта и локальные точки изменений.</p>
                <p><strong>Результат:</strong> небольшая система мониторинга без лишней архитектуры.</p>
              </article>
              <article className="worklog-stage">
                <span>02</span><h4>Backend и модель портала</h4>
                <p><strong>Цель:</strong> хранить портал, состояние и события.</p>
                <p><strong>Человек:</strong> утвердил API и SQLite как текущую persistence-модель.</p>
                <p><strong>AI:</strong> помогал анализировать ORM-модель и обработчики.</p>
                <p><strong>Результат:</strong> CRUD-сценарии, действия и журнал событий.</p>
              </article>
              <article className="worklog-stage">
                <span>03</span><h4>Расчёт риска и состояния</h4>
                <p><strong>Цель:</strong> сделать риск отдельным числовым показателем.</p>
                <p><strong>Человек:</strong> выбрал формулу, веса и симметричный pressure энергии вокруг 50.</p>
                <p><strong>AI:</strong> помогал проверять граничные значения и тесты.</p>
                <p><strong>Результат:</strong> риск зависит от стабильности, энергии и времени.</p>
              </article>
              <article className="worklog-stage">
                <span>04</span><h4>Действия и защита состояний</h4>
                <p><strong>Цель:</strong> не допускать невозможные переходы.</p>
                <p><strong>Человек:</strong> оставил backend source of truth для бизнес-правил.</p>
                <p><strong>AI:</strong> помогал сопоставлять disabled UI с backend transitions.</p>
                <p><strong>Результат:</strong> стабилизация, закрытие, наблюдение, questionable и open.</p>
              </article>
              <article className="worklog-stage">
                <span>05</span><h4>Frontend</h4>
                <p><strong>Цель:</strong> дать оператору понятный мониторинг и управление.</p>
                <p><strong>Человек:</strong> проверял UX, раскрытие карточек и ручные сценарии.</p>
                <p><strong>AI:</strong> помогал с точечными React/TypeScript изменениями.</p>
                <p><strong>Результат:</strong> карточки, polling, создание и действия без F5.</p>
              </article>
              <article className="worklog-stage">
                <span>06</span><h4>Event Log</h4>
                <p><strong>Цель:</strong> показать историю конкретного портала и общий журнал.</p>
                <p><strong>Человек:</strong> выбрал ленивую загрузку истории и локализацию UTC.</p>
                <p><strong>AI:</strong> помогал находить проблему orphan-событий и CORS.</p>
                <p><strong>Результат:</strong> фильтрация по экземпляру и журнал с реальными секундами.</p>
              </article>
              <article className="worklog-stage">
                <span>07</span><h4>Creature Bank</h4>
                <p><strong>Цель:</strong> сделать общий запас существ persistent-ресурсом.</p>
                <p><strong>Человек:</strong> выбрал ограниченный банк, чтобы существа не возникали из воздуха.</p>
                <p><strong>AI:</strong> помогал связать операции банка с существующими actions.</p>
                <p><strong>Результат:</strong> SQLite-банк и операции +/- с защитой от отрицательных значений.</p>
              </article>
              <article className="worklog-stage">
                <span>08</span><h4>Удаление и повторное использование кодов</h4>
                <p><strong>Цель:</strong> удалять портал и безопасно переиспользовать `P-xxx`.</p>
                <p><strong>Человек:</strong> потребовал различать поколения одного пользовательского кода.</p>
                <p><strong>AI:</strong> помогал проверить минимальный свободный ID и orphan history.</p>
                <p><strong>Результат:</strong> `portal_instance_id` отделяет старую историю от новой.</p>
              </article>
              <article className="worklog-stage">
                <span>09</span><h4>Frontend-полировка и Summary</h4>
                <p><strong>Цель:</strong> ускорить чтение состояния лаборатории.</p>
                <p><strong>Человек:</strong> определил четыре показателя Summary и визуальную иерархию.</p>
                <p><strong>AI:</strong> помогал с аккуратной интеграцией в существующий стиль.</p>
                <p><strong>Результат:</strong> сводка перед карточками и отдельный AI Worklog.</p>
              </article>
            </div>
          </section>

          <div className="worklog-two-columns">
            <section className="worklog-section">
              <h3>Ключевые запросы по задачам</h3>
              <ul className="worklog-list">
                <li>«Спроектировать понятную формулу риска и проверить edge cases.»</li>
                <li>«Проверить невозможные переходы и disabled-состояния UI по backend.»</li>
                <li>«Добавить event log с UTC timestamp и локальным отображением.»</li>
                <li>«Проверить удаление, повторное использование portal code и изоляцию истории.»</li>
                <li>«Найти и исправить проблемы frontend/backend, не переписывая архитектуру.»</li>
              </ul>
              <p className="worklog-note">Это примеры запросов по задачам, а не дословная стенограмма сообщений.</p>
            </section>
            <section className="worklog-section">
              <h3>Решения разработчика</h3>
              <ul className="worklog-list">
                <li>Backend остаётся source of truth для бизнес-правил и невозможных действий.</li>
                <li>Статус портала не смешивается с числовым риском.</li>
                <li>Энергия оценивается симметрично относительно оптимального значения 50.</li>
                <li>История привязывается к `portal_instance_id`, а не только к `portal_code`.</li>
                <li>Creature Bank — ограниченный backend-ресурс, сохраняющийся после F5.</li>
              </ul>
            </section>
          </div>

          <section className="worklog-section">
            <h3>Ошибки AI и ручные исправления</h3>
            <ul className="worklog-list worklog-list-columns">
              <li>Риск сначала мог оставаться активным у закрытых порталов; правило приведено к `risk=null` и `risk_level=null` для `CLOSED` и `COLLAPSED`.</li>
              <li>При повторном открытии `COLLAPSED` энергия могла стать отрицательной; добавлен нижний предел 0 и regression test.</li>
              <li>Старые orphan-события могли ронять `/events`; обработка удалённых/отсутствующих порталов стала безопасной.</li>
              <li>Повторное использование `P-xxx` проверено отдельно, чтобы история поколений не смешивалась.</li>
            </ul>
            <p className="worklog-note">Решения AI проверялись разработчиком по коду, API, тестам и ручным сценариям.</p>
          </section>

          <div className="worklog-two-columns">
            <section className="worklog-section">
              <h3>Проверено вручную</h3>
              <ul className="worklog-list">
                <li>Переходы состояний, формула риска и невозможные действия.</li>
                <li>Creature Bank, удаление и повторное использование кодов.</li>
                <li>Изоляция истории, countdown и frontend-риск.</li>
                <li>Создание портала, Summary и общий Event Log.</li>
              </ul>
            </section>
            <section className="worklog-section">
              <h3>Тестирование</h3>
              <p className="test-result"><strong>Backend:</strong> 22 passed, 1 warning</p>
              <p className="test-result"><strong>Frontend:</strong> <code>npm run build</code> — успешно</p>
              <p className="worklog-note">Frontend unit tests в проекте не заявлены.</p>
            </section>
          </div>

          <section className="worklog-section">
            <h3>Будущие улучшения</h3>
            <ul className="improvement-list">
              <li>Авторизация пользователей: роли оператора и аудит доступа к действиям.</li>
              <li>PostgreSQL для масштабирования: конкурентная работа и надёжные миграции.</li>
              <li>WebSocket/SSE: обновление статусов и событий без polling.</li>
              <li>Детальная история изменений: diff параметров и фильтры по периоду.</li>
              <li>Полноценное подтверждение опасных действий: понятные модальные сценарии вместо `window.confirm`.</li>
              <li>Расширенное управление существами: пополнение банка и групповые операции.</li>
              <li>Frontend automated tests: проверки действий, вкладок, empty/error states и countdown.</li>
              <li>Мониторинг и structured logging: метрики ошибок API и трассировка действий.</li>
              <li>Детальная модель времени и аварийных состояний: паузы, таймзоны и восстановление после сбоев.</li>
              <li>Улучшение UX/UI дизайна: адаптивная компоновка, более ясная иерархия рисков и доступность.</li>
            </ul>
          </section>
        </section>
      )}
    </main>
  )
}

export default App