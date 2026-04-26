import { useRef, useState, useEffect } from 'react';
import { useGaussianSplatV3 } from '@/hooks/useGaussianSplatV3';
import { ViewerHUD } from './ViewerHUD';
import { Upload, FolderOpen } from 'lucide-react';

export function GaussianSplatViewer() {
  const [source, setSource] = useState<string | File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Load source when it changes (skip initial null)
  useEffect(() => {
    if (source) {
      loadSource(source);
    }
  }, [source, loadSource]);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.splat')) {
      alert('Por favor selecciona un archivo .splat');
      return;
    }
    setSource(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
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

  const openFilePicker = () => fileInputRef.current?.click();
  const loadDemo = () => setSource('https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat');

  if (error) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white p-10 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Renderer Error</h2>
          <p className="text-white/60 text-sm max-w-md">{error}</p>
          <button
            onClick={openFilePicker}
            className="mt-6 flex items-center gap-2 mx-auto bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-all text-sm font-medium"
          >
            <FolderOpen className="w-4 h-4" />
            Intentar con otro archivo
          </button>
        </div>
      </div>
    );
  }

  const showSelector = !source;

  return (
    <div
      className="relative w-full h-screen bg-black overflow-hidden font-sans select-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
      />

      {showSelector && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center transition-colors duration-200 ${isDragging ? 'bg-cyan-500/10' : 'bg-black/80'}`}>
          <div className={`text-center p-12 rounded-3xl border-2 border-dashed transition-all duration-200 max-w-md mx-4 ${isDragging ? 'border-cyan-400 bg-cyan-500/10 scale-105' : 'border-white/20 bg-white/5'}`}>
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-cyan-400' : 'text-white/60'}`} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Cargar modelo Splat</h2>
            <p className="text-sm text-white/50 mb-8">
              Arrastra un archivo <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/70 text-xs">.splat</code> aquí<br />o selecciónalo desde tu equipo
            </p>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={openFilePicker}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl transition-all text-sm font-medium border border-white/10 hover:border-white/20"
              >
                <FolderOpen className="w-4 h-4" />
                Seleccionar archivo
              </button>
              <button
                onClick={loadDemo}
                className="text-white/40 hover:text-white px-4 py-2 rounded-xl transition-all text-xs font-medium"
              >
                o probar con el modelo demo (train.splat)
              </button>
            </div>
          </div>
        </div>
      )}

      {!showSelector && (
        <>
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

          <div className="absolute top-6 right-6 z-50 pointer-events-auto">
            <button
              onClick={openFilePicker}
              className="flex items-center gap-2 bg-black/40 hover:bg-black/60 backdrop-blur-xl text-white/70 hover:text-white px-4 py-2 rounded-xl transition-all text-xs font-medium border border-white/10"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Cambiar modelo
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".splat"
        hidden
        onChange={handleInputChange}
      />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
