import SidebarContent from './SidebarContent';
import { useClock } from '@/hooks/useClock';
import type { GalleryModel } from '@/hooks/useActiveScene';

interface SidebarProps {
  models?: GalleryModel[];
  activeId: string;
  onSelectModel: (model: GalleryModel) => void;
  onUpload: (file: File) => void;
  uploadError?: string | null;
  onClearError?: () => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

export default function Sidebar({
  models = [],
  activeId,
  onSelectModel,
  onUpload,
  uploadError,
  onClearError,
  isOpen,
  setIsOpen,
}: SidebarProps) {
  const clock = useClock();

  return (
    <aside
      className={`
        absolute z-[20000] will-change-transform overflow-hidden
        top-4 left-4 bottom-4 w-[clamp(300px,28vw,360px)]
        flex flex-col rounded-[48px] border
        bg-[#1a1a1e]/70 backdrop-blur-[28px] border-white/[0.08]
        shadow-[0_8px_40px_rgba(0,0,0,0.6)]
        transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]
        ${!isOpen ? '-translate-x-[105%] opacity-0 scale-95' : 'translate-x-0 opacity-100 scale-100'}
      `}
    >
      <SidebarContent
        models={models}
        activeId={activeId}
        onSelectModel={onSelectModel}
        onUpload={onUpload}
        uploadError={uploadError}
        onClearError={onClearError}
        clock={clock}
        setIsOpen={setIsOpen}
      />
    </aside>
  );
}
