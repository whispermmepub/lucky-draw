import { useState, useRef, useEffect, useCallback } from 'react'
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-2">
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

function WinnerDisplay({ winner }: { winner: string | null }) {
  if (!winner) return null

  return (
    <div className="text-center py-6 animate-draw-reveal">
      <div className="text-5xl mb-4">🏆</div>
      <div className="text-2xl md:text-3xl font-bold display-font text-purple-400 mb-1">
        🎉 {winner} 🎉
      </div>
      <p className="text-sm text-white/60">ဂုဏ်ယူပါတယ်!</p>
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
  const { playTick, playWin } = useSoundEffect()

  const [participants, setParticipants] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(PARTICIPANTS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
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
        // Remove the winner from participants so they can't win again
        setParticipants(prev => prev.filter(p => p !== finalWinner))
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
                  <div className="text-4xl md:text-5xl">အိမ်ဖော်</div>
                  <div className="text-xl md:text-2xl text-white/80 mt-6 md:mt-8">သက်ပိုင်(ဘာသာပြန်)</div>
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

          {/* Draw Section */}
          <div className="mb-8">
            <DrawButton onClick={startDraw} disabled={participants.length === 0 || isDrawing} isDrawing={isDrawing} />
          </div>

          {/* Winner Display */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6 min-h-[120px] flex items-center justify-center">
            {winner ? (
              <WinnerDisplay winner={winner} />
            ) : (
              <div className="text-center text-white/50">
                <div className="text-3xl mb-2">🎯</div>
                <p className="text-sm">အထက်ပါခလုတ်ကို နှိပ်၍ ကံထူးသူအား ရွေးချယ်ပါ</p>
              </div>
            )}
          </div>

          {/* Participants List */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 xs:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="display-font text-lg text-white">📝 ပါဝင်သူများ</h3>
              <span className="text-xs text-white/50">
                {participants.length.toLocaleString()} / {MAX_PARTICIPANTS.toLocaleString()}
              </span>
            </div>
            <ParticipantList participants={participants} onRemove={removeParticipant} />
            <div ref={listEndRef} />
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

        {/* Confetti */}
        {winner && !isDrawing && <ConfettiOverlay />}
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
