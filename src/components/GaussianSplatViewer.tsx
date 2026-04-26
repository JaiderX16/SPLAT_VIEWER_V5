import { useRef, useState, useEffect } from 'react';
import { useGaussianSplatV3 } from '@/hooks/useGaussianSplatV3';
import { ViewerHUD } from './ViewerHUD';
import { Upload } from 'lucide-react';

interface GaussianSplatViewerProps {
  source: string | File | null;
  onFileDrop?: (file: File) => void;
}

export function GaussianSplatViewer({ source, onFileDrop }: GaussianSplatViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const attemptedRef = useRef<string | File | null>(null);

  const {
    containerRef,
    phase,
    progress,
    fps,
    error,
    vertexCount,
    totalSplats,
    carousel,
    setCarousel,
    loadSource,
  } = useGaussianSplatV3();

  // Load source when it changes — ref trick handles React StrictMode remounts
  useEffect(() => {
    let cleanupFn: (() => void) | undefined;
    if (source && attemptedRef.current !== source) {
      attemptedRef.current = source;
      cleanupFn = loadSource(source);
    }
    return () => {
      attemptedRef.current = null;
      cleanupFn?.();
    };
  }, [source, loadSource]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && onFileDrop) {
      onFileDrop(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  if (error) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center text-white p-10 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Renderer Error</h2>
          <p className="text-white/60 text-sm max-w-md">{error}</p>
          <p className="text-white/40 text-xs mt-4">Selecciona otro modelo desde la barra lateral</p>
        </div>
      </div>
    );
  }

  const showEmpty = !source;

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden font-sans select-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
      />

      {showEmpty && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center transition-colors duration-200 ${isDragging ? 'bg-cyan-500/10' : 'bg-black/80'}`}>
          <div className={`text-center p-12 rounded-3xl border-2 border-dashed transition-all duration-200 max-w-md mx-4 ${isDragging ? 'border-cyan-400 bg-cyan-500/10 scale-105' : 'border-white/20 bg-white/5'}`}>
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-cyan-400' : 'text-white/60'}`} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Splat Viewer</h2>
            <p className="text-sm text-white/50 mb-2">
              Selecciona un modelo desde la barra lateral
            </p>
            <p className="text-xs text-white/30">
              o arrastra un archivo <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/70 text-xs">.splat</code> aquí
            </p>
          </div>
        </div>
      )}

      {!showEmpty && (
        <ViewerHUD
          phase={phase}
          progress={progress}
          vertexCount={vertexCount}
          totalSplats={totalSplats}
          fps={fps}
          carousel={carousel}
          setCarousel={setCarousel}
          error={error}
        />
      )}

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
