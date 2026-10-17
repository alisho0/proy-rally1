'use client'

import { Check, HeartPulse, ShieldCheck, TriangleAlert } from 'lucide-react'

export type Level = 'red' | 'yellow' | 'green'

export const LEVELS: { id: Level; label: string; desc: string; icon: typeof Check }[] = [
  { id: 'red', label: 'PELIGRO', desc: 'Hay riesgo para la vida', icon: TriangleAlert },
  { id: 'yellow', label: 'AYUDA', desc: 'Necesito asistencia', icon: HeartPulse },
  { id: 'green', label: 'ESTOY BIEN', desc: 'Estoy a salvo', icon: ShieldCheck },
]

/**
 * Selector de urgencia con forma de semáforo vertical.
 * Rojo arriba, amarillo al medio, verde abajo: el orden que todos reconocen.
 * Al elegir una luz, esa se enciende y las otras se apagan.
 */
export function Semaforo({ value, onChange }: { value: Level | null; onChange: (l: Level) => void }) {
  return (
    <div className="semaforo-wrap">
      <div className={`semaforo ${value ? 'has-value' : ''}`} role="radiogroup" aria-label="Nivel de urgencia">
        {LEVELS.map(({ id, label, desc, icon: Icon }) => {
          const on = value === id
          return (
            <button key={id} type="button" role="radio" aria-checked={on} className={`luz luz-${id} ${on ? 'on' : ''}`} onClick={() => onChange(id)}>
              <span className="lamp" aria-hidden><Icon /></span>
              <span className="luz-text"><strong>{label}</strong><small>{desc}</small></span>
              <span className="luz-mark" aria-hidden>{on && <Check />}</span>
            </button>
          )
        })}
      </div>
      <span className="semaforo-pole" aria-hidden />
    </div>
  )
}
