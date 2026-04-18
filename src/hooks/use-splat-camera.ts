import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  getProjectionMatrix, 
  invert4, 
  rotate4, 
  translate4,
  multiply4 
} from '@/lib/math';

interface CameraState {
  viewMatrix: number[];
  projectionMatrix: number[];
  viewProjMatrix: number[];
}

const DEFAULT_VIEW = [
  0.47, 0.04, 0.88, 0, 
  -0.11, 0.99, 0.02, 0, 
  -0.88, -0.11, 0.47, 0, 
  0.07, 0.03, 6.55, 1,
];

export function useSplatCamera(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [matrices, setMatrices] = useState<CameraState>({
    viewMatrix: DEFAULT_VIEW,
    projectionMatrix: [],
    viewProjMatrix: [],
  });

  const viewMatrixRef = useRef(DEFAULT_VIEW);
  const projectionMatrixRef = useRef<number[]>([]);
  const activeKeysRef = useRef<Set<string>>(new Set());
  const mouseStateRef = useRef({ down: 0, lastX: 0, lastY: 0 });

  // Handle Resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);

    // Default focal lengths if no camera data provided yet
    const fx = 1159, fy = 1164; 
    const proj = getProjectionMatrix(fx, fy, width, height);
    projectionMatrixRef.current = proj;
    
    setMatrices(prev => ({
      ...prev,
      projectionMatrix: proj,
      viewProjMatrix: multiply4(proj, viewMatrixRef.current),
    }));
  }, [canvasRef]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Input Handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onKeyDown = (e: KeyboardEvent) => activeKeysRef.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => activeKeysRef.current.delete(e.code);
    const onBlur = () => activeKeysRef.current.clear();

    const onMouseDown = (e: MouseEvent) => {
      mouseStateRef.current.down = e.button === 0 ? (e.ctrlKey || e.metaKey ? 2 : 1) : 2;
      mouseStateRef.current.lastX = e.clientX;
      mouseStateRef.current.lastY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const { down, lastX, lastY } = mouseStateRef.current;
      if (down === 0) return;

      const dx = (e.clientX - lastX) / window.innerWidth;
      const dy = (e.clientY - lastY) / window.innerHeight;
      
      let inv = invert4(viewMatrixRef.current);
      if (!inv) return;

      if (down === 1) { // Rotate
        inv = translate4(inv, 0, 0, 4);
        inv = rotate4(inv, 5 * dx, 0, 1, 0);
        inv = rotate4(inv, -5 * dy, 1, 0, 0);
        inv = translate4(inv, 0, 0, -4);
      } else { // Pan/Zoom
        inv = translate4(inv, -10 * dx, 0, 10 * dy);
      }

      const nextView = invert4(inv);
      if (nextView) viewMatrixRef.current = nextView;
      
      mouseStateRef.current.lastX = e.clientX;
      mouseStateRef.current.lastY = e.clientY;
    };

    const onMouseUp = () => mouseStateRef.current.down = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      let inv = invert4(viewMatrixRef.current);
      if (!inv) return;
      
      if (e.shiftKey) {
        inv = translate4(inv, e.deltaX / 500, e.deltaY / 500, 0);
      } else {
        inv = translate4(inv, 0, 0, -e.deltaY / 200);
      }

      const nextView = invert4(inv);
      if (nextView) viewMatrixRef.current = nextView;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel as any, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      // @ts-ignore
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvasRef]);

  // Movement update function
  const updateMovement = useCallback((carouselVisible: boolean) => {
    const keys = activeKeysRef.current;
    
    if (carouselVisible) {
      const t = performance.now() / 3000;
      let inv = invert4(DEFAULT_VIEW);
      if (inv) {
        inv = translate4(inv, 2.5 * Math.sin(t), 0, 6 * (1 - Math.cos(t / 2)));
        inv = rotate4(inv, -0.6 * Math.sin(t), 0, 1, 0);
        const nextView = invert4(inv);
        if (nextView) viewMatrixRef.current = nextView;
        return true;
      }
    }

    if (keys.size === 0) return false;
    let inv = invert4(viewMatrixRef.current);
    if (!inv) return false;

    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.1 : 0.03;
    
    if (keys.has('KeyW') || keys.has('ArrowUp')) inv = translate4(inv, 0, 0, speed);
    if (keys.has('KeyS') || keys.has('ArrowDown')) inv = translate4(inv, 0, 0, -speed);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) inv = translate4(inv, -speed, 0, 0);
    if (keys.has('KeyD') || keys.has('ArrowRight')) inv = translate4(inv, speed, 0, 0);
    if (keys.has('KeyE')) inv = translate4(inv, 0, speed, 0);
    if (keys.has('KeyQ')) inv = translate4(inv, 0, -speed, 0);
    if (keys.has('KeyR')) {
      viewMatrixRef.current = DEFAULT_VIEW;
      return true;
    }

    const nextView = invert4(inv);
    if (nextView) {
      viewMatrixRef.current = nextView;
      return true;
    }
    return false;
  }, []);

  const resetCamera = useCallback(() => {
    viewMatrixRef.current = DEFAULT_VIEW;
  }, []);

  // Sync matrices to state
  const syncMatrices = useCallback(() => {
    const viewProj = multiply4(projectionMatrixRef.current, viewMatrixRef.current);
    setMatrices({
      viewMatrix: viewMatrixRef.current,
      projectionMatrix: projectionMatrixRef.current,
      viewProjMatrix: viewProj,
    });
    return viewProj;
  }, []);

  return { 
    matrices, 
    updateMovement, 
    syncMatrices, 
    resetCamera, 
    viewMatrixRef, 
    projectionMatrixRef 
  };
}
