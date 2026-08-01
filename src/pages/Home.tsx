import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ToastProvider, useToast } from '../components/Toast.tsx'

interface Winner {
  name: string
  timestamp: string
  date: string
}

const MAX_PARTICIPANTS = 5000
const STORAGE_KEY = 'lucky-draw-winners'
const PARTICIPANTS_KEY = 'lucky-draw-participants'
const SOUND_ENABLED_KEY = 'lucky-draw-sound'

// Myanmar Unicode range: U+1000 - U+109F (only check first character)
function isMyanmarName(name: string): boolean {
  return /^[\u1000-\u109F]/.test(name.trim())
}

// Sort: Myanmar names first, then Latin names A-Z
function sortParticipants(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aMy = isMyanmarName(a)
    const bMy = isMyanmarName(b)
    if (aMy && !bMy) return -1
    if (!aMy && bMy) return 1
    if (aMy && bMy) return a.localeCompare(b, 'my')
    return a.localeCompare(b, 'en', { sensitivity: 'base' })
  })
}

function useSoundEffect() {
  const audioCtxRef = useRef<AudioContext | null>(null)

  const playTick = useCallback((frequency?: number, power = 1) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const t0 = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      const base = frequency ?? 800 + Math.random() * 400
      osc.frequency.setValueAtTime(base, t0)
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, t0 + 0.06)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.05 * power, t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07)
      osc.start(t0)
      osc.stop(t0 + 0.07)
    } catch {
      // audio not available
    }
  }, [])

  const playStep = useCallback(() => {
    // Mechanical slot "thunk": two quick low tones
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const t0 = ctx.currentTime
      ;[480, 260].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(freq, t0 + i * 0.05)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t0 + i * 0.05 + 0.07)
        osc.type = 'triangle'
        gain.gain.setValueAtTime(0.12, t0 + i * 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.05 + 0.09)
        osc.start(t0 + i * 0.05)
        osc.stop(t0 + i * 0.05 + 0.1)
      })
    } catch {
      // audio not available
    }
  }, [])

  const playWin = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const notes = [523, 659, 784, 1047, 1319]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = i === notes.length - 1 ? 'triangle' : 'sine'
        const vol = i === notes.length - 1 ? 0.14 : 0.1
        gain.gain.setValueAtTime(vol, ctx.currentTime + i * 0.14)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.45)
        osc.start(ctx.currentTime + i * 0.14)
        osc.stop(ctx.currentTime + i * 0.14 + 0.5)
      })
    } catch {
      // audio not available
    }
  }, [])

  return { playTick, playStep, playWin }
}

function ConfettiOverlay() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6B9D', '#C084FC'][Math.floor(Math.random() * 6)],
    size: 6 + Math.random() * 8,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

function ParticipantInput({
  value,
  onChange,
  onAdd,
  onKeyDown,
  participantCount,
  maxParticipants,
}: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  participantCount: number
  maxParticipants: number
}) {
  return (
    <div className="flex gap-3">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="နာမည် ထည့်ပါ... (ကော်မာ , ခြားပြီး အများကြီး ထည့်နိုင်)"
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all text-base"
          disabled={participantCount >= maxParticipants}
        />
      </div>
      <button
        onClick={onAdd}
        disabled={!value.trim() || participantCount >= maxParticipants}
        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all active:scale-95 flex items-center gap-2 text-sm"
      >
        <span>+</span>
        <span className="hidden xs:inline">ထည့်မယ်</span>
      </button>
    </div>
  )
}

function ParticipantList({
  participants,
  onRemove,
}: {
  participants: string[]
  onRemove: (index: number) => void
}) {
  if (participants.length === 0) {
    return (
      <div className="text-center py-12 text-white/50">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm">ပါဝင်သူ မရှိသေးပါ</p>
        <p className="text-xs mt-1 opacity-60">အထက်ပါအကွက်တွင် နာမည်များ ထည့်သွင်းပါ</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {participants.map((name, i) => (
        <div
          key={`${name}-${i}`}
          className="group relative p-3 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/40 hover:bg-white/[0.07] transition-all"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/60 to-purple-400/40 flex items-center justify-center text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="text-sm font-medium truncate flex-1 text-white/90">{name}</span>
            <button
              onClick={() => onRemove(i)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg transition-all text-white/50 hover:text-red-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DrawButton({
  onClick,
  disabled,
  isDrawing,
}: {
  onClick: () => void
  disabled: boolean
  isDrawing: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative w-full py-4 rounded-2xl font-bold text-lg mont-font tracking-wide
        transition-all duration-300 active:scale-95
        ${isDrawing
          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white animate-pulse-glow'
          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
        }
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
      `}
    >
      {isDrawing ? (
        <span className="flex items-center justify-center gap-3">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>ရွေးချယ်နေသည်...</span>
        </span>
      ) : (
        <span>🎯 ကံထူးရှင်ရွေးချယ်ရန်!</span>
      )}
    </button>
  )
}

function CasinoSlot({
  participants,
  soundEnabled,
  playTick,
  playStep,
  onFinished,
}: {
  participants: string[]
  soundEnabled: boolean
  playTick: (freq?: number, power?: number) => void
  playStep: () => void
  onFinished: (winner: string) => void
}) {
  const ROW_H = 48

  // Build the reel: every name appears 10 rounds (shuffled each round) + winner + spacer
  const { reel, winner } = useMemo(() => {
    const maxItems = 8000
    const rounds = Math.max(3, Math.min(20, Math.floor((maxItems - 2) / Math.max(1, participants.length))))
    // Fisher-Yates fair shuffle each round - names spin in random order
    const shuffle = (arr: string[]): string[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }

    const names: string[] = []
    for (let r = 0; r < rounds; r++) {
      names.push(...shuffle(participants))
    }
    const win = participants[Math.floor(Math.random() * participants.length)]
    names.push(win, '')
    return { reel: names, winner: win }
  }, [participants])

  const [offset, setOffset] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [ease, setEase] = useState('cubic-bezier(0.12, 0.8, 0.2, 1)')
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    // Triple suspense spin (~30s):
    // Main fast spin → [steps "him? me?" → sudden re-spin] × 3 → final steps → reveal
    const w = reel.length - 2 // winner index
    let cancelled = false
    let tickTimeout: number | null = null
    const timers: number[] = []
    const schedule = (fn: () => void, ms: number) => {
      if (cancelled) return
      timers.push(window.setTimeout(fn, ms))
    }
    // Speed-matched ticks: fast when the reel is fast, slow when it's slow
    const startTicks = (duration: number) => {
      stopTicks()
      const startTime = performance.now()
      const step = () => {
        if (cancelled) return
        const elapsed = performance.now() - startTime
        const p = Math.min(1, elapsed / Math.max(1, duration))
        const ease = Math.sin(p * Math.PI) // 0 -> 1 -> 0
        const delay = Math.max(30, Math.round(170 - ease * 135)) // 170ms edges, 35ms middle
        if (soundEnabled) playTick(400 + ease * 650, 0.8 + ease * 0.6)
        if (elapsed < duration) {
          tickTimeout = window.setTimeout(step, delay)
        }
      }
      step()
    }
    const stopTicks = () => {
      if (tickTimeout !== null) {
        window.clearTimeout(tickTimeout)
        tickTimeout = null
      }
    }
    const stepEase = 'cubic-bezier(0.2, 0.7, 0.3, 1)'
    const spinEase = 'cubic-bezier(0.55, 0, 0.95, 0.35)'

    // --- Phase 1: main fast spin ---
    const p1 = Math.max(1, w - 50)
    let t = 150
    startTicks(4500)
    schedule(() => {
      setEase(spinEase)
      setTransitionMs(4500)
      setOffset(-(p1 - 1) * ROW_H)
    }, t)
    t += 4500
    schedule(() => {
      stopTicks()
    }, t)

    // --- Cycles: slow steps + sudden re-spin, x3 ---
    const cycles = [
      { start: p1 + 1, respinTo: Math.max(1, w - 35), respinMs: 2500, pauses: [350, 420, 500, 600, 700], trans: 230 },
      { start: Math.max(1, w - 35) + 1, respinTo: Math.max(1, w - 20), respinMs: 2500, pauses: [380, 450, 530, 630, 740], trans: 230 },
      { start: Math.max(1, w - 20) + 1, respinTo: Math.max(1, w - 9), respinMs: 2200, pauses: [400, 480, 570, 680, 800], trans: 240 },
    ]

    for (const cyc of cycles) {
      // Slow steps - "is it him?"
      for (let i = 0; i < cyc.pauses.length; i++) {
        const m = Math.min(w - 9, cyc.start + i)
        const pause = cyc.pauses[i]
        const trans = cyc.trans
        schedule(() => {
          stopTicks()
          setEase(stepEase)
          setTransitionMs(trans)
          setOffset(-(m - 1) * ROW_H)
          playStep()
        }, t)
        t += pause
      }

      // Sudden fast re-spin
      t += 300 // moment of silence - "is it stopping?"
      schedule(() => {
        startTicks(cyc.respinMs)
        setEase(spinEase)
        setTransitionMs(cyc.respinMs)
        setOffset(-(cyc.respinTo - 1) * ROW_H)
      }, t)
      t += cyc.respinMs
      schedule(() => {
        stopTicks()
        if (soundEnabled) playTick(200)
      }, t)
      t += 250
    }

    // --- Final steps to the winner ---
    const finalPauses = [400, 470, 550, 650, 770, 920, 1100, 1300, 1500]
    const finalTrans = [230, 230, 240, 240, 260, 280, 300, 320, 420]
    for (let i = 1; i <= 9; i++) {
      const m = w - 9 + i
      schedule(() => {
        setEase(stepEase)
        setTransitionMs(finalTrans[i - 1])
        setOffset(-(m - 1) * ROW_H)
        playStep()
      }, t)
      t += finalPauses[i - 1]
    }

    // --- Final reveal ---
    schedule(() => {
      setFinished(true)
      onFinished(winner)
    }, t + 1200)

    return () => {
      cancelled = true
      stopTicks()
      timers.forEach(id => window.clearTimeout(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl p-4 md:p-5 bg-gradient-to-b from-amber-800/90 via-amber-950/90 to-black/90 border-4 border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.25)] animate-draw-reveal">
      {/* Header */}
      <div className="text-center mb-3">
        <span className="text-amber-300 font-bold tracking-[0.3em] text-xs md:text-sm">✦ LUCKY DRAW ✦</span>
      </div>

      {/* Window */}
      <div className="relative rounded-xl overflow-hidden border-[3px] border-amber-400/70 bg-black/95 h-[144px]">
        {/* Side lights */}
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.1s' }} />
        </div>

        {/* Top/bottom fades */}
        <div className="absolute top-0 left-0 right-0 h-5 bg-gradient-to-b from-black/90 to-transparent z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-black/90 to-transparent z-10" />

        {/* Center highlight */}
        <div
          className={`absolute left-2 right-2 top-1/2 -translate-y-1/2 h-12 z-10 pointer-events-none transition-all duration-300 rounded-md ${
            finished
              ? 'bg-amber-400/25 border-y-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)]'
              : 'border-y-2 border-amber-500/60'
          }`}
        />

        {/* Reel strip */}
        <div
          className="will-change-transform"
          style={{
            transform: `translateY(${offset}px)`,
            transition: `transform ${transitionMs}ms ${ease}`,
          }}
        >
          {reel.map((name, i) => (
            <div
              key={`${i}-${name}`}
              className="h-12 flex items-center justify-center px-6 truncate text-base md:text-lg font-bold text-white"
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className={`text-center mt-3 text-xs tracking-widest ${finished ? 'text-amber-300 font-bold' : 'text-amber-200/70 animate-pulse'}`}>
        {finished ? '🏆 WINNER! 🏆' : 'SPINNING...'}
      </div>
    </div>
  )
}

function WinnerDisplay({ winner, isDrawing }: { winner: string | null; isDrawing?: boolean }) {
  if (!winner && !isDrawing) return null

  return (
    <div className={`text-center py-6 ${isDrawing ? '' : 'animate-draw-reveal'}`}>
      <div className={`text-5xl mb-4 ${isDrawing ? 'animate-spin-slow inline-block' : 'animate-bounce inline-block'}`}>
        {isDrawing ? '✦' : '🏆'}
      </div>
      <div
        className={`text-2xl md:text-3xl font-bold display-font mb-1 break-words px-2 ${
          isDrawing ? 'text-purple-300 animate-slot-pulse' : 'text-emblem'
        }`}
      >
        {isDrawing ? (winner || '...') : `🎉 ${winner} 🎉`}
      </div>
      <p className={`text-sm ${isDrawing ? 'text-amber-300/90 animate-pulse' : 'text-white/60'}`}>
        {isDrawing ? 'ရွေးချယ်နေသည်...' : 'ဂုဏ်ယူပါတယ်!'}
      </p>
    </div>
  )
}


function WinnerAlert({ winner, onClose }: { winner: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm text-center px-8 py-10 rounded-3xl border border-amber-400/40 bg-gradient-to-b from-[#1a1206] via-[#241a08] to-[#0d0d0d] shadow-2xl shadow-amber-500/20 animate-draw-reveal overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Glow ring */}
        <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-amber-500/40 via-yellow-400/40 to-amber-500/40 blur-2xl animate-pulse-glow pointer-events-none" />

        {/* Shine beam */}
        <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shine pointer-events-none" />

        {/* Trophy */}
        <div className="relative text-7xl mb-5 animate-bounce drop-shadow-[0_0_25px_rgba(251,191,36,0.5)]">🏆</div>

        {/* Label */}
        <p className="relative text-sm text-amber-200/80 mb-2 tracking-wide">🎉 ကံထူးသွားပါပြီ 🎉</p>

        {/* Winner name - gold with red stroke */}
        <div className="relative text-3xl md:text-4xl font-bold text-emblem mb-4 leading-snug break-words px-2">
          {winner}
        </div>

        {/* Divider */}
        <div className="relative w-28 h-[3px] bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 rounded-full mx-auto mb-6 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="relative px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-amber-500/30"
        >
          ပိတ်မယ် ✕
        </button>
      </div>
    </div>
  )
}

function WinnerHistory({
  winners,
  onClear,
  onClose,
}: {
  winners: Winner[]
  onClear: () => void
  onClose: () => void
}) {
  const toast = useToast()

  const downloadCSV = () => {
    const header = 'နံပါတ်,ကံထူးရှင်အမည်,ရွေးချယ်သည့်အချိန်\n'
    const rows = winners.map((w, i) => `${i + 1},${w.name},${w.timestamp}`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `winner-history-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV ဖိုင်ကို ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ')
  }

  const downloadExcel = () => {
    const header = 'နံပါတ်\tကံထူးရှင်အမည်\tရွေးချယ်သည့်အချိန်\n'
    const rows = winners.map((w, i) => `${i + 1}\t${w.name}\t${w.timestamp}`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/tab-separated-values;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `winner-history-${Date.now()}.xls`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel ဖိုင်ကို ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="bg-gray-900/95 border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl shadow-purple-500/5">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="display-font text-2xl text-purple-400">📋 ကံထူးရှင်စာရင်း</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {winners.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <p>ကံထူးရှင်စာရင်း မရှိသေးပါ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {winners.map((w, i) => (
                <div
                  key={`${w.name}-${i}`}
                  className="p-3 bg-white/5 border border-white/10 rounded-lg hover:border-purple-500/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/60 to-purple-400/40 flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p
                        className="font-bold px-2 py-1 rounded inline-block"
                        style={{
                          color: '#FFFFFF',
                          backgroundColor: 'rgba(220, 20, 60, 0.3)',
                          border: '1.5px solid #DC143C',
                          textShadow: '0 0 2px rgba(0, 0, 0, 0.5)',
                        }}
                      >
                        #{i + 1} {w.name}
                      </p>
                      <p className="text-xs text-white/50 mt-1">{w.timestamp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {winners.length > 0 && (
          <div className="border-t border-white/10 p-5 flex gap-3 flex-wrap">
            <button
              onClick={downloadExcel}
              className="flex-1 min-w-[120px] px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all text-sm"
            >
              📊 Excel ဒေါင်းလုဒ်
            </button>
            <button
              onClick={downloadCSV}
              className="flex-1 min-w-[120px] px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all text-sm"
            >
              CSV ဒေါင်းလုဒ်
            </button>
            <button
              onClick={onClear}
              className="flex-1 min-w-[120px] px-4 py-2.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-xl font-medium transition-all text-sm"
            >
              🗑️ ဖျက်သိမ်း
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function HomeContent() {
  const toast = useToast()
  const { playTick, playStep, playWin } = useSoundEffect()

  const [participants, setParticipants] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(PARTICIPANTS_KEY)
      return stored ? sortParticipants(JSON.parse(stored)) : []
    } catch {
      return []
    }
  })
  const [inputValue, setInputValue] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showWinnerAlert, setShowWinnerAlert] = useState(false)
  const [winners, setWinners] = useState<Winner[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false'
  })

  const listEndRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)

  const isInitialMount = useRef(true)

  useEffect(() => {
    // Always open page at top on load
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [participants])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(winners))
  }, [winners])

  useEffect(() => {
    localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants))
  }, [participants])

  useEffect(() => {
    localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled))
  }, [soundEnabled])

  // Auto-scroll the participants list while the draw is spinning
  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    if (!isDrawing) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    let raf = 0
    let last = performance.now()
    let mode: 'down' | 'rewind' = 'down'
    let rewindStart = 0
    let rewindFrom = 0
    const SCROLL_SPEED = 85 // px per second
    const REWIND_MS = 900
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) {
        if (mode === 'down') {
          el.scrollTop = Math.min(max, el.scrollTop + SCROLL_SPEED * dt)
          if (el.scrollTop >= max) {
            mode = 'rewind'
            rewindStart = now
            rewindFrom = max
          }
        } else {
          const p = Math.min(1, (now - rewindStart) / REWIND_MS)
          const eased = 1 - Math.pow(1 - p, 3) // ease-out
          el.scrollTop = rewindFrom * (1 - eased)
          if (p >= 1) mode = 'down'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isDrawing])

  const addParticipant = useCallback(() => {
    const names = inputValue
      .split(/[,၊，]+/)
      .map(n => n.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (participants.length + names.length > MAX_PARTICIPANTS) {
      toast.error(`အများဆုံး ${MAX_PARTICIPANTS.toLocaleString()} ယောက်သာ ထည့်နိုင်ပါသည်`)
      return
    }
    const duplicates = names.filter(n => participants.includes(n))
    if (duplicates.length > 0) {
      toast.error(`"${duplicates[0]}" ရှိပြီးသားပါ`)
      return
    }
    setParticipants(prev => sortParticipants([...prev, ...names]))
    setInputValue('')
    toast.success(
      names.length > 1
        ? `"${names.length}" ယောက် ထည့်သွင်းပြီးပါပြီ`
        : `"${names[0]}" ကို ထည့်သွင်းပြီးပါပြီ`
    )
  }, [inputValue, participants, toast])

  const removeParticipant = useCallback((index: number) => {
    setParticipants(prev => sortParticipants(prev.filter((_, i) => i !== index)))
  }, [])

  const startDraw = useCallback(() => {
    if (participants.length === 0) {
      toast.error('ပါဝင်သူ အနည်းဆုံး ၁ ယောက် လိုပါသည်')
      return
    }
    if (isDrawing) return

    setWinner(null)
    setIsDrawing(true)
  }, [participants, isDrawing, toast])

  const handleWinnerSelected = useCallback((finalWinner: string) => {
    setIsDrawing(false)
    setWinner(finalWinner)

    if (soundEnabled) playWin()

    const now = new Date()
    const timestamp = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const dateStr = now.toISOString().split('T')[0]

    const newWinner: Winner = {
      name: finalWinner,
      timestamp,
      date: dateStr,
    }

    setWinners(prev => [newWinner, ...prev])
    // Remove the winner from participants so they can't win again
    setParticipants(prev => prev.filter(p => p !== finalWinner))
    setShowWinnerAlert(true)
    toast.success(`🎉 "${finalWinner}" ကံထူးသွားပါပြီ!`)
  }, [soundEnabled, playWin, toast])



  const handleClearWinners = useCallback(() => {
    setWinners([])
    localStorage.removeItem(STORAGE_KEY)
    toast.success('စာရင်းဖျက်သိမ်းပြီးပါပြီ')
  }, [toast])

  return (
    <div className="min-h-screen bg-background text-white relative">


      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-30">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white p-1 shadow-lg flex items-center justify-center">
                  <img
                    src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj_DZjS62GdjDD8grhuwODTqovHwU4_9Ec1dtgpIkwvjnQUN4I_lH8edR7SZ7CJBv6DUTCWoa1ayJDSy0TiZsWcsoxqD4bIZFlWfWEgUr33g3uiDlu8AyV7Vx9Y3BFc_JRxr6oAfPqXTKr1Ye1pmmEl4j9G0Ly1Oh23d9u2qOUOsJsdemn57WlDl8xY0oI/s518-rw/about%20us%20.png"
                    alt="WoW Logo"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div>
                  <h1 className="display-font text-xl md:text-2xl text-white">WoW - Lucky Draw</h1>
                  <p className="text-xs text-white/50 hidden xs:block">Random Winner Picker</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white text-lg"
                  title={soundEnabled ? 'Sound On' : 'Sound Off'}
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                >
                  <span>📋</span>
                  <span className="hidden xs:inline">ကံထူးရှင်များ</span>
                  {winners.length > 0 && (
                    <span className="bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {winners.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Hero Section */}
          <div className="mb-8">
            <div className="relative overflow-hidden min-h-[300px] md:min-h-[360px]">
              {/* Background image - smaller, centered */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'url("https://blogger.googleusercontent.com/img/a/AVvXsEjFxEJfeaZUGIHfVF-u4HzxgJOMhnT8WQt9CwOieMhfDZ6_8QI54yPRvG3L6osr9R2KjiT2vZH1oKitHmxmP5ZutUYLcdYAdfy_lfe4lf75OqWd4vqwIkTeI86Yq4cPwbc2AwuMQ_sMJ-gzHlRoVWrJIxADv5l6qoi0gp5nwn1OPPp5DHyACOUZix6PAsc=rw")',
                  backgroundSize: '60% auto',
                  backgroundPosition: 'center 25%',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              {/* Edge fade masks - blend into page background */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-transparent to-[#0a0a0a]" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0a0a0a] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
              
              {/* Content */}
              <div className="relative z-10 text-center px-6 py-10 md:py-12 flex flex-col justify-center min-h-[300px] md:min-h-[360px]">
                <div className="animate-bounce tracking-wide">
                  <div className="text-4xl md:text-5xl text-emblem">အိမ်ဖော်</div>
                  <div className="text-xl md:text-2xl text-emblem-2 mt-6 md:mt-8">သက်ပိုင်(ဘာသာပြန်)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Input Section */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 xs:p-6 mb-6">
            <ParticipantInput
              value={inputValue}
              onChange={setInputValue}
              onAdd={addParticipant}
              onKeyDown={e => { if (e.key === 'Enter') addParticipant() }}
              participantCount={participants.length}
              maxParticipants={MAX_PARTICIPANTS}
            />

            {participants.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                <span>စုစုပေါင်း: <strong className="text-white">{participants.length.toLocaleString()}</strong> ယောက်</span>
                <button
                  onClick={() => {
                    setParticipants([])
                    localStorage.removeItem(PARTICIPANTS_KEY)
                    toast.info('ပါဝင်သူများ ဖျက်သိမ်းပြီးပါပြီ')
                  }}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  အားလုံးဖျက်မယ်
                </button>
              </div>
            )}
          </div>

          {/* Participants List */}
          <div
            className={`bg-white/5 backdrop-blur-sm border rounded-2xl p-5 xs:p-6 transition-all duration-300 ${
              isDrawing
                ? 'border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
                : 'border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="display-font text-lg text-white">📝 ပါဝင်သူများ</h3>
              <span className="text-xs text-white/50">
                {participants.length.toLocaleString()} / {MAX_PARTICIPANTS.toLocaleString()}
              </span>
            </div>
            <div ref={listScrollRef} className="max-h-[420px] overflow-y-auto pr-1 -mr-1">
              <ParticipantList participants={participants} onRemove={removeParticipant} />
              <div ref={listEndRef} />
            </div>
          </div>

          {/* Winner Display - below participants */}
          {isDrawing ? (
            <div className="mt-6">
              <CasinoSlot
                participants={participants}
                soundEnabled={soundEnabled}
                playTick={playTick}
                playStep={playStep}
                onFinished={handleWinnerSelected}
              />
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mt-6 min-h-[120px] flex items-center justify-center">
              {winner ? (
                <WinnerDisplay winner={winner} />
              ) : (
                <div className="text-center text-white/50">
                  <div className="text-3xl mb-2">🎯</div>
                  <p className="text-sm">ကံထူးရှင် ဘယ်သူ ဖြစ်မလဲ?</p>
                </div>
              )}
            </div>
          )}

          {/* Draw Section - below winner display */}
          <div className="mt-6">
            <DrawButton onClick={startDraw} disabled={participants.length === 0 || isDrawing} isDrawing={isDrawing} />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-white/5 backdrop-blur-sm py-6 mt-12">
          <div className="container mx-auto text-center text-sm text-white/50">
            <p>
              Lucky Draw © 2026 •{' '}
              <a
                href="https://t.me/TheBookR"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                Whisper Of Words
              </a>
            </p>
            <p className="text-xs mt-2">အများဆုံး {MAX_PARTICIPANTS.toLocaleString()} ယောက်</p>
          </div>
        </footer>

        {/* Winner History Modal */}
        {showHistory && (
          <WinnerHistory
            winners={winners}
            onClear={handleClearWinners}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* Confetti - above modal */}
        {winner && !isDrawing && <ConfettiOverlay />}

        {/* Winner Alert Modal */}
        {showWinnerAlert && winner && (
          <WinnerAlert winner={winner} onClose={() => setShowWinnerAlert(false)} />
        )}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <ToastProvider>
      <HomeContent />
    </ToastProvider>
  )
}
