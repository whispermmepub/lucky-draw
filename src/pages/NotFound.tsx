import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl mb-6">🔮</div>
        <h1 className="display-font text-4xl md:text-5xl text-primary mb-4" style={{ color: '#DC143C' }}>404</h1>
        <p className="text-white/60 mb-8">
          သင်ရှာဖွေနေသော စာမျက်နှာကို ရှာမတွေ့ပါ။
        </p>
        <Link
          to="/lucky-draw/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-all shadow-[0_0_14px_rgba(0,240,255,0.3)]"
        >
          <span>←</span>
          <span>မူလစာမျက်နှာသို့</span>
        </Link>
      </div>
    </div>
  )
}
