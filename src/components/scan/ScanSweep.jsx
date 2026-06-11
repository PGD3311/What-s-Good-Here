export function ScanSweep({ photoUrl }) {
  return (
    <div className="fixed inset-0 z-40 overflow-hidden" style={{ background: '#1a1714' }}>
      {photoUrl && <img src={photoUrl} alt="" className="w-full h-full object-contain opacity-70" />}
      <div className="scan-line" />
      <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-sm px-4 py-2 rounded-full"
        style={{ color: '#fff', background: 'rgba(0,0,0,0.45)' }}>
        Reading the menu…
      </p>
      <style>{`
        .scan-line {
          position: absolute; left: 0; right: 0; height: 3px; top: 0;
          background: linear-gradient(90deg, transparent, var(--color-rating), #fff, var(--color-rating), transparent);
          box-shadow: 0 0 22px 6px rgba(22, 163, 74, 0.55);
          animation: xray-sweep 1.5s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }
        @keyframes xray-sweep { 0% { top: 4%; } 100% { top: 92%; } }
      `}</style>
    </div>
  )
}
