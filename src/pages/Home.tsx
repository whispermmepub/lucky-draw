import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { ToastProvider, useToast } from '../components/Toast.tsx'
import { fetchSharedParticipants, fetchSharedWinners, saveSharedParticipants, saveSharedWinners, validateOwnerToken } from '../lib/sharedStore.ts'

interface Winner {
  name: string
  timestamp: string
  date: string
}

const MAX_PARTICIPANTS = 5000
// Participants list geometry (see CSS: max-h-[420px], row = p-3 + text-sm + gap-2)
const LIST_HEIGHT = 420
const LIST_ROW_PITCH = 52
const LIST_SPACER = (LIST_HEIGHT - LIST_ROW_PITCH) / 2
const STORAGE_KEY = 'lucky-draw-winners'
const PARTICIPANTS_KEY = 'lucky-draw-participants'
const SOUND_ENABLED_KEY = 'lucky-draw-sound'
const OWNER_TOKEN_KEY = 'lucky-draw-owner-token'
const OWNER_LOGIN_KEY = 'lucky-draw-owner-login'
const AUTO_REMOVE_KEY = 'lucky-draw-auto-remove'

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

  const playHeartbeat = useCallback(() => {
    // "lub-dub" heartbeat: two low thumps, twice
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const t0 = ctx.currentTime
      const thump = (at: number, power: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(75, at)
        osc.frequency.exponentialRampToValueAtTime(38, at + 0.13)
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.5 * power, at)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18)
        osc.start(at)
        osc.stop(at + 0.2)
      }
      thump(t0, 0.55) // lub
      thump(t0 + 0.17, 0.35) // dub
      thump(t0 + 0.6, 0.55) // lub
      thump(t0 + 0.77, 0.35) // dub
    } catch {
      // audio not available
    }
  }, [])

  return { playTick, playStep, playWin, playHeartbeat }
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
          className="w-full px-4 py-3 bg-black/40 border border-cyan-400/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 transition-all text-base"
          disabled={participantCount >= maxParticipants}
        />
      </div>
      <button
        onClick={onAdd}
        disabled={!value.trim() || participantCount >= maxParticipants}
        className="font-hud px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all active:scale-95 flex items-center gap-2 text-sm shadow-[0_0_14px_rgba(0,240,255,0.25)]"
      >
        <span>+</span>
        <span className="hidden xs:inline">ထည့်မယ်</span>
      </button>
    </div>
  )
}

const ParticipantRow = memo(function ParticipantRow({
  name,
  index,
  isSpotlight,
  isWinner,
  canRemove,
  onRemove,
}: {
  name: string
  index: number
  isSpotlight: boolean
  isWinner: boolean
  canRemove: boolean
  onRemove: (index: number) => void
}) {
  return (
    <div
      data-row={index}
      data-name={name}
      className={`group relative p-3 rounded-xl transition-all duration-150 ${
        isWinner
          ? 'bg-amber-500/15 border border-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.45)] scale-[1.03] animate-pulse'
          : isSpotlight
            ? 'bg-cyan-500/15 border border-cyan-400/80 shadow-[0_0_20px_rgba(0,240,255,0.35)] scale-[1.02]'
            : 'bg-white/5 border border-white/10 hover:border-purple-500/40 hover:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            isWinner
              ? 'bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.9)]'
              : isSpotlight
                ? 'bg-cyan-400 text-black shadow-[0_0_10px_rgba(0,240,255,0.8)]'
                : 'bg-gradient-to-br from-purple-500/60 to-purple-400/40 text-white'
          }`}
        >
          {index + 1}
        </span>
        <span className={`text-sm font-medium truncate flex-1 ${isWinner ? 'text-amber-200' : isSpotlight ? 'text-cyan-100' : 'text-white/90'}`}>{name}</span>
        {isWinner && (
          <span className="font-hud text-[10px] text-amber-300 animate-pulse whitespace-nowrap">🏆 ကံထူးပြီ!</span>
        )}
        {isSpotlight && (
          <span className="font-hud text-[10px] neon-magenta animate-pulse whitespace-nowrap">◉ သူလား?</span>
        )}
        {canRemove && (
        <button
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg transition-all text-white/50 hover:text-red-400"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        )}
      </div>
    </div>
  )
})

function ParticipantList({
  participants,
  onRemove,
  spotlightIndex,
  winnerFoundName,
  showSpacers,
  canRemove,
}: {
  participants: string[]
  onRemove: (index: number) => void
  spotlightIndex: number | null
  winnerFoundName: string | null
  showSpacers: boolean
  canRemove: boolean
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
    <>
      {/* Top/bottom spacers: while the draw spins, every name (first & last too)
          can reach the center scan line */}
      {showSpacers && (
        <div className="pointer-events-none" style={{ height: LIST_SPACER }} aria-hidden="true" />
      )}
      <div className="flex flex-col gap-2">
        {participants.map((name, i) => (
          <ParticipantRow
            key={`${name}-${i}`}
            name={name}
            index={i}
            isSpotlight={spotlightIndex === i}
            isWinner={winnerFoundName === name}
            canRemove={canRemove}
            onRemove={onRemove}
          />
        ))}
      </div>
      {showSpacers && (
        <div className="pointer-events-none" style={{ height: LIST_SPACER }} aria-hidden="true" />
      )}
    </>
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
          : 'bg-black/60 text-cyan-100 border-2 border-cyan-400/70 hover:border-fuchsia-400/80 hover:text-fuchsia-200 shadow-[0_0_18px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(255,43,214,0.45)]'
        }
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
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
  playHeartbeat,
  onFinished,
}: {
  participants: string[]
  soundEnabled: boolean
  playTick: (freq?: number, power?: number) => void
  playStep: () => void
  playHeartbeat: () => void
  onFinished: (winner: string) => void
}) {
  const ROW_H = 48

  // Build the reel: every name appears 10 rounds (shuffled each round) + winner + extra
  // names AFTER the winner so the reel can scroll PAST him without giving the result away
  const { reel, winner, winIndex } = useMemo(() => {
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
    const winIndex = names.length
    names.push(win)
    const extras = Array.from({ length: 3 }, () => shuffle(participants)).flat().slice(0, 6)
    names.push(...extras)
    return { reel: names, winner: win, winIndex }
  }, [participants])

  const [offset, setOffset] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [ease, setEase] = useState('cubic-bezier(0.12, 0.8, 0.2, 1)')
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    // Randomized suspense spin (~25-40s): every draw feels different
    // Main fast spin → [slow "him? me?" steps → hold → sudden re-spin] × 2-4 (random)
    // → final slow steps → winner reveal
    const w = winIndex
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
    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1))

    // --- Phase 1: main fast spin (random length) ---
    const spinMs = rand(3800, 5200)
    const p1 = Math.max(1, w - randInt(45, 60))
    let t = 150
    startTicks(spinMs)
    schedule(() => {
      setEase(spinEase)
      setTransitionMs(spinMs)
      setOffset(-(p1 - 1) * ROW_H)
    }, t)
    t += spinMs
    schedule(() => {
      stopTicks()
    }, t)
    t += 220

    // --- Cycles: exactly 3 slow-fast rounds ---
    const cycleCount = 3
    const endZone = Math.max(1, w - 9) // reel lands here after the last re-spin
    let cursor = p1 + 1
    let lastRespinTo = cursor
    for (let c = 0; c < cycleCount; c++) {
      const steps = randInt(4, 7)
      const basePause = rand(170, 230) + c * 15
      const holdMs = rand(200, 300) // fake "is it stopping?" pause
      const remaining = endZone - cursor
      const minAdvance = 6
      const maxAdvance = Math.max(minAdvance, remaining - steps - 1)
      const advance = randInt(minAdvance, Math.max(minAdvance, maxAdvance))
      const respinTo = Math.min(endZone, cursor + steps + advance)
      const respinMs = rand(2000, 2800)

      // Sometimes a quick backward flick first - "did it go back?"
      if (Math.random() < 0.35) {
        const backTo = Math.max(1, cursor - 2)
        schedule(() => {
          setEase(stepEase)
          setTransitionMs(130)
          setOffset(-(backTo - 1) * ROW_H)
        }, t)
        t += 140
        schedule(() => {
          setEase(stepEase)
          setTransitionMs(150)
          setOffset(-(cursor - 1) * ROW_H)
        }, t)
        t += 160
      }

      // Slow steps - "is it him?"
      for (let i = 0; i < steps; i++) {
        const m = Math.min(endZone, cursor + i)
        const pause = basePause + i * rand(12, 28)
        schedule(() => {
          stopTicks()
          setEase(stepEase)
          setTransitionMs(rand(130, 170))
          setOffset(-(m - 1) * ROW_H)
          playStep()
        }, t)
        t += pause
      }

      // Hold - heartbeat, feels like it might stop...
      schedule(() => {
        if (soundEnabled) playHeartbeat()
      }, t)
      t += holdMs

      // ...then sudden fast re-spin!
      schedule(() => {
        startTicks(respinMs)
        setEase(spinEase)
        setTransitionMs(respinMs)
        setOffset(-(respinTo - 1) * ROW_H)
      }, t)
      t += respinMs
      schedule(() => {
        stopTicks()
        if (soundEnabled) playTick(200)
      }, t)
      t += 220
      lastRespinTo = respinTo
      cursor = respinTo + 1
    }

    // --- Final slow steps to the winner (random count, growing pauses) ---
    const finalSteps = randInt(7, 11)
    const finalStart = Math.max(1, Math.min(w - finalSteps + 1, lastRespinTo + 1))
    let landTime = t
    for (let m = finalStart; m <= w; m++) {
      const i = m - finalStart + 1
      const pause = Math.min(520, 170 + i * rand(30, 50) + rand(0, 50))
      const trans = rand(140, 180) + (m === w ? 60 : 0)
      landTime = t
      schedule(() => {
        setEase(stepEase)
        setTransitionMs(trans)
        setOffset(-(m - 1) * ROW_H)
        playStep()
      }, t)
      t += pause
    }

    // --- Scroll PAST the winner: never sit on his name ---
    const pastMs = rand(600, 900)
    const pastTo = Math.min(reel.length - 1, w + randInt(2, 4))
    schedule(() => {
      startTicks(pastMs)
      setEase(spinEase)
      setTransitionMs(pastMs)
      setOffset(-(pastTo - 1) * ROW_H)
    }, landTime + 300)
    schedule(() => {
      stopTicks()
    }, landTime + 400 + pastMs)
    t = landTime + 400 + pastMs + 200

    // --- Winner lands: laser rings flash on the slot ---
    schedule(() => {
      setFinished(true)
      if (soundEnabled) playHeartbeat()
    }, t)

    // --- Final reveal: modal pops up ---
    schedule(() => {
      onFinished(winner)
    }, t + rand(500, 900))

    return () => {
      cancelled = true
      stopTicks()
      timers.forEach(id => window.clearTimeout(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl p-4 md:p-5 bg-gradient-to-b from-amber-800/90 via-amber-950/90 to-black/90 border-4 border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.25),0_0_70px_rgba(0,240,255,0.12)] animate-draw-reveal">
      {/* Header */}
      <div className="text-center mb-3">
        <span className="font-hud text-cyan-200 tracking-[0.3em] text-xs md:text-sm">[ ✦ LUCKY DRAW ✦ ]</span>
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

        {/* Winner laser rings */}
        {finished && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            <span className="laser-ring" />
            <span className="laser-ring" style={{ animationDelay: '0.28s' }} />
          </div>
        )}

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
      <div className={`font-hud text-center mt-3 text-xs tracking-[0.3em] ${finished ? 'neon-cyan' : 'text-cyan-300/80 animate-pulse'}`}>
        {finished ? '[ WINNER FOUND ]' : '[ SPINNING... ]'}
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

        {/* HUD line */}
        <p className="relative font-hud text-[10px] text-cyan-300/70 tracking-[0.3em] mb-2 cyber-flicker">[ WINNER DECODED ]</p>

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
  live,
  onClear,
  onClose,
}: {
  winners: Winner[]
  live: boolean
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
          <h2 className="display-font text-2xl neon-cyan">📋 ကံထူးရှင်စာရင်း</h2>
          {live && (
            <span className="font-hud text-[9px] text-green-300 bg-green-500/10 border border-green-400/30 rounded-full px-2 py-0.5 tracking-[0.2em]">
              LIVE_SHARED
            </span>
          )}
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

function OwnerModal({
  login,
  onClose,
  onConnect,
  onLogout,
}: {
  login: string | null
  onClose: () => void
  onConnect: (token: string) => Promise<void>
  onLogout: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    const token = value.trim()
    if (!token) return
    setBusy(true)
    setError('')
    try {
      await onConnect(token)
      setValue('')
    } catch {
      setError('Token မှားနေပါတယ် — GitHub က token ကို ပြန်စစ်ကြည့်ပါ')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/95 border border-cyan-400/40 rounded-2xl w-full max-w-md p-6 text-center shadow-[0_0_30px_rgba(0,240,255,0.15)]"
        onClick={e => e.stopPropagation()}
      >
        {login ? (
          <>
            <div className="text-3xl mb-3">🔓</div>
            <h3 className="font-bold mb-1">ပိုင်ရှင် mode ဖွင့်ထားပါတယ်</h3>
            <p className="font-hud text-[10px] text-cyan-400/60 tracking-[0.25em] mb-4">OWNER CONNECTED</p>
            <div className="bg-black/40 border border-green-400/30 rounded-xl px-4 py-3 text-sm text-green-300 mb-5">
              ✓ @{login} — စာရင်း ထည့်/ဖျက် လုပ်လို့ရပါပြီ
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm"
              >
                ပိတ်မယ်
              </button>
              <button
                onClick={onLogout}
                className="flex-1 px-4 py-2.5 bg-red-600/80 hover:bg-red-500 text-white rounded-xl text-sm font-bold"
              >
                Logout
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-3xl mb-3">🔑</div>
            <h3 className="font-bold mb-1">ပိုင်ရှင် ချိတ်ဆက်ရန်</h3>
            <p className="font-hud text-[10px] text-cyan-400/60 tracking-[0.25em] mb-2">ENTER GITHUB TOKEN</p>
            <p className="text-[11px] text-white/50 leading-relaxed mb-4">
              GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) မှာ
              <strong className="text-cyan-300"> repo </strong> scope နဲ့ token တစ်ခု ဖန်တီးပြီး ဒီမှာ ထည့်ပါ။
              Token က ကိုယ့် browser ထဲမှာပဲ သိမ်းမှာမို့ လုံခြုံပါတယ်။
            </p>
            <input
              type="password"
              value={value}
              onChange={e => {
                setValue(e.target.value)
                setError('')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="github_pat_..."
              autoFocus
              className="w-full px-4 py-3 bg-black/40 border border-cyan-400/30 rounded-xl text-white text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm"
              >
                ပိတ်မယ်
              </button>
              <button
                onClick={submit}
                disabled={!value.trim() || busy}
                className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {busy ? 'စစ်နေသည်...' : 'ချိတ်မယ်'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function HomeContent() {
  const toast = useToast()
  const { playTick, playStep, playWin, playHeartbeat } = useSoundEffect()

  const [participants, setParticipants] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showWinnerAlert, setShowWinnerAlert] = useState(false)
  const [sharedWinners, setSharedWinners] = useState<Winner[]>([])
  const sharedWinnersRef = useRef<Winner[]>([])
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
  const [sharedLoading, setSharedLoading] = useState(true)
  const [sharedError, setSharedError] = useState(false)
  const [ownerToken, setOwnerToken] = useState<string | null>(() => localStorage.getItem(OWNER_TOKEN_KEY))
  const [ownerLogin, setOwnerLogin] = useState<string | null>(() => localStorage.getItem(OWNER_LOGIN_KEY))
  const [showOwnerModal, setShowOwnerModal] = useState(false)
  const isOwner = ownerToken !== null
  const [autoRemoveWinner, setAutoRemoveWinner] = useState(() => localStorage.getItem(AUTO_REMOVE_KEY) !== 'false')
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const syncTimerRef = useRef<number | null>(null)
  const locallyAddedRef = useRef<Set<string>>(new Set())
  const locallyRemovedRef = useRef<Set<string>>(new Set())

  const markSyncStart = useCallback(() => {
    setSyncState('saving')
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
  }, [])
  const markSyncOk = useCallback(() => {
    setSyncState('saved')
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => setSyncState('idle'), 2500)
  }, [])
  const markSyncFail = useCallback(() => {
    setSyncState('error')
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => setSyncState('idle'), 4000)
  }, [])

  const listEndRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)
  const participantsRef = useRef<string[]>([])
  const isDrawingRef = useRef(false)
  const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null)
  const spotlightRef = useRef<number | null>(null)
  const [winnerFoundName, setWinnerFoundName] = useState<string | null>(null)
  const revealTimeoutRef = useRef<number | null>(null)
  const removeTimeoutRef = useRef<number | null>(null)

  const isInitialMount = useRef(true)

  useEffect(() => {
    // Always open page at top on load
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    participantsRef.current = participants
    if (isInitialMount.current) {
      isInitialMount.current = false
      prevLenRef.current = participants.length
      return
    }
    // Only auto-scroll to the end when names were added (not when a winner is removed)
    if (participants.length > prevLenRef.current) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = participants.length
  }, [participants])

  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  useEffect(() => {
    sharedWinnersRef.current = sharedWinners
  }, [sharedWinners])

  // Load the SHARED participant list and keep it live-synced with all visitors.
  // Owner edits are written back immediately; polls only read (and skip during a draw).
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const names = await fetchSharedParticipants()
        if (!active) return
        // Reconcile with local (not-yet-synced) edits so a stale fetch never
        // reverts an optimistic add/remove. Overrides are pruned once the CDN
        // confirms the change.
        const removed = locallyRemovedRef.current
        const base = names.filter(n => !removed.has(n))
        const present = new Set(base)
        const added = [...locallyAddedRef.current].filter(n => !present.has(n))
        for (const n of locallyAddedRef.current) if (present.has(n)) locallyAddedRef.current.delete(n)
        for (const n of locallyRemovedRef.current) if (!names.includes(n)) locallyRemovedRef.current.delete(n)
        setParticipants(sortParticipants([...base, ...added]))
        setSharedError(false)
      } catch {
        if (!active) return
        setSharedError(true)
        // Offline fallback: last local cache
        try {
          const stored = localStorage.getItem(PARTICIPANTS_KEY)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) setParticipants(sortParticipants(parsed))
          }
        } catch {
          // ignore
        }
      } finally {
        if (active) setSharedLoading(false)
      }
      try {
        const shWinners = await fetchSharedWinners()
        if (!active) return
        setSharedWinners(shWinners)
      } catch {
        // keep the last known shared winners
      }
    }
    load()
    const timer = window.setInterval(() => {
      if (isDrawingRef.current) return
      load()
    }, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(winners))
  }, [winners])

  useEffect(() => {
    localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants))
  }, [participants])

  useEffect(() => {
    localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled))
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem(AUTO_REMOVE_KEY, String(autoRemoveWinner))
  }, [autoRemoveWinner])

  // Auto-scroll the participants list while the draw is spinning.
  // Time-based sine motion: velocity never jumps to zero, so it never "sticks",
  // and dropped frames can't make it stutter (position depends only on time).
  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    if (!isDrawing) {
      spotlightRef.current = null
      setSpotlightIndex(null)
      return
    }
    let raf = 0
    const max = el.scrollHeight - el.clientHeight
    const N = participants.length
    const H = el.clientHeight
    // Measure the actual row pitch once (layout is stable during the draw)
    let pitch = LIST_ROW_PITCH
    const firstRows = el.querySelectorAll('[data-row]')
    if (firstRows.length >= 2) {
      const p = (firstRows[1] as HTMLElement).offsetTop - (firstRows[0] as HTMLElement).offsetTop
      if (p > 0) pitch = p
    }
    // Full down+up cycle: ~220 px/s peak speed, min 6s (light & lively)
    const PEAK_SPEED = 220
    const period = max > 0 ? Math.max(6000, (max / PEAK_SPEED) * Math.PI * 1000) : 6000
    const start = performance.now()
    const tick = (now: number) => {
      const p = (1 - Math.cos((2 * Math.PI * (now - start)) / period)) / 2 // 0→1→0, smooth
      if (max > 0) el.scrollTop = p * max
      // With the top/bottom spacers, scrollTop 0 centers the FIRST name and
      // scrollTop max centers the LAST name - nobody is left out
      const idx = Math.min(
        N - 1,
        Math.max(0, Math.floor((el.scrollTop + H / 2 - LIST_SPACER) / pitch)),
      )
      if (idx !== spotlightRef.current) {
        spotlightRef.current = idx
        setSpotlightIndex(idx)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isDrawing, participants.length])

  const addParticipant = useCallback(() => {
    const names = inputValue
      .split(/[,၊，]+/)
      .map(n => n.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (!ownerToken) {
      toast.error('ပိုင်ရှင် token မရှိပါ — 🔒 ခလုတ်နဲ့ ချိတ်ပါ')
      return
    }
    if (names.some(n => n.toLowerCase().includes('github_pat_'))) {
      toast.error('Token ကို နာမည်စာရင်းထဲ ထည့်လို့မရပါ — 🔒 ခလုတ်နဲ့ ချိတ်ပါ')
      return
    }
    if (participants.length + names.length > MAX_PARTICIPANTS) {
      toast.error(`အများဆုံး ${MAX_PARTICIPANTS.toLocaleString()} ယောက်သာ ထည့်နိုင်ပါသည်`)
      return
    }
    const duplicates = names.filter(n => participants.includes(n))
    if (duplicates.length > 0) {
      toast.error(`"${duplicates[0]}" ရှိပြီးသားပါ`)
      return
    }
    const next = sortParticipants([...participants, ...names])
    for (const n of names) locallyRemovedRef.current.delete(n)
    for (const n of names) locallyAddedRef.current.add(n)
    setParticipants(next)
    setInputValue('')
    markSyncStart()
    saveSharedParticipants(next, ownerToken)
      .then(markSyncOk)
      .catch(() => {
        markSyncFail()
        toast.error('အင်တာနက်မှာ သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
      })
    toast.success(
      names.length > 1
        ? `"${names.length}" ယောက် ထည့်သွင်းပြီးပါပြီ`
        : `"${names[0]}" ကို ထည့်သွင်းပြီးပါပြီ`
    )
  }, [inputValue, participants, ownerToken, toast, markSyncStart, markSyncOk, markSyncFail])

  const removeParticipant = useCallback((index: number) => {
    if (!ownerToken) return
    setParticipants(prev => {
      const removedName = prev[index]
      const next = sortParticipants(prev.filter((_, i) => i !== index))
      if (removedName) {
        locallyAddedRef.current.delete(removedName)
        locallyRemovedRef.current.add(removedName)
      }
      markSyncStart()
      saveSharedParticipants(next, ownerToken)
        .then(markSyncOk)
        .catch(() => {
          markSyncFail()
          toast.error('အင်တာနက်မှာ သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
        })
      return next
    })
  }, [ownerToken, toast, markSyncStart, markSyncOk, markSyncFail])

  const displayWinners = useMemo(() => {
    const seen = new Set<string>()
    const merged: Winner[] = []
    for (const w of [...sharedWinners, ...winners]) {
      const key = `${w.date}::${w.timestamp}::${w.name}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(w)
    }
    return merged
  }, [sharedWinners, winners])

  const startDraw = useCallback(() => {
    if (participants.length === 0) {
      toast.error('ပါဝင်သူ အနည်းဆုံး ၁ ယောက် လိုပါသည်')
      return
    }
    if (isDrawing) return

    // Clear any pending winner reveal/removal timers from the previous draw
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
    if (removeTimeoutRef.current !== null) {
      window.clearTimeout(removeTimeoutRef.current)
      removeTimeoutRef.current = null
    }
    setWinner(null)
    setWinnerFoundName(null)
    setShowWinnerAlert(false)
    setIsDrawing(true)
  }, [participants, isDrawing, toast])

  const handleWinnerSelected = useCallback((finalWinner: string) => {
    setIsDrawing(false)
    setWinner(finalWinner)
    setWinnerFoundName(finalWinner)

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

    setWinners(prev => {
      const next = [newWinner, ...prev]
      if (ownerToken) {
        const sharedNext = [newWinner, ...sharedWinnersRef.current]
        saveSharedWinners(sharedNext, ownerToken).catch(() => {
          toast.error('ကံထူးရှင်စာရင်း သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
        })
      }
      return next
    })

    // Re-find the winner in the participants list above and highlight them
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (!el) return
      const rows = Array.from(el.querySelectorAll('[data-row]'))
      const target = rows.find(r => r.getAttribute('data-name') === finalWinner)
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })

    // Show the winner clearly, then remove them from the list
    revealTimeoutRef.current = window.setTimeout(() => {
      setShowWinnerAlert(true)
      toast.success(`🎉 "${finalWinner}" ကံထူးသွားပါပြီ!`)
    }, 1200)

    removeTimeoutRef.current = window.setTimeout(() => {
      if (autoRemoveWinner) {
        const next = participantsRef.current.filter(p => p !== finalWinner)
        setParticipants(next)
        setWinnerFoundName(null)
        locallyRemovedRef.current.add(finalWinner)
        locallyAddedRef.current.delete(finalWinner)
        if (ownerToken) {
          markSyncStart()
          saveSharedParticipants(next, ownerToken)
            .then(markSyncOk)
            .catch(() => {
              markSyncFail()
              toast.error('အင်တာနက်မှာ သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
            })
        }
      } else {
        setWinnerFoundName(null)
      }
    }, 1900)
  }, [soundEnabled, playWin, ownerToken, autoRemoveWinner, toast, markSyncStart, markSyncOk, markSyncFail])



  const handleClearWinners = useCallback(() => {
    setWinners([])
    localStorage.removeItem(STORAGE_KEY)
    if (ownerToken) {
      markSyncStart()
      saveSharedWinners([], ownerToken)
        .then(markSyncOk)
        .catch(() => {
          markSyncFail()
          toast.error('ကံထူးရှင်စာရင်း သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
        })
    }
    toast.success('စာရင်းဖျက်သိမ်းပြီးပါပြီ')
  }, [ownerToken, toast, markSyncStart, markSyncOk, markSyncFail])

  return (
    <div className="min-h-screen bg-background text-white relative">


      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-cyan-400/20 bg-black/60 backdrop-blur-md sticky top-0 z-30">
          <div className="font-hud text-[10px] xs:text-xs text-cyan-300/80 border-b border-cyan-400/15 bg-black/40 px-4 py-1.5 flex items-center justify-between gap-3 overflow-hidden">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
              SYS.LUCKY_DRAW // ONLINE
            </span>
            <span className="hidden xs:inline tracking-widest text-cyan-400/60">v2.0_CYBER</span>
            <span className={`hidden md:inline tracking-widest ${isDrawing ? 'neon-magenta cyber-flicker' : isOwner ? 'neon-green' : 'text-cyan-400/50'}`}>
              {isDrawing ? 'DECRYPTING_WINNER...' : isOwner ? 'OWNER_MODE' : 'GUEST_MODE'}
            </span>
          </div>
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
                  <h1 className="display-font text-xl md:text-2xl neon-cyan glitch-title">WoW - Lucky Draw</h1>
                  <p className="font-hud text-xs neon-green hidden xs:block">// RANDOM WINNER PICKER</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOwnerModal(true)}
                  className={`font-hud px-3 py-2 rounded-xl text-sm transition-all border ${
                    isOwner
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-black/40 border-cyan-400/30 text-cyan-300 hover:border-fuchsia-400/50'
                  }`}
                  title={isOwner ? 'Owner Settings' : 'Owner Login'}
                >
                  {isOwner ? '🔓' : '🔒'}
                  <span className="hidden xs:inline ml-1">{isOwner ? 'ပိုင်ရှင်' : 'Owner'}</span>
                </button>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white text-lg"
                  title={soundEnabled ? 'Sound On' : 'Sound Off'}
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="font-hud px-4 py-2 bg-black/40 hover:bg-white/10 text-cyan-200 border border-cyan-400/30 hover:border-fuchsia-400/50 rounded-xl text-sm transition-all flex items-center gap-2"
                >
                  <span>📋</span>
                  <span className="hidden xs:inline">ကံထူးရှင်များ</span>
                  {displayWinners.length > 0 && (
                    <span className="bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {displayWinners.length}
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
                <div className="mt-4 md:mt-6 text-sm md:text-base text-cyan-300/90 tracking-wider drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
                  ◤ WoW မှ စာဖတ်သူများအတွက် သီးသန့် ◢
                </div>
              </div>

              {/* HUD overlays */}
              <div className="absolute inset-x-0 top-2 z-20 flex items-center justify-between px-4 font-hud text-[10px] md:text-xs text-cyan-300/70 pointer-events-none">
                <span>◤ TARGET.LIST</span>
                <span className={`cyber-flicker ${isDrawing ? 'neon-magenta' : 'neon-green'}`}>{isDrawing ? '◉ SPINNING' : '● LIVE'}</span>
                <span>MODE: RANDOM</span>
              </div>
              <div className="absolute inset-x-0 bottom-2 z-20 flex items-center justify-between px-4 font-hud text-[10px] md:text-xs text-cyan-300/70 pointer-events-none">
                <span>N.ENTRIES: {participants.length}</span>
                <span>STATUS: {isDrawing ? 'SELECTING' : 'READY'}</span>
                <span>◢</span>
              </div>
            </div>
          </div>

          {/* Input Section - owner only */}
          {isOwner && (
            <div className="bg-black/40 backdrop-blur-sm border border-cyan-400/15 rounded-2xl p-5 xs:p-6 mb-6 shadow-[0_0_20px_rgba(0,240,255,0.05)]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-hud text-[10px] text-amber-300/80 tracking-[0.25em]">
                  🔓 OWNER_PANEL — နာမည်များ ထည့်ပါ {ownerLogin ? `(@${ownerLogin})` : ''}
                </div>
                <span
                  className={`font-hud text-[10px] tracking-[0.2em] whitespace-nowrap ${
                    syncState === 'error'
                      ? 'text-red-400'
                      : syncState === 'saved'
                        ? 'text-green-300'
                        : syncState === 'saving'
                          ? 'text-yellow-300'
                          : 'text-white/30'
                  }`}
                >
                  {syncState === 'saving'
                    ? 'SYNCING...'
                    : syncState === 'saved'
                      ? '✓ SAVED'
                      : syncState === 'error'
                        ? '✗ SAVE FAILED'
                        : 'SYNC_READY'}
                </span>
              </div>
              <ParticipantInput
                value={inputValue}
                onChange={setInputValue}
                onAdd={addParticipant}
                onKeyDown={e => { if (e.key === 'Enter') addParticipant() }}
                participantCount={participants.length}
                maxParticipants={MAX_PARTICIPANTS}
              />

              {participants.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/50">
                  <span>စုစုပေါင်း: <strong className="text-white">{participants.length.toLocaleString()}</strong> ယောက်</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoRemoveWinner}
                        onChange={e => setAutoRemoveWinner(e.target.checked)}
                        className="accent-purple-500"
                      />
                      <span className="text-[11px] text-white/60">အနိုင်ရသူကို auto ဖျက်မယ်</span>
                    </label>
                    <button
                      onClick={() => {
                        for (const n of participantsRef.current) locallyRemovedRef.current.add(n)
                        locallyAddedRef.current.clear()
                        setParticipants([])
                        localStorage.removeItem(PARTICIPANTS_KEY)
                        if (ownerToken) {
                          markSyncStart()
                          saveSharedParticipants([], ownerToken)
                            .then(markSyncOk)
                            .catch(() => {
                              markSyncFail()
                              toast.error('အင်တာနက်မှာ သိမ်းမရပါ — ထပ်ကြိုးစားပါ')
                            })
                        }
                        toast.info('ပါဝင်သူများ ဖျက်သိမ်းပြီးပါပြီ')
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      အားလုံးဖျက်မယ်
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Participants List */}
          <div
            className={`bg-black/40 backdrop-blur-sm border rounded-2xl p-5 xs:p-6 transition-all duration-300 ${
              isDrawing
                ? 'border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
                : 'border-cyan-400/15'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="display-font text-lg text-white">📝 ပါဝင်သူများ</h3>
              <div className="flex items-center gap-3">
                <span className={`font-hud text-[10px] flex items-center gap-1.5 ${sharedError ? 'text-red-400' : 'text-green-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sharedError ? 'bg-red-500' : 'bg-green-400 animate-pulse'}`} />
                  {sharedLoading ? 'SYNCING...' : sharedError ? 'OFFLINE_MODE' : 'LIVE_SYNC'}
                </span>
                <span className="text-xs text-white/50">
                  {participants.length.toLocaleString()} / {MAX_PARTICIPANTS.toLocaleString()}
                </span>
              </div>
            </div>
            <div ref={listScrollRef} className="relative max-h-[420px] overflow-y-auto pr-1 -mr-1">
              {isDrawing && (
                <div className="sticky top-1/2 z-10 pointer-events-none -translate-y-1/2 h-[2px] bg-cyan-400/70 shadow-[0_0_14px_rgba(0,240,255,0.9)]" />
              )}
              <ParticipantList
                participants={participants}
                onRemove={removeParticipant}
                spotlightIndex={spotlightIndex}
                winnerFoundName={winnerFoundName}
                showSpacers={isDrawing}
                canRemove={isOwner}
              />
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
                playHeartbeat={playHeartbeat}
                onFinished={handleWinnerSelected}
              />
            </div>
          ) : (
            <div className="bg-black/40 backdrop-blur-sm border border-cyan-400/15 rounded-2xl p-6 mt-6 min-h-[120px] flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.05)]">
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
            <div className="font-hud text-[10px] text-cyan-400/60 text-center mb-2 tracking-[0.25em]">
              ▸ {participants.length.toLocaleString()} ENTRIES QUEUED — CLICK TO INITIATE
            </div>
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
            winners={displayWinners}
            live={sharedWinners.length > 0}
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

        {/* Owner Modal */}
        {showOwnerModal && (
          <OwnerModal
            login={ownerLogin}
            onClose={() => setShowOwnerModal(false)}
            onConnect={async token => {
              const login = await validateOwnerToken(token)
              localStorage.setItem(OWNER_TOKEN_KEY, token)
              localStorage.setItem(OWNER_LOGIN_KEY, login)
              setOwnerToken(token)
              setOwnerLogin(login)
              setShowOwnerModal(false)
              toast.success(`@${login} ပိုင်ရှင် mode ဝင်ပြီးပါပြီ`)
            }}
            onLogout={() => {
              localStorage.removeItem(OWNER_TOKEN_KEY)
              localStorage.removeItem(OWNER_LOGIN_KEY)
              setOwnerToken(null)
              setOwnerLogin(null)
              setShowOwnerModal(false)
              toast.info('ပိုင်ရှင် mode ပိတ်ပြီးပါပြီ')
            }}
          />
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
