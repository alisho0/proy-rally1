'use client'

import { useMemo, useState } from 'react'
import { Construction, Drone, Layers, Radio, Route, TreePine, TriangleAlert, Waves, Zap } from 'lucide-react'
import { BRIDGE_ROWS, COLS, METERS_PER_UNIT, NODES, OBSTACLES, ROWS, ROW_NAMES, COL_NAMES, BASE_NODE, planRoute, toPoints, type NodeId, type ObstacleKind } from '@/lib/route-graph'

type Color = 'red' | 'yellow' | 'green'

/* ---------- Datos estáticos del sector (generados una vez) ---------- */

const RIVER_GAP: [number, number] = [580, 720]
const AVENUE_ROW = 190 // Av. Rivadavia, más ancha
const hash = (a: number, b: number, c: number) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s) }

type Block = { x: number; y: number; w: number; h: number; kind: 'urban' | 'park' | 'collapse'; lots: { x: number; y: number; w: number; h: number; shade: number; damaged?: boolean }[] }

const BLOCKS: Block[] = (() => {
  const xs = [-70, ...COLS, 850]
  const ys = [-50, ...ROWS, 550]
  const out: Block[] = []
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]]
    if (x0 === RIVER_GAP[0] && x1 === RIVER_GAP[1]) continue
    const top = y0 === AVENUE_ROW ? 17 : 12
    const bottom = y1 === AVENUE_ROW ? 17 : 12
    const b: Block = { x: x0 + 12, y: y0 + top, w: x1 - x0 - 24, h: y1 - y0 - top - bottom, kind: 'urban', lots: [] }
    if (x0 === 190 && y0 === 70) b.kind = 'park'
    if (x0 === 320 && y0 === 70) b.kind = 'collapse'
    if (b.kind !== 'park') {
      // Edificación sobre el perímetro de la manzana y pulmón libre al centro.
      const n = Math.max(2, Math.round(b.w / 24))
      const lw = b.w / n
      for (const side of [0, 1]) for (let k = 0; k < n; k++) {
        const r = hash(i, j, k + side * 31)
        const h = b.h * (0.26 + r * 0.16)
        b.lots.push({ x: b.x + k * lw + 1, y: side ? b.y + b.h - h : b.y, w: lw - 2, h, shade: r, damaged: b.kind === 'collapse' && side === 1 && k >= n - 3 })
      }
    }
    out.push(b)
  }
  return out
})()

const FLOOD = 'M300 330 C 340 314, 432 318, 472 340 C 502 360, 486 410, 432 422 C 380 434, 318 422, 298 396 C 284 376, 284 346, 300 330 Z'
const RIVER = 'M655 -10 C 628 70, 682 140, 650 220 S 620 390, 662 510'
const UNMAPPED = 'M700 160 H810 V510 H596 V330 H700 Z'

const LORA = [
  { id: 'BASE', x: 60, y: 430 }, { id: 'N-01', x: 255, y: 250 }, { id: 'N-02', x: 515, y: 250 },
  { id: 'N-03', x: 385, y: 130 }, { id: 'N-04', x: 650, y: 150 },
]
const MESH = [['BASE', 'N-01'], ['N-01', 'N-03'], ['N-01', 'N-02'], ['N-03', 'N-02'], ['N-03', 'N-04'], ['N-02', 'N-04']]

const DRONES = [
  { id: 'D-01', battery: 64, status: 'ESCANEANDO', path: 'M270 340 H500 V370 H270 V400 H500 V428 H270', swath: 30, dur: 26 },
  { id: 'D-02', battery: 41, status: 'ESCANEANDO', path: 'M470 40 H780 V85 H470 V130 H780', swath: 45, dur: 22 },
  { id: 'D-03', battery: 88, status: 'EN TRÁNSITO', path: 'M120 470 L400 470 L590 450 L700 380 L760 300', swath: 0, dur: 18 },
]

const OBSTACLE_ICON: Record<ObstacleKind, typeof Zap> = { debris: Construction, water: Waves, cable: Zap, tree: TreePine, bridge: TriangleAlert }
const TONE: Record<Color, string> = { red: '#ff5b5b', yellow: '#f6c84c', green: '#5bd49a' }

const mid = (a: NodeId, b: NodeId) => ({ x: (NODES[a].x + NODES[b].x) / 2, y: (NODES[a].y + NODES[b].y) / 2 })
const km = (m: number) => (m / 1000).toFixed(2).replace('.', ',')

/* ---------- Componente ---------- */

export function DroneMap({ target, color, label }: { target: NodeId; color: Color; label: string }) {
  const [layers, setLayers] = useState({ drones: true, obstacles: true, lora: true })
  const { safe, naive, naiveBlockedBy } = useMemo(() => planRoute(target), [target])
  const t = NODES[target]
  const base = NODES[BASE_NODE]
  const toggle = (k: keyof typeof layers) => setLayers(l => ({ ...l, [k]: !l[k] }))

  return (
    <div className="map">
      <div className="map-scroll"><div className="map-canvas">
        <svg viewBox="0 0 800 500" role="img" aria-label={`Mapa del sector. Ruta segura desde la base hasta ${label}`}>
          <defs>
            <pattern id="p-water" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 4 Q2.5 1 5 4 T10 4" fill="none" stroke="#6cc4e0" strokeWidth=".8" opacity=".55" /></pattern>
            <pattern id="p-fog" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8aa09a" strokeWidth="1" opacity=".22" /></pattern>
            <pattern id="p-rubble" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="#ff8a7a" opacity=".6" /><circle cx="4" cy="3.5" r=".7" fill="#c9a28f" opacity=".6" /></pattern>
          </defs>

          {/* Terreno, manzanas y edificación */}
          <rect x="-10" y="-10" width="820" height="520" fill="#171e1c" />
          {BLOCKS.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={b.kind === 'park' ? '#1f3326' : '#1d2523'} stroke="#2a3431" strokeWidth=".8" />
              {b.kind === 'park' && <g className="trees">{Array.from({ length: 14 }, (_, k) => <circle key={k} cx={b.x + 10 + hash(k, 1, 2) * (b.w - 20)} cy={b.y + 10 + hash(k, 3, 4) * (b.h - 20)} r={4 + hash(k, 5, 6) * 4} fill="#2b4a33" stroke="#355a3e" strokeWidth=".6" />)}<text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} className="map-place">PLAZA</text></g>}
              {b.lots.map((l, k) => <rect key={k} x={l.x} y={l.y} width={l.w} height={l.h} fill={l.damaged ? 'url(#p-rubble)' : `hsl(160 6% ${22 + l.shade * 9}%)`} stroke={l.damaged ? '#ff5b5b' : '#151b19'} strokeWidth={l.damaged ? 1 : .6} strokeDasharray={l.damaged ? '2 2' : undefined} />)}
              {b.kind === 'collapse' && <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} className="map-place danger">DERRUMBE</text>}
            </g>
          ))}

          {/* Arroyo y zona anegada */}
          <rect x="592" y="-10" width="116" height="520" fill="#1c2b22" />
          <path d={RIVER} fill="none" stroke="#2f6d82" strokeWidth="46" opacity=".55" />
          <path d={RIVER} fill="none" stroke="#183f50" strokeWidth="36" />
          <text x="664" y="262" className="map-water" transform="rotate(-78 664 262)">ARROYO LAS MORAS</text>
          <path d={FLOOD} fill="#1e5a74" opacity=".45" />
          <path d={FLOOD} fill="url(#p-water)" stroke="#55b8d8" strokeWidth="1" strokeDasharray="5 4" />
          <text x="345" y="412" className="map-water">ZONA ANEGADA</text>

          {/* Calles */}
          <g className="streets">
            {ROWS.map((y, r) => {
              const w = y === AVENUE_ROW ? 22 : 15
              const segs: [number, number][] = [[-10, RIVER_GAP[0]], [RIVER_GAP[1], 810]]
              return segs.map(([a, b]) => <g key={`${r}${a}`}><line x1={a} y1={y} x2={b} y2={y} stroke="#0f1412" strokeWidth={w + 3} /><line x1={a} y1={y} x2={b} y2={y} stroke="#3c4542" strokeWidth={w} />{y === AVENUE_ROW && <line x1={a} y1={y} x2={b} y2={y} stroke="#6a736e" strokeWidth="1" strokeDasharray="10 8" />}</g>)
            })}
            {COLS.map((x, c) => <g key={c}><line x1={x} y1={-10} x2={x} y2={510} stroke="#0f1412" strokeWidth="18" /><line x1={x} y1={-10} x2={x} y2={510} stroke="#3c4542" strokeWidth="15" /></g>)}
            {BRIDGE_ROWS.map(r => <g key={r}><rect x={RIVER_GAP[0]} y={ROWS[r] - 9} width={RIVER_GAP[1] - RIVER_GAP[0]} height="18" fill="#47504c" stroke="#9aa59f" strokeWidth="1.2" /><line x1={RIVER_GAP[0]} y1={ROWS[r]} x2={RIVER_GAP[1]} y2={ROWS[r]} stroke="#5d6762" strokeDasharray="6 6" /></g>)}
          </g>
          <g className="street-names">
            {ROW_NAMES.map((n, r) => <text key={n} x="125" y={ROWS[r] + 3}>{r === 1 ? `AV. ${n}` : n}</text>)}
            {COL_NAMES.map((n, c) => <text key={n} x={COLS[c] + 3} y="250" transform={`rotate(-90 ${COLS[c] + 3} 250)`}>{n}</text>)}
          </g>

          {/* Zona sin confirmar por drones */}
          <path d={UNMAPPED} fill="#0b100f" opacity=".55" />
          <path d={UNMAPPED} fill="url(#p-fog)" stroke="#8aa09a" strokeOpacity=".35" strokeDasharray="4 4" />
          <text x="752" y="485" className="map-fog">SIN MAPEAR</text>

          {/* Barrido de drones: lo ya relevado */}
          {layers.drones && DRONES.map(d => d.swath ? <path key={d.id} d={d.path} className="swath" strokeWidth={d.swath} /> : <path key={d.id} d={d.path} className="transit" />)}

          {/* Malla LoRa */}
          {layers.lora && <g className="lora">
            {LORA.map(n => <circle key={n.id} cx={n.x} cy={n.y} r="150" className="lora-range" />)}
            {MESH.map(([a, b]) => { const p = LORA.find(n => n.id === a)!, q = LORA.find(n => n.id === b)!; return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="lora-link" /> })}
          </g>}

          {/* Rutas */}
          {naive && naiveBlockedBy.length > 0 && <polyline points={toPoints(naive.path)} className="naive-route" />}
          {safe && <><polyline points={toPoints(safe.path)} className="route-casing" /><polyline points={toPoints(safe.path)} className="route-line" /></>}

          {/* Obstáculos detectados */}
          {layers.obstacles && OBSTACLES.map(o => {
            const [a, b] = o.edge, m = mid(a, b), Icon = OBSTACLE_ICON[o.kind]
            const relevant = naiveBlockedBy.includes(o)
            return <g key={o.id} className={`obstacle ${relevant ? 'relevant' : ''}`}>
              <title>{`${o.label} · detectado por ${o.drone} hace ${o.ago}`}</title>
              <line x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} className="blocked-edge" />
              <circle cx={m.x} cy={m.y} r="12" />
              <Icon x={m.x - 7} y={m.y - 7} width={14} height={14} />
              {relevant && <text x={m.x} y={m.y - 18}>{o.label}</text>}
            </g>
          })}

          {/* Nodos LoRa (ESP32) */}
          {layers.lora && LORA.filter(n => n.id !== 'BASE').map(n => <g key={n.id} className="lora-node"><path d={`M${n.x} ${n.y - 9} L${n.x + 7} ${n.y + 5} H${n.x - 7} Z`} /><circle cx={n.x} cy={n.y - 9} r="2.4" /><text x={n.x} y={n.y + 16}>{n.id}</text></g>)}

          {/* Base y destino */}
          <g className="base-marker"><rect x={base.x - 11} y={base.y - 11} width="22" height="22" rx="4" /><path d={`M${base.x - 5} ${base.y + 4} V${base.y - 1} L${base.x} ${base.y - 6} L${base.x + 5} ${base.y - 1} V${base.y + 4} Z`} /><text x={base.x + 16} y={base.y - 14}>BASE FARO</text></g>
          <g className="target-marker" style={{ color: TONE[color] }}>
            <circle cx={t.x} cy={t.y} r="22" className="pulse" />
            <circle cx={t.x} cy={t.y} r="11" className="core" />
            <circle cx={t.x} cy={t.y} r="4" fill="#fff" />
            <text x={t.x} y={t.y - 20}>{label}</text>
          </g>

          {/* Drones en vuelo */}
          {layers.drones && DRONES.map(d => (
            <g key={d.id} className="drone">
              <animateMotion dur={`${d.dur}s`} repeatCount="indefinite" path={d.path} keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" />
              {d.swath > 0 && <circle r={d.swath / 2 + 6} className="footprint" />}
              <path d="M-6 -6 L6 6 M6 -6 L-6 6" className="arms" />
              {[[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.6" className="rotor" />)}
              <rect x="-2.5" y="-2.5" width="5" height="5" className="body" />
              <text y="22">{`${d.id} · ${d.battery}%`}</text>
            </g>
          ))}

          {/* Norte y escala */}
          <g className="map-compass" transform="translate(770 34)"><circle r="15" /><path d="M0 -11 L5 4 L0 1 L-5 4 Z" /><text y="-18">N</text></g>
          <g className="map-scale" transform="translate(24 486)"><path d={`M0 -4 V0 H${100} V-4`} /><text x="0" y="-8">0</text><text x={100} y="-8">{100 * METERS_PER_UNIT} m</text></g>
        </svg>

        <div className="map-layers" role="group" aria-label="Capas del mapa">
          <Layers aria-hidden />
          {([['drones', 'Drones', Drone], ['obstacles', 'Obstáculos', TriangleAlert], ['lora', 'LoRa', Radio]] as const).map(([k, l, Icon]) => (
            <button key={k} aria-pressed={layers[k]} onClick={() => toggle(k)}><Icon />{l}</button>
          ))}
        </div>
      </div></div>

      <div className="map-card">
        {safe ? <>
          <div className="map-card-main"><Route /><b>RUTA SEGURA</b><strong>{km(safe.meters)} km · {safe.minutes} min</strong></div>
          <small>vía {safe.streets.join(' → ')}</small>
          {naive && naiveBlockedBy.length > 0 && <small className="avoid">Evita {naiveBlockedBy.map(o => o.label).join(', ')} · la ruta directa ({km(naive.meters)} km) está cortada</small>}
        </> : <div className="map-card-main danger"><TriangleAlert /><b>SIN RUTA TRANSITABLE</b></div>}
        <small className="sync"><Drone /> Mapa actualizado por {DRONES.length} drones vía LoRa · hace 40 s</small>
      </div>
    </div>
  )
}
