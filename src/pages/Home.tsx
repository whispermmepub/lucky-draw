import { useState, useRef, useEffect, useCallback } from 'react'
import { ToastProvider, useToast } from '../components/Toast.tsx'

interface Winner {
  name: string
  timestamp: string
  date: string
}

const MAX_PARTICIPANTS = 5000
const STORAGE_KEY = 'lucky-draw-winners'
const SOUND_ENABLED_KEY = 'lucky-draw-sound'

function useSoundEffect() {
  const audioCtxRef = useRef<AudioContext | null>(null)

  const playTick = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 800 + Math.random() * 400
      osc.type = 'sine'
      gain.gain.value = 0.08
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.08)
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
      const notes = [523, 659, 784, 1047]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.value = 0.1
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3)
        osc.start(ctx.currentTime + i * 0.15)
        osc.stop(ctx.currentTime + i * 0.15 + 0.3)
      })
    } catch {
      // audio not available
    }
  }, [])

  return { playTick, playWin }
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
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
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
          placeholder="နာမည် ထည့်ပါ..."
          className="w-full px-4 py-3.5 bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-base"
          disabled={participantCount >= maxParticipants}
        />
      </div>
      <button
        onClick={onAdd}
        disabled={!value.trim() || participantCount >= maxParticipants}
        className="px-6 py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-xl font-semibold transition-all active:scale-95 flex items-center gap-2 mont-font text-sm"
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
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm">ပါဝင်သူ မရှိသေးပါ</p>
        <p className="text-xs mt-1 opacity-60">အထက်ပါအကွက်တွင် နာမည်များ ထည့်သွင်းပါ</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-2">
      {participants.map((name, i) => (
        <div
          key={`${name}-${i}`}
          className="group relative p-3 bg-card/50 border border-border rounded-xl hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary/60 to-primary/40 flex items-center justify-center text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm font-medium truncate flex-1">{name}</span>
            <button
              onClick={() => onRemove(i)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded-lg transition-all text-muted-foreground hover:text-destructive"
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
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white animate-pulse-glow'
          : 'bg-gradient-to-r from-primary via-purple-500 to-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20'
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
        <span>🎯 ပစ်မယ်!</span>
      )}
    </button>
  )
}

function WinnerDisplay({ winner }: { winner: string | null }) {
  if (!winner) return null

  return (
    <div className="text-center py-6 animate-draw-reveal">
      <div className="text-5xl mb-4">🏆</div>
      <div className="text-2xl md:text-3xl font-bold display-font text-primary mb-1">
        🎉 {winner} 🎉
      </div>
      <p className="text-sm text-muted-foreground">ဂုဏ်ယူပါတယ်!</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="display-font text-2xl text-primary">📋 ကံထူးရှင်စာရင်း</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {winners.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>ကံထူးရှင်စာရင်း မရှိသေးပါ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {winners.map((w, i) => (
                <div
                  key={`${w.name}-${i}`}
                  className="p-3 bg-card/50 border border-border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary/40 flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                      <p className="text-xs text-muted-foreground mt-1">{w.timestamp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {winners.length > 0 && (
          <div className="border-t border-border p-6 flex gap-3 flex-wrap">
            <button
              onClick={downloadExcel}
              className="flex-1 min-w-[140px] px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all text-sm"
            >
              📊 Excel ဒေါင်းလုဒ်
            </button>
            <button
              onClick={downloadCSV}
              className="flex-1 min-w-[140px] px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl font-medium transition-all text-sm"
            >
              CSV ဒေါင်းလုဒ်
            </button>
            <button
              onClick={onClear}
              className="flex-1 min-w-[140px] px-4 py-2.5 border border-destructive text-destructive hover:bg-destructive/10 rounded-xl font-medium transition-all text-sm"
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
  const { playTick, playWin } = useSoundEffect()

  const [participants, setParticipants] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
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

  const drawIntervalRef = useRef<number | null>(null)
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [participants])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(winners))
  }, [winners])

  useEffect(() => {
    localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled))
  }, [soundEnabled])

  const addParticipant = useCallback(() => {
    const name = inputValue.trim()
    if (!name) return
    if (participants.length >= MAX_PARTICIPANTS) {
      toast.error(`အများဆုံး ${MAX_PARTICIPANTS.toLocaleString()} ယောက်သာ ထည့်နိုင်ပါသည်`)
      return
    }
    if (participants.includes(name)) {
      toast.error('ဤနာမည် ရှိပြီးသားပါ')
      return
    }
    setParticipants(prev => [...prev, name])
    setInputValue('')
    toast.success(`"${name}" ကို ထည့်သွင်းပြီးပါပြီ`)
  }, [inputValue, participants, toast])

  const removeParticipant = useCallback((index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index))
  }, [])

  const startDraw = useCallback(() => {
    if (participants.length === 0) {
      toast.error('ပါဝင်သူ အနည်းဆုံး ၁ ယောက် လိုပါသည်')
      return
    }
    if (isDrawing) return

    setIsDrawing(true)
    setWinner(null)

    let tickCount = 0
    const maxTicks = 15 + Math.floor(Math.random() * 10)

    drawIntervalRef.current = window.setInterval(() => {
      tickCount++
      const randomIndex = Math.floor(Math.random() * participants.length)
      const tempWinner = participants[randomIndex]
      setWinner(tempWinner)
      if (soundEnabled) playTick()

      if (tickCount >= maxTicks) {
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current)
          drawIntervalRef.current = null
        }
        setIsDrawing(false)
        const finalIndex = Math.floor(Math.random() * participants.length)
        const finalWinner = participants[finalIndex]
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
        toast.success(`🎉 "${finalWinner}" ကံထူးသွားပါပြီ!`)
      }
    }, 80 + Math.random() * 60)
  }, [participants, isDrawing, soundEnabled, playTick, playWin, toast])

  useEffect(() => {
    return () => {
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current)
      }
    }
  }, [])

  const handleClearWinners = useCallback(() => {
    setWinners([])
    localStorage.removeItem(STORAGE_KEY)
    toast.success('စာရင်းဖျက်သိမ်းပြီးပါပြီ')
  }, [toast])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-primary/20">
                🍀
              </div>
              <div>
                <h1 className="display-font text-xl md:text-2xl text-primary">Lucky Draw</h1>
                <p className="text-xs text-muted-foreground hidden xs:block">Random Winner Picker</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground text-lg"
                title={soundEnabled ? 'Sound On' : 'Sound Off'}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl text-sm font-medium transition-all flex items-center gap-2"
              >
                <span>📋</span>
                <span className="hidden xs:inline">ကံထူးရှင်များ</span>
                {winners.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
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
        <div className="text-center mb-10">
          <div className="text-6xl md:text-7xl mb-6 animate-bounce">🍀</div>
          <h2 className="display-font text-3xl md:text-4xl text-primary mb-3">
            ကံထူးသူအား ရွေးချယ်ရန်
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
            ပါဝင်သူများ၏ နာမည်ကို ထည့်သွင်းပြီး Lucky Draw ပြုလုပ်လိုက်ပါ။
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-card/50 border border-border rounded-2xl p-4 xs:p-6 mb-8">
          <ParticipantInput
            value={inputValue}
            onChange={setInputValue}
            onAdd={addParticipant}
            onKeyDown={e => { if (e.key === 'Enter') addParticipant() }}
            participantCount={participants.length}
            maxParticipants={MAX_PARTICIPANTS}
          />

          {participants.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>စုစုပေါင်း: <strong className="text-foreground">{participants.length.toLocaleString()}</strong> ယောက်</span>
              <button
                onClick={() => {
                  setParticipants([])
                  toast.info('ပါဝင်သူများ ဖျက်သိမ်းပြီးပါပြီ')
                }}
                className="text-destructive hover:text-destructive/80 transition-colors"
              >
                အားလုံးဖျက်မယ်
              </button>
            </div>
          )}
        </div>

        {/* Draw Section */}
        <div className="mb-8">
          <DrawButton onClick={startDraw} disabled={participants.length === 0 || isDrawing} isDrawing={isDrawing} />
        </div>

        {/* Winner Display */}
        <div className="bg-card/50 border border-border rounded-2xl p-6 mb-8 min-h-[120px] flex items-center justify-center">
          {winner ? (
            <WinnerDisplay winner={winner} />
          ) : (
            <div className="text-center text-muted-foreground">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-sm">အထက်ပါခလုတ်ကို နှိပ်၍ ကံထူးသူအား ရွေးချယ်ပါ</p>
            </div>
          )}
        </div>

        {/* Participants List */}
        <div className="bg-card/50 border border-border rounded-2xl p-4 xs:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="display-font text-lg text-primary">📝 ပါဝင်သူများ</h3>
            <span className="text-xs text-muted-foreground">
              {participants.length.toLocaleString()} / {MAX_PARTICIPANTS.toLocaleString()}
            </span>
          </div>
          <ParticipantList participants={participants} onRemove={removeParticipant} />
          <div ref={listEndRef} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/30 py-8 mt-12">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>
            Lucky Draw © 2026 •{' '}
            <a
              href="https://t.me/TheBookR"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
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

      {/* Confetti */}
      {winner && !isDrawing && <ConfettiOverlay />}
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
