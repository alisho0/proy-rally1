'use client'

import { Check, HeartPulse, ShieldCheck, TriangleAlert } from 'lucide-react'

export type Level = 'red' | 'yellow' | 'green'

export interface LevelConfig {
  id: Level
  label: string
  hint: string
  icon: typeof TriangleAlert
}

export const LEVELS: LevelConfig[] = [
  {
    id: 'red',
    label: 'PELIGRO',
    hint: 'Envío directo al tocar',
    icon: TriangleAlert,
  },
  {
    id: 'yellow',
    label: 'AYUDA',
    hint: 'Asistencia y opciones',
    icon: HeartPulse,
  },
  {
    id: 'green',
    label: 'ESTOY BIEN',
    hint: 'A salvo y opciones',
    icon: ShieldCheck,
  },
]

/**
 * Botones de estado sólidos y simples.
 * Al tocar Peligro se emite señal directa e inmediata.
 * Ayuda y Estoy Bien despliegan opciones adicionales.
 */
export function Semaforo({
  value,
  onChange,
}: {
  value: Level | null
  onChange: (l: Level) => void
}) {
  return (
    <div
      className={`solid-selector ${value ? 'has-selection' : ''}`}
      role="radiogroup"
      aria-label="Nivel de urgencia"
    >
      {LEVELS.map(({ id, label, hint, icon: Icon }) => {
        const isSelected = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`solid-btn btn-${id} ${isSelected ? 'selected' : ''}`}
            onClick={() => onChange(id)}
          >
            <div className="solid-btn-main">
              <span className="solid-btn-icon" aria-hidden>
                <Icon />
              </span>
              <div className="solid-btn-titles">
                <strong className="solid-btn-label">{label}</strong>
                <span className="solid-btn-hint">{hint}</span>
              </div>
            </div>

            <div className="solid-btn-status" aria-hidden>
              {isSelected ? (
                <span className="solid-btn-check">
                  <Check />
                </span>
              ) : (
                <span className="solid-btn-radio" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
