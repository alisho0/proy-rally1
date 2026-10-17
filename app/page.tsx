'use client'

import { useMemo, useState } from 'react'
import { Baby, Check, Circle, Droplets, HeartPulse, MapPin, Radio, ShieldAlert, UserRound, WifiOff, Zap } from 'lucide-react'
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

const SIGNALS = [
  { label: 'HERIDOS', icon: HeartPulse, tone: 'red' },
  { label: 'SIN AGUA', icon: Droplets, tone: 'blue' },
  { label: 'NIÑO', icon: Baby, tone: 'yellow' },
  { label: 'ADULTO MAYOR', icon: UserRound, tone: 'purple' },
  { label: 'CABLE CAÍDO', icon: Zap, tone: 'orange' },
]

type Screen = 'prepa' | 'central' | 'mobile'

function Header({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const tabs: [Screen, string][] = [['prepa', 'PREPA'], ['central', 'FARO CENTRAL'], ['mobile', 'FARO MÓVIL']]
  return (
    <>
      <header className="topbar">
        <div className="logo"><span className="logo-mark"><Radio /></span><b>FARO</b><span>CENTRAL</span></div>
        <nav>{tabs.map(([id, label]) => <button key={id} className={screen === id ? 'nav-active' : ''} onClick={() => setScreen(id)}>{label}</button>)}</nav>
        <div className="system"><i /> OPERATIVO <strong>10:42</strong></div>
      </header>
      <div className="network"><span><WifiOff /> SIN INTERNET</span><span><Zap /> LORA ACTIVO</span><span><Circle /> 4 NODOS</span></div>
    </>
  )
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>('central')
  const [alerts, setAlerts] = useState(initialAlerts)
  const [mission, setMission] = useState<Alert | null>(null)

  const send = (color: Color, keywords: string[]) => {
    const next: Alert = { id: 'FRO-A104', color, zone: 'UBICACIÓN ACTUAL', node: '4-2', people: 1, keywords: keywords.length ? keywords : ['SOLICITUD NUEVA'], score: color === 'red' ? 91 : color === 'yellow' ? 68 : 20, status: 'ESPERANDO' }
    setAlerts(a => [next, ...a.filter(x => x.id !== next.id)].sort((x, y) => y.score - x.score))
  }
  const authorize = (a: Alert) => {
    setMission(a)
    setAlerts(list => list.map(x => (x.id === a.id ? { ...x, status: 'DESPACHADO' } : x)))
    setScreen('mobile')
  }

  return (
    <main className="app-shell">
      <Header screen={screen} setScreen={setScreen} />
      {screen === 'prepa' && <Prepa onSend={send} />}
      {screen === 'central' && <Central alerts={alerts} authorize={authorize} />}
      {screen === 'mobile' && <Mobile mission={mission || alerts[0]} />}
    </main>
  )
}

/* ---------- PREPA: pantalla del ciudadano (servida por el ESP32) ---------- */

function Prepa({ onSend }: { onSend: (c: Color, k: string[]) => void }) {
  const [level, setLevel] = useState<Level | null>(null)
  const [signals, setSignals] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const toggle = (s: string) => setSignals(list => (list.includes(s) ? list.filter(x => x !== s) : [...list, s]))
  const reset = () => { setLevel(null); setSignals([]); setSent(false) }
  const current = LEVELS.find(l => l.id === level)

  if (sent) return (
    <section className="prepa-simple">
      <div className="success"><Check /><b>RECIBIDO</b></div>
      <h1>Reporte enviado</h1>
      <p className="instruction">FARO Central ya está priorizando tu solicitud. Quédate donde estás si es seguro.</p>
      <button className="big-button" onClick={reset}>NUEVO REPORTE</button>
    </section>
  )

  return (
    <section className="prepa-simple">
      <div className="prepa-topline"><div className="prepa-kicker">PREPA / REPORTE RÁPIDO</div><span className="prepa-signal"><i /> SIN INTERNET</span></div>
      <h1>¿Cómo estás?</h1>
      <p className="instruction">Toca un color y envía.</p>

      <Semaforo value={level} onChange={l => { setLevel(l); if (l === 'green') setSignals([]) }} />

      {level && level !== 'green' && (
        <div className="quick-tags">
          <span>¿ALGO MÁS? (OPCIONAL)</span>
          <div className="tag-grid">
            {SIGNALS.map(({ label, icon: Icon, tone }) => (
              <button key={label} className={`tag-${tone} ${signals.includes(label) ? 'tag-on' : ''}`} aria-pressed={signals.includes(label)} onClick={() => toggle(label)}><Icon /><b>{label}</b>{signals.includes(label) && <Check className="tag-check" />}</button>
            ))}
          </div>
        </div>
      )}

      <button disabled={!level} className={`big-button send-${level ?? 'none'}`} onClick={() => { onSend(level!, signals); setSent(true) }}>
        {current ? `ENVIAR · ${current.label}` : 'ELIGE UN COLOR'} <span>→</span>
      </button>
      <small><WifiOff /> Se envía por LoRa · no requiere internet</small>
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
