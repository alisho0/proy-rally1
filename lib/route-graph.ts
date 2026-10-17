/**
 * Grafo de calles del sector + cálculo de ruta.
 *
 * El mapa es un plano de manzanas (coordenadas SVG 800x500). Los drones,
 * enlazados por LoRa a los nodos ESP32, reportan obstáculos sobre tramos de
 * calle. La ruta se recalcula con Dijkstra:
 *   - tramo con obstáculo  -> bloqueado
 *   - tramo sin mapear     -> penalizado (no hay confirmación del dron)
 */

export const COLS = [60, 190, 320, 450, 580, 720]
export const ROWS = [70, 190, 310, 430]
export const COL_NAMES = ['SAN MARTÍN', 'MITRE', 'LOS CEIBOS', 'ESPAÑA', 'COLÓN', 'COSTANERA']
export const ROW_NAMES = ['SARMIENTO', 'RIVADAVIA', 'BELGRANO', 'LAS MORAS']
/** Columnas 4 y 5 están separadas por el arroyo: solo cruzan los puentes. */
export const BRIDGE_ROWS = [0, 2]
export const METERS_PER_UNIT = 2
/** Velocidad media estimada en calles dañadas (km/h). */
export const SPEED_KMH = 20
export const UNMAPPED_PENALTY = 2.5

export type NodeId = `${number}-${number}`
export type GraphNode = { id: NodeId; c: number; r: number; x: number; y: number }
export type Edge = { a: NodeId; b: NodeId; street: string; length: number; unmapped: boolean }

export type ObstacleKind = 'debris' | 'water' | 'cable' | 'tree' | 'bridge'
export type Obstacle = { id: string; kind: ObstacleKind; label: string; edge: [NodeId, NodeId]; drone: string; ago: string }

export const OBSTACLES: Obstacle[] = [
  { id: 'OB-1', kind: 'debris', label: 'ESCOMBROS', edge: ['1-3', '2-3'], drone: 'D-01', ago: '3 min' },
  { id: 'OB-2', kind: 'cable', label: 'CABLE CAÍDO', edge: ['2-1', '3-1'], drone: 'D-02', ago: '1 min' },
  { id: 'OB-3', kind: 'water', label: 'AGUA 60 CM', edge: ['2-2', '3-2'], drone: 'D-01', ago: '40 s' },
  { id: 'OB-4', kind: 'water', label: 'AGUA 40 CM', edge: ['3-2', '3-3'], drone: 'D-01', ago: '40 s' },
  { id: 'OB-5', kind: 'bridge', label: 'PUENTE DAÑADO', edge: ['4-2', '5-2'], drone: 'D-02', ago: '5 min' },
  { id: 'OB-6', kind: 'tree', label: 'ÁRBOL CAÍDO', edge: ['1-0', '1-1'], drone: 'D-02', ago: '2 min' },
]

/** Tramos que ningún dron confirmó todavía (zona sureste). */
const UNMAPPED: [NodeId, NodeId][] = [['5-1', '5-2'], ['5-2', '5-3']]

export const BASE_NODE: NodeId = '0-3'

export const key = (a: NodeId, b: NodeId) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const id = (c: number, r: number) => `${c}-${r}` as NodeId

export const NODES: Record<NodeId, GraphNode> = {}
COLS.forEach((x, c) => ROWS.forEach((y, r) => { NODES[id(c, r)] = { id: id(c, r), c, r, x, y } }))

const unmappedSet = new Set(UNMAPPED.map(([a, b]) => key(a, b)))
export const EDGES: Edge[] = []
COLS.forEach((x, c) => ROWS.forEach((y, r) => {
  if (c < COLS.length - 1 && (c !== 4 || BRIDGE_ROWS.includes(r))) {
    const b = id(c + 1, r)
    EDGES.push({ a: id(c, r), b, street: c === 4 ? `PUENTE ${ROW_NAMES[r]}` : ROW_NAMES[r], length: COLS[c + 1] - x, unmapped: unmappedSet.has(key(id(c, r), b)) })
  }
  if (r < ROWS.length - 1) {
    const b = id(c, r + 1)
    EDGES.push({ a: id(c, r), b, street: COL_NAMES[c], length: ROWS[r + 1] - y, unmapped: unmappedSet.has(key(id(c, r), b)) })
  }
}))

export type RouteResult = { path: NodeId[]; meters: number; minutes: number; streets: string[] }

/** Dijkstra sobre el grafo. `blocked` = claves de tramos intransitables. */
export function shortestPath(from: NodeId, to: NodeId, blocked: Set<string> = new Set(), usePenalty = true, favored: Set<string> = new Set()): RouteResult | null {
  const adj = new Map<NodeId, { to: NodeId; e: Edge }[]>()
  for (const e of EDGES) {
    if (blocked.has(key(e.a, e.b))) continue
    adj.set(e.a, [...(adj.get(e.a) || []), { to: e.b, e }])
    adj.set(e.b, [...(adj.get(e.b) || []), { to: e.a, e }])
  }
  const dist = new Map<NodeId, number>([[from, 0]])
  const prev = new Map<NodeId, { node: NodeId; e: Edge }>()
  const open = new Set<NodeId>([from])
  const done = new Set<NodeId>()
  while (open.size) {
    let u: NodeId | null = null
    for (const n of open) if (u === null || dist.get(n)! < dist.get(u)!) u = n
    open.delete(u!)
    done.add(u!)
    if (u === to) break
    for (const { to: v, e } of adj.get(u!) || []) {
      if (done.has(v)) continue
      const factor = usePenalty && e.unmapped ? UNMAPPED_PENALTY : favored.has(key(e.a, e.b)) ? 0.99 : 1
      const cost = dist.get(u!)! + e.length * factor
      if (cost < (dist.get(v) ?? Infinity)) { dist.set(v, cost); prev.set(v, { node: u!, e }); open.add(v) }
    }
  }
  if (!prev.has(to) && from !== to) return null
  const path: NodeId[] = [to]
  const streets: string[] = []
  let units = 0
  for (let n = to; n !== from;) {
    const p = prev.get(n)!
    units += p.e.length
    if (streets[0] !== p.e.street) streets.unshift(p.e.street)
    path.unshift(p.node)
    n = p.node
  }
  const meters = Math.round(units * METERS_PER_UNIT)
  return { path, meters, minutes: Math.max(1, Math.round((meters / 1000 / SPEED_KMH) * 60)), streets }
}

export const blockedSet = (obstacles: Obstacle[]) => new Set(obstacles.map(o => key(...o.edge)))

/** Ruta segura (evita obstáculos) y ruta ingenua (la que se tomaría sin drones). */
export function planRoute(target: NodeId) {
  const safe = shortestPath(BASE_NODE, target, blockedSet(OBSTACLES))
  // Ruta "a ciegas": la más corta sin datos de drones. En empates, se prefiere
  // la que pasa por tramos dañados para mostrar qué evitó el mapeo.
  const naive = shortestPath(BASE_NODE, target, new Set(), false, blockedSet(OBSTACLES))
  // Solo se muestra si de verdad era más corta: así se ve qué evitó el mapeo.
  const naiveBlockedBy = naive && safe && naive.meters < safe.meters ? OBSTACLES.filter(o => naive.path.some((n, i) => i > 0 && key(naive.path[i - 1], n) === key(...o.edge))) : []
  return { safe, naive, naiveBlockedBy }
}

export const toPoints = (path: NodeId[]) => path.map(n => `${NODES[n].x},${NODES[n].y}`).join(' ')
