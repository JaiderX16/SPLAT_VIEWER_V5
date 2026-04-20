
import { Download, Cpu, Activity, Info, Play, Pause } from 'lucide-react';

interface ViewerHUDProps {
  phase: 'downloading' | 'holding' | 'ready';
  progress: number;
  vertexCount: number;
  totalSplats: number;
  fps: number;
  carousel: boolean;
  setCarousel: (v: boolean) => void;
  error: string | null;
}

export function ViewerHUD({
  phase,
  progress,
  vertexCount,
  totalSplats,
  fps,
  carousel,
  setCarousel,
  error
}: ViewerHUDProps) {
  if (error) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-50">
      {/* Top Section: Progress & Status */}
      <div className="w-full max-w-xl mx-auto space-y-3">
        {(phase !== 'ready' || progress < 100) && (
          <div className="w-full bg-white/5 backdrop-blur-md rounded-full h-1.5 overflow-hidden border border-white/10 shadow-lg shadow-black/20">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        
        <div className="flex justify-between items-center px-2">
          <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 shadow-2xl">
            {phase === 'downloading' && (
              <>
                <Download className="w-4 h-4 text-blue-400 animate-pulse" />
                <span className="text-xs font-medium text-blue-100/90 tracking-wide uppercase">Downloading {progress}%</span>
              </>
            )}
            {phase === 'holding' && (
              <>
                <Cpu className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-xs font-medium text-amber-100/90 tracking-wide uppercase">Finalizing Geometry...</span>
              </>
            )}
            {phase === 'ready' && (
              <>
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-100/90 tracking-wide uppercase">System Ready</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 shadow-2xl">
             <div className="flex flex-col items-end">
                <span className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Render Speed</span>
                <span className="text-xs font-mono text-cyan-400 leading-none">{fps} FPS</span>
             </div>
             <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col items-end min-w-[100px]">
                 <span className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Splat Count</span>
                 <span className="text-xs font-mono text-white/90 leading-none">
                   {vertexCount.toLocaleString()} <span className="text-white/30 text-[10px]">/ {totalSplats.toLocaleString()}</span>
                 </span>
              </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Controls & Help */}
      <div className="flex justify-between items-end pointer-events-auto">
        <div className="flex flex-col gap-4">
          <div className="bg-black/40 backdrop-blur-xl p-5 rounded-3xl border border-white/5 shadow-2xl max-w-xs group transition-all hover:bg-black/60">
             <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Navigation</span>
             </div>
             <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-white/60 font-medium leading-relaxed">
                <span>Orbit</span> <span className="text-white/40 font-mono">DRAG</span>
                <span>Move</span> <span className="text-white/40 font-mono">ARROWS</span>
                <span>Zoom</span> <span className="text-white/40 font-mono">SCROLL</span>
                <span>Reset</span> <span className="text-white/40 font-mono">[R]</span>
             </div>
          </div>

          <button
            onClick={() => setCarousel(!carousel)}
            className="flex items-center gap-3 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-2xl transition-all shadow-xl shadow-cyan-900/40 active:scale-95 group font-bold tracking-wide text-xs uppercase"
          >
            {carousel ? (
              <>
                <Pause className="w-4 h-4 fill-white" />
                Stop Cinematic
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Start Cinematic
              </>
            )}
          </button>
        </div>

        <div className="text-[10px] text-white/20 font-medium">
          SPLAT VIEWER PRO V5 &copy; 2026
        </div>
      </div>
    </div>
  );
}
