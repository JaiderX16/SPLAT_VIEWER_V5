import { useState, useCallback, useEffect } from 'react';
import { GaussianSplatViewer } from '@/components/GaussianSplatViewer';
import Sidebar from '@/components/Sidebar';
import SidebarMobile from '@/components/SidebarMobile';
import { useActiveScene, type GalleryModel } from '@/hooks/useActiveScene';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ChevronRight } from 'lucide-react';

const GALLERY_MODELS: GalleryModel[] = [
  { id: 'huamanmarca',  name: 'Huamanmarca',  path: '/models/Huamanmarca.splat',                   format: 'splat' },
  { id: 'constitucion', name: 'Constitución',  path: '/models/Constitucion.splat',                  format: 'splat' },
  { id: 'taza',         name: 'Taza',          path: '/models/TAZA_optimizado_80 (3).splat',        format: 'splat' },
  { id: 'taza-final',   name: 'Taza Final',    path: '/models/TAZA_optimizado_80 (4)_FINAL.splat',  format: 'splat' },
  { id: 'apata',        name: 'Apata Fuente',  path: '/models/APATA-FUENTE-2t.splat',               format: 'splat' },
  { id: 'lago',         name: 'Lago Azul',     path: '/models/LAGO=AZUL.splat',                     format: 'splat' },
];

function App() {
  const { activeId, fileUrl, error: uploadError, clearError, selectModel, handleUpload } = useActiveScene(GALLERY_MODELS[0]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  const handleSelectModel = useCallback((model: GalleryModel) => {
    selectModel(model);
    setSidebarOpen(false);
  }, [selectModel]);

  const handleFileDrop = useCallback(
    (file: File) => {
      handleUpload(file);
    },
    [handleUpload]
  );

  // Keyboard shortcuts: arrow keys to navigate models, S to toggle sidebar
  const currentModelIndex = GALLERY_MODELS.findIndex(m => m.id === activeId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setSidebarOpen(o => !o);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (currentModelIndex + 1) % GALLERY_MODELS.length;
        handleSelectModel(GALLERY_MODELS[next]);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (currentModelIndex - 1 + GALLERY_MODELS.length) % GALLERY_MODELS.length;
        handleSelectModel(GALLERY_MODELS[prev]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentModelIndex, handleSelectModel]);

  const sidebarProps = {
    models: GALLERY_MODELS,
    activeId,
    onSelectModel: handleSelectModel,
    onUpload: handleUpload,
    uploadError,
    onClearError: clearError,
    isOpen: sidebarOpen,
    setIsOpen: setSidebarOpen,
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <main className="absolute inset-0">
        <GaussianSplatViewer
          source={fileUrl}
          onFileDrop={handleFileDrop}
        />
      </main>

      {isMobile
        ? <SidebarMobile {...sidebarProps} />
        : <Sidebar {...sidebarProps} />
      }

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-6 left-6 z-[300] w-12 h-12 rounded-full bg-[#1a1a1e]/70 backdrop-blur-[28px] border border-white/[0.08] text-white/50 flex items-center justify-center hover:bg-white/10 hover:text-white/80 transition-all duration-150 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          title="Mostrar panel"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default App;
