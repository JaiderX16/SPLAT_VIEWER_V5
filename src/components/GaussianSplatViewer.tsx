import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSplatLoader } from '@/hooks/use-splat-loader';
import { useSplatCamera } from '@/hooks/use-splat-camera';
import { useSplatRenderer } from '@/hooks/use-splat-renderer';
import { ViewerHUD } from './ViewerHUD';
import { ANIMATION } from '@/lib/shaders';

const MODEL_URL = 'https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat';

export function GaussianSplatViewer() {
  // 1. All Hooks & Refs at the top for consistency
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState(0);
  const [carousel, setCarousel] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'revealing' | 'ready' | 'downloading'>('downloading');
  const [revealProgress, setRevealProgress] = useState(0);

  // Animation & Rendering State Refs
  const phaseRef = useRef<'idle' | 'revealing' | 'ready'>('idle');
  const revealStartTimeRef = useRef(0);
  const sceneBoundsRef = useRef({ center: [0, 0, 0] as [number, number, number], maxDist: 10 });
  const lastFpsUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const rendererInstanceRef = useRef<any>(null);
  const rendererDataRef = useRef<any>({ uniforms: {}, vertexCount: 0 });

  // 2. Stable Callbacks (using refs to avoid circular dependencies)
  const onTextureUpdate = useCallback(({ texdata, texwidth, texheight }: any) => {
    rendererInstanceRef.current?.updateTexture(texdata, texwidth, texheight);
  }, []);

  const onDepthUpdate = useCallback((depthIndex: Uint32Array) => {
    rendererInstanceRef.current?.updateDepthIndex(depthIndex);
  }, []);

  const onBoundsUpdate = useCallback((bounds: any) => {
    sceneBoundsRef.current = bounds;
  }, []);

  // 3. Service Hooks
  const loader = useSplatLoader({
    url: MODEL_URL,
    onTextureUpdate,
    onDepthUpdate,
    onBoundsUpdate
  });
  const { phase: loadPhase, progress: loadProgress, vertexCount, totalSplats, error, sendViewToSort } = loader;

  const camera = useSplatCamera(canvasRef);
  const { syncMatrices, updateMovement } = camera;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Handle Phase Transitions - Fluid (Network based)
  const isActuallyReady = loadPhase === 'ready' && vertexCount > 0;

  useEffect(() => {
    // Start revealing ONLY when download is fully complete and processed in GPU
    if (isActuallyReady && phaseRef.current === 'idle') {
      console.log('--- STARTING REVEAL ---');
      phaseRef.current = 'revealing';
      setAnimationPhase('revealing');
      revealStartTimeRef.current = performance.now();
    }
  }, [isActuallyReady]);

  // Keep state in refs for the stable render loop
  const stateRef = useRef({ carousel, vertexCount, loadPhase, animationPhase, totalSplats });
  stateRef.current = { carousel, vertexCount, loadPhase, animationPhase, totalSplats };

  // 3. Stable Render Loop Callback
  const onFrame = useCallback((now: number) => {
    const gl = rendererInstanceRef.current?.gl;
    const program = rendererInstanceRef.current?.program;
    const { carousel: curCarousel, vertexCount: curVC, loadPhase: curLoadPhase } = stateRef.current;
    
    // Use refs for matrices to keep this function stable
    const viewMat = cameraRef.current.viewMatrixRef.current;
    const projMat = cameraRef.current.projectionMatrixRef.current;

    if (!gl || !program || !projMat.length || curVC === 0) return;

      // Update Movement
      const moved = updateMovement(curCarousel);
      
      // Update Matrices
      const viewProj = syncMatrices();
      
      // Update Sorting if moved
      if (moved || frameCountRef.current % 10 === 0) {
        sendViewToSort(viewProj);
      }

      const TOTAL_DURATION = ANIMATION.DURATION_P1 + ANIMATION.DURATION_HOLD + ANIMATION.DURATION_P2;

      // Animation calculations
      let elapsed = TOTAL_DURATION;

      if (phaseRef.current === 'revealing') {
        elapsed = (now - revealStartTimeRef.current);
        
        if (elapsed >= TOTAL_DURATION) {
          elapsed = TOTAL_DURATION;
          phaseRef.current = 'ready';
          setAnimationPhase('ready');
        }
      } else if (phaseRef.current === 'idle' || (phaseRef.current === 'downloading' && !isActuallyReady)) {
        elapsed = 0.0;
      }

      const drawCount = rendererInstanceRef.current?.currentVertexCountRef?.current || 0;
      if (drawCount === 0) return;

      // Set Uniforms
      const u = rendererDataRef.current.uniforms;
      if (!u.projection) return; // Wait for uniforms to be cached

      gl.useProgram(program);
      gl.uniformMatrix4fv(u.projection, false, projMat);
      gl.uniformMatrix4fv(u.view, false, viewMat);
      
      // V3 Uniforms
      gl.uniform1f(u.u_elapsedMs, elapsed);
      gl.uniform1f(u.u_p1Dur, ANIMATION.DURATION_P1);
      gl.uniform1f(u.u_holdDur, ANIMATION.DURATION_HOLD);
      gl.uniform1f(u.u_p2Dur, ANIMATION.DURATION_P2);
      gl.uniform1f(u.u_showEverything, (phaseRef.current === 'downloading' || (phaseRef.current === 'idle' && !isActuallyReady)) ? 1.0 : 0.0);
      
      gl.uniform1f(u.u_maxDist, sceneBoundsRef.current.maxDist);
      gl.uniform3fv(u.u_sceneCenter, sceneBoundsRef.current.center);
      
      // Resolution uniforms
      gl.uniform2f(u.focal, 1159, 1164); 
      gl.uniform2f(u.viewport, gl.canvas.width, gl.canvas.height);

      // Draw
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, drawCount);

      // FPS Calculation
      frameCountRef.current++;
      if (now - lastFpsUpdateRef.current > 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
  }, [updateMovement, syncMatrices, sendViewToSort]);

  // 3. Renderer Hook
  const renderer = useSplatRenderer({
    canvasRef,
    onFrame
  });

  // Final State Sync
  rendererDataRef.current.uniforms = renderer.uniforms;
  rendererDataRef.current.vertexCount = vertexCount;

  // Order of effects matters for Hook Order consistency! Keep them grouped.
  useEffect(() => {
    rendererInstanceRef.current = renderer;
  }, [renderer]);

  if (error) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white p-10 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl backdrop-blur-xl">
           <h2 className="text-2xl font-bold text-red-400 mb-2">Renderer Error</h2>
           <p className="text-white/60 text-sm max-w-md">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block touch-none cursor-move"
      />
      
      <ViewerHUD
        phase={animationPhase === 'revealing' ? 'holding' : (phaseRef.current === 'ready' ? 'ready' : 'downloading')}
        progress={phaseRef.current === 'ready' || animationPhase === 'revealing' || isActuallyReady ? 100 : Math.round((vertexCount / (totalSplats || 1)) * 100)}
        vertexCount={vertexCount}
        totalSplats={totalSplats}
        fps={fps}
        carousel={carousel}
        setCarousel={setCarousel}
        error={error}
      />

      {/* Subtle Overlay effects */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
