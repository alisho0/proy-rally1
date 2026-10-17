'use client'

import { useMemo, useState } from 'react'
import {
  Baby,
  Check,
  CheckCircle2,
  Circle,
  Droplets,
  HeartHandshake,
  HeartPulse,
  Home,
  MapPin,
  Radio,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Users,
  UtensilsCrossed,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'
import { Semaforo, LEVELS, type Level } from '@/components/semaforo'
import { DroneMap } from '@/components/drone-map'
import { planRoute, type NodeId } from '@/lib/route-graph'

type Color = Level
type Alert = { id: string; color: Color; zone: string; node: NodeId; people: number; keywords: string[]; score: number; status: string }

const initialAlerts: Alert[] = [
  { id: 'FRO-7C2A', color: 'red', zone: 'CENTRO / RIVADAVIA', node: '3-1', people: 2, keywords: ['ADULTO MAYOR', 'INSULINA'], score: 94, status: 'ESPERANDO' },
  { id: 'FRO-91D0', color: 'red', zone: 'NORTE / SARMIENTO', node: '5-0', people: 6, keywords: ['HERIDOS', 'CABLE CAÍDO'], score: 88, status: 'ESPERANDO' },
  { id: 'FRO-8B19', color: 'yellow', zone: 'LAS MORAS / CEIBOS', node: '2-3', people: 4, keywords: ['NIÑO', 'SIN AGUA'], score: 72, status: 'ESPERANDO' },
]

type SignalOption = { label: string; icon: any; tone: string }

const HELP_SIGNALS: SignalOption[] = [
  { label: 'SIN AGUA', icon: Droplets, tone: 'blue' },
  { label: 'ALIMENTOS', icon: UtensilsCrossed, tone: 'orange' },
  { label: 'HERIDOS LEVES', icon: HeartPulse, tone: 'red' },
  { label: 'ADULTO MAYOR', icon: UserRound, tone: 'purple' },
  { label: 'NIÑO / BEBÉ', icon: Baby, tone: 'yellow' },
  { label: 'CABLE CAÍDO', icon: Zap, tone: 'orange' },
]

const SAFE_SIGNALS: SignalOption[] = [
  { label: 'EN MI CASA', icon: Home, tone: 'blue' },
  { label: 'EN REFUGIO', icon: ShieldCheck, tone: 'green' },
  { label: 'CON MI FAMILIA', icon: Users, tone: 'purple' },
  { label: 'CON AGUA Y LUZ', icon: Zap, tone: 'yellow' },
  { label: 'PUEDO AYUDAR', icon: HeartHandshake, tone: 'green' },
]

type Screen = 'prepa' | 'central' | 'mobile'

function Header({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const tabs: [Screen, string][] = [
    ['prepa', 'REPORTE CIUDADANO'],
    ['central', 'FARO CENTRAL'],
    ['mobile', 'FARO MÓVIL'],
  ]
  return (
    <>
      <header className="topbar">
        <div className="logo"><span className="logo-mark"><Radio /></span><b>FARO</b><span>RED DE EMERGENCIA</span></div>
        <nav>{tabs.map(([id, label]) => <button key={id} className={screen === id ? 'nav-active' : ''} onClick={() => setScreen(id)}>{label}</button>)}</nav>
        <div className="system"><i /> OPERATIVO <strong>10:42</strong></div>
      </header>
      <div className="network"><span><WifiOff /> SIN INTERNET</span><span><Zap /> LORA ACTIVO</span><span><Circle /> 4 NODOS</span></div>
    </>
  )
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>('prepa')
  const [alerts, setAlerts] = useState(initialAlerts)
  const [mission, setMission] = useState<Alert | null>(null)

  const send = (color: Color, keywords: string[]) => {
    const next: Alert = {
      id: 'FRO-A104',
      color,
      zone: 'UBICACIÓN ACTUAL',
      node: '4-2',
      people: 1,
      keywords: keywords.length ? keywords : [color === 'red' ? 'PELIGRO INMEDIATO' : color === 'yellow' ? 'SOLICITUD DE ASISTENCIA' : 'A SALVO'],
      score: color === 'red' ? 95 : color === 'yellow' ? 68 : 20,
      status: 'ESPERANDO',
    }
    setAlerts(a => [next, ...a.filter(x => x.id !== next.id)].sort((x, y) => y.score - x.score))
  }

  const cancel = (id = 'FRO-A104') => {
    setAlerts(a => a.filter(x => x.id !== id))
  }

  const authorize = (a: Alert) => {
    setMission(a)
    setAlerts(list => list.map(x => (x.id === a.id ? { ...x, status: 'DESPACHADO' } : x)))
    setScreen('mobile')
  }

  return (
    <main className="app-shell">
      <Header screen={screen} setScreen={setScreen} />
      {screen === 'prepa' && <Prepa onSend={send} onCancel={cancel} />}
      {screen === 'central' && <Central alerts={alerts} authorize={authorize} />}
      {screen === 'mobile' && <Mobile mission={mission || alerts[0]} />}
    </main>
  )
}

/* ---------- PREPA: pantalla del ciudadano (servida por el ESP32) ---------- */

function Prepa({
  onSend,
  onCancel,
}: {
  onSend: (c: Color, k: string[]) => void
  onCancel: () => void
}) {
  const [level, setLevel] = useState<Level | null>(null)
  const [signals, setSignals] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const toggle = (s: string) => setSignals(list => (list.includes(s) ? list.filter(x => x !== s) : [...list, s]))

  const reset = () => {
    setLevel(null)
    setSignals([])
    setSent(false)
    setCancelled(false)
  }

  const handleSelect = (l: Level) => {
    setCancelled(false)
    setSignals([])
    setLevel(l)

    if (l === 'red') {
      // Envío DIRECTO e INMEDIATO sin opciones extra
      onSend('red', ['PELIGRO INMEDIATO'])
      setSent(true)
    }
  }

  const handleCancelDanger = () => {
    onCancel()
    setSent(false)
    setLevel(null)
    setSignals([])
    setCancelled(true)
  }

  // Vista de confirmación para PELIGRO enviado
  if (sent && level === 'red') {
    return (
      <section className="prepa-simple">
        <div className="danger-sent-card">
          <div className="danger-sent-header">
            <TriangleAlert className="danger-sent-icon" />
            <div>
              <h3>¡SEÑAL DE PELIGRO ENVIADA!</h3>
              <p>FARO Central recibió tu alerta prioritaria vía LoRa</p>
            </div>
          </div>
          <div className="danger-sent-advice">
            Prioridad de rescate máxima activada. Si la zona es insegura, mantente a resguardo.
          </div>
          <button className="cancel-danger-btn" onClick={handleCancelDanger}>
            <X /> ANULAR ALERTA (FUE UN ERROR)
          </button>
        </div>

        <button className="big-button outline-btn" onClick={reset}>
          VOLVER AL MENÚ DE ESTADO
        </button>
        <small><WifiOff /> Transmisión inmediata vía nodo LoRa local</small>
      </section>
    )
  }

  // Vista de confirmación para AYUDA o ESTOY BIEN
  if (sent) {
    const current = LEVELS.find(l => l.id === level)
    return (
      <section className="prepa-simple">
        <div className="success"><Check /><b>REPORTE ENVIADO</b></div>
        <div className={`sent-badge sent-${level}`}>
          <strong>{current?.label}</strong> {signals.length > 0 && `· ${signals.join(', ')}`}
        </div>
        <p className="instruction">
          {level === 'yellow'
            ? 'Tu pedido de asistencia está en cola de atención de FARO Central.'
            : 'Se registró que te encuentras a salvo en tu ubicación.'}
        </p>
        <button className="big-button outline-btn" onClick={reset}>
          NUEVO REPORTE O ACTUALIZAR
        </button>
        <small><WifiOff /> Transmisión confirmada vía radio LoRa</small>
      </section>
    )
  }

  const current = LEVELS.find(l => l.id === level)

  return (
    <section className="prepa-simple">
      <div className="prepa-topline">
        <div className="prepa-kicker">FARO · REPORTE RÁPIDO</div>
        <span className="prepa-signal"><i /> LORA ACTIVO</span>
      </div>
      <h1>¿Cómo estás?</h1>
      <p className="instruction">
        Toca una opción. <b>Peligro</b> se envía de inmediato; <b>Ayuda</b> y <b>Estoy bien</b> ofrecen opciones adicionales.
      </p>

      {cancelled && (
        <div className="anulado-notice">
          <CheckCircle2 />
          <span>Alerta de peligro anulada correctamente. Central fue notificada.</span>
        </div>
      )}

      <Semaforo value={level} onChange={handleSelect} />

      {/* Opciones extra solo para AYUDA */}
      {level === 'yellow' && (
        <div className="quick-tags">
          <span>¿QUÉ TIPO DE ASISTENCIA NECESITAS? (OPCIONAL)</span>
          <div className="tag-grid">
            {HELP_SIGNALS.map(({ label, icon: Icon, tone }) => (
              <button
                key={label}
                type="button"
                className={`tag-${tone} ${signals.includes(label) ? 'tag-on' : ''}`}
                aria-pressed={signals.includes(label)}
                onClick={() => toggle(label)}
              >
                <Icon />
                <b>{label}</b>
                {signals.includes(label) && <Check className="tag-check" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Opciones extra solo para ESTOY BIEN */}
      {level === 'green' && (
        <div className="quick-tags">
          <span>DETALLES DE TU SITUACIÓN (OPCIONAL)</span>
          <div className="tag-grid">
            {SAFE_SIGNALS.map(({ label, icon: Icon, tone }) => (
              <button
                key={label}
                type="button"
                className={`tag-${tone} ${signals.includes(label) ? 'tag-on' : ''}`}
                aria-pressed={signals.includes(label)}
                onClick={() => toggle(label)}
              >
                <Icon />
                <b>{label}</b>
                {signals.includes(label) && <Check className="tag-check" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Botón de envío para AYUDA o ESTOY BIEN */}
      {level && level !== 'red' && (
        <button
          className={`big-button send-${level}`}
          onClick={() => {
            onSend(level, signals)
            setSent(true)
          }}
        >
          {level === 'yellow'
            ? `ENVIAR PEDIDO DE AYUDA ${signals.length ? `(${signals.length})` : ''}`
            : `ENVIAR REPORTE · ESTOY BIEN ${signals.length ? `(${signals.length})` : ''}`} <span>→</span>
        </button>
      )}

      {!level && (
        <div className="select-prompt">
          Toca un botón arriba para continuar
        </div>
      )}

      <small><WifiOff /> Transmisión directa por radio LoRa · no requiere internet</small>
    </section>
  )
}

/* ---------- FARO CENTRAL ---------- */

function Central({ alerts, authorize }: { alerts: Alert[]; authorize: (a: Alert) => void }) {
  const [activeId, setActiveId] = useState(alerts[0].id)
  const active = alerts.find(a => a.id === activeId) || alerts[0]
  return (
    <div className="central-simple">
      <aside className="queue">
        <div className="eyebrow">ENTRADA DE SOLICITUDES</div>
        <div className="queue-title"><h1>Prioridad</h1><span>{alerts.length} ACTIVAS</span></div>
        {alerts.map(a => (
          <button className={`queue-item ${active.id === a.id ? 'active' : ''}`} key={a.id} onClick={() => setActiveId(a.id)}>
            <span className={`status-dot ${a.color}`} />
            <div><b>{a.zone}</b><small>{a.id} · {a.keywords.join(' · ')}</small>{a.status !== 'ESPERANDO' && <small className="dispatched">{a.status}</small>}</div>
            <strong>{a.score}</strong>
          </button>
        ))}
        <div className="queue-note"><ShieldAlert /><span><b>REGLA ACTIVA</b><small>Mayor riesgo + más personas = primero</small></span></div>
      </aside>
      <section className="matrix-wrap">
        <div className="matrix-head">
          <div><div className="eyebrow">FARO CENTRAL / MAPA DE DRONES</div><h1>Mejor camino a {active.zone}</h1></div>
          <span className="live"><i /> EN VIVO</span>
        </div>
        <DroneMap target={active.node} color={active.color} label={active.id} />
        <div className="matrix-footer">
          <div><span className="legend blue" /> RUTA SEGURA</div>
          <div><span className="legend gray" /> RUTA DIRECTA (CORTADA)</div>
          <div><span className="legend red" /> OBSTÁCULO</div>
          <div><span className="legend violet" /> DRON</div>
          <div><span className="legend green" /> NODO LORA</div>
          <button onClick={() => authorize(active)}>AUTORIZAR A-02 →</button>
        </div>
      </section>
    </div>
  )
}

/* ---------- FARO MÓVIL ---------- */

function Mobile({ mission }: { mission: Alert }) {
  const { safe } = useMemo(() => planRoute(mission.node), [mission.node])
  return (
    <section className="mobile-simple">
      <div className="mission-top"><div className="eyebrow">FARO MÓVIL / MISIÓN ACTIVA</div><span className="live"><i /> ENLACE OK</span></div>
      <h1>Ir a {mission.zone}</h1>
      <p><MapPin /> Solicitud {mission.id} · {mission.people} personas</p>
      <div className="mobile-route">
        <div className="route-line" />
        <div className="route-point"><Circle /><b>BASE FARO</b></div>
        {safe?.streets.map(s => <div key={s} className="route-point step"><Circle /><span>por {s}</span></div>)}
        <div className="route-point current"><Circle /><b>{mission.zone}</b><small>{safe ? `${safe.minutes} MIN · ${(safe.meters / 1000).toFixed(1).replace('.', ',')} KM · RUTA VERIFICADA POR DRONES` : 'SIN RUTA TRANSITABLE'}</small></div>
      </div>
      <div className="mobile-actions">
        <button className="big-button">LLEGUÉ AL PUNTO</button>
        <button className="outline-button">REPORTAR CORTE</button>
      </div>
    </section>
  )
}
