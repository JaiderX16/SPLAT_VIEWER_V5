import { memo, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';

interface GalleryModel {
  id: string;
  name: string;
  path: string;
  format: string;
}

const ModelItem = memo(function ModelItem({
  model,
  index,
  isActive,
  onSelect,
}: {
  model: GalleryModel;
  index: number;
  isActive: boolean;
  onSelect: (model: GalleryModel) => void;
}) {
  return (
    <button
      onClick={() => onSelect(model)}
      style={{ animationDelay: `${index * 55}ms` }}
      className={`group w-full flex items-center gap-3 px-3 py-3 rounded-2xl border text-left transition-all duration-200 animate-[item-in_0.4s_ease_both] ${
        isActive
          ? 'bg-white/[0.1] border-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'bg-transparent border-transparent hover:bg-white/[0.05] hover:border-white/[0.07]'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-bold tabular-nums transition-all duration-200 ${
          isActive ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/25 group-hover:text-white/40'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold truncate transition-colors duration-200 ${
            isActive ? 'text-white' : 'text-white/60 group-hover:text-white/80'
          }`}
        >
          {model.name}
        </p>
        <p
          className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 transition-colors duration-200 ${
            isActive ? 'text-white/40' : 'text-white/20'
          }`}
        >
          {model.format}
        </p>
      </div>

      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200 ${
          isActive ? 'bg-white opacity-70' : 'bg-white/10'
        }`}
      />
    </button>
  );
});

interface SidebarContentProps {
  models?: GalleryModel[];
  activeId: string;
  onSelectModel: (model: GalleryModel) => void;
  onUpload: (file: File) => void;
  uploadError?: string | null;
  onClearError?: () => void;
  clock: string;
  setIsOpen: (v: boolean) => void;
  closeOnSelect?: boolean;
  compact?: boolean;
}

export default function SidebarContent({
  models = [],
  activeId,
  onSelectModel,
  onUpload,
  uploadError,
  onClearError,
  clock,
  setIsOpen,
  closeOnSelect = false,
  compact = false,
}: SidebarContentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(file);
        e.target.value = '';
      }
    },
    [onUpload]
  );

  const dismissError = useCallback(() => {
    onClearError?.();
  }, [onClearError]);

  const handleSelectModel = useCallback(
    (model: GalleryModel) => {
      onSelectModel(model);
      if (closeOnSelect) setIsOpen(false);
    },
    [onSelectModel, closeOnSelect, setIsOpen]
  );

  return (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 ${compact ? 'pt-0' : 'pt-6'} pb-4 shrink-0`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white animate-[pulse-dot_2.4s_ease-in-out_infinite]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white tracking-widest uppercase">Splat Viewer</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-[5px] h-[5px] rounded-full bg-emerald-400 animate-[blink-led_3s_ease-in-out_infinite]" />
              <span className="text-xs text-white/30 tabular-nums">{clock}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/70 transition-all duration-150"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06] mx-6 shrink-0" />

      {/* Section label */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Scene Library</p>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-1.5 pb-3">
          {models.map((model, i) => (
            <ModelItem
              key={model.id}
              model={model}
              index={i}
              isActive={activeId === model.id}
              onSelect={handleSelectModel}
            />
          ))}
        </div>
      </div>

      {/* Error message */}
      {uploadError && (
        <div className="shrink-0 px-6 pb-3">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-200/80 leading-relaxed">{uploadError}</p>
            </div>
            <button onClick={dismissError} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 p-6">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 flex items-center justify-center gap-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/50 text-xs font-semibold uppercase tracking-widest hover:bg-white/[0.1] hover:text-white/80 hover:border-white/[0.14] active:scale-[0.98] transition-all duration-150"
        >
          <Upload className="w-4 h-4" />
          Load Scene
        </button>
        <input ref={fileInputRef} type="file" accept=".splat,.ply" hidden onChange={handleFileChange} />
      </div>
    </>
  );
}
