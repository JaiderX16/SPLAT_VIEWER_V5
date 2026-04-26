import { useRef, useEffect, useState } from 'react';
import SidebarContent from './SidebarContent';
import { useClock } from '@/hooks/useClock';
import type { GalleryModel } from '@/hooks/useActiveScene';

const SNAP_DEFAULT = 55; // vh
const SNAP_EXPANDED = 90;
const SNAP_CLOSE_THRESHOLD = 35;
const SNAP_EXPAND_THRESHOLD = 70;

interface SidebarMobileProps {
  models?: GalleryModel[];
  activeId: string;
  onSelectModel: (model: GalleryModel) => void;
  onUpload: (file: File) => void;
  uploadError?: string | null;
  onClearError?: () => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

export default function SidebarMobile({
  models = [],
  activeId,
  onSelectModel,
  onUpload,
  uploadError,
  onClearError,
  isOpen,
  setIsOpen,
}: SidebarMobileProps) {
  const clock = useClock();
  const [isDragging, setIsDragging] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(SNAP_DEFAULT);

  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const currentHeightRef = useRef(SNAP_DEFAULT);

  // Restore height when reopened after drag-close
  useEffect(() => {
    if (isOpen && currentHeightRef.current < SNAP_CLOSE_THRESHOLD) {
      setSheetHeight(SNAP_DEFAULT);
      currentHeightRef.current = SNAP_DEFAULT;
    }
  }, [isOpen]);

  // Global drag handlers — attached only while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = startY.current - clientY;
      let newVh = ((startHeight.current + deltaY) / window.innerHeight) * 100;
      if (newVh > SNAP_EXPANDED) newVh = SNAP_EXPANDED + (newVh - SNAP_EXPANDED) * 0.2;

      if (Math.abs(newVh - currentHeightRef.current) < 0.5) return;
      currentHeightRef.current = newVh;
      setSheetHeight(newVh);
    };

    const handleEnd = () => {
      setIsDragging(false);
      const h = currentHeightRef.current;
      if (h > SNAP_EXPAND_THRESHOLD) {
        setSheetHeight(SNAP_EXPANDED);
        currentHeightRef.current = SNAP_EXPANDED;
      } else if (h < SNAP_CLOSE_THRESHOLD) {
        setIsOpen(false);
      } else {
        setSheetHeight(SNAP_DEFAULT);
        currentHeightRef.current = SNAP_DEFAULT;
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, setIsOpen]);

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startY.current = clientY;
    startHeight.current = sheetRef.current?.getBoundingClientRect().height ?? 0;
    setIsDragging(true);
  };

  return (
    <div
      ref={sheetRef}
      style={{ height: `${sheetHeight}vh`, transform: isOpen ? 'translateY(0)' : 'translateY(105%)' }}
      className={`fixed bottom-0 left-0 right-0 z-[20000] flex flex-col rounded-t-[48px] border-t border-white/[0.08] bg-[#1a1a1e]/80 backdrop-blur-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.6)] ${
        isDragging ? '' : 'transition-all duration-300 ease-out'
      }`}
      role="dialog"
      aria-modal="true"
    >
      {/* Drag handle */}
      <div
        className="pt-4 pb-1 px-6 shrink-0 cursor-grab active:cursor-grabbing"
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto hover:bg-white/30 transition-colors" />
      </div>

      <SidebarContent
        models={models}
        activeId={activeId}
        onSelectModel={onSelectModel}
        onUpload={onUpload}
        uploadError={uploadError}
        onClearError={onClearError}
        clock={clock}
        setIsOpen={setIsOpen}
        closeOnSelect
        compact
      />
    </div>
  );
}
