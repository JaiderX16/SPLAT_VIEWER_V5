import { useEffect, useRef, useState, useCallback } from 'react';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

const DURATION_P1 = 5000;
const DURATION_HOLD = 100;
const DURATION_P2 = 5000;
const TOTAL_DURATION = DURATION_P1 + DURATION_HOLD + DURATION_P2;
// const POINT_CLOUD_EV = 1.0; // Use full eigenvalue for correct splat size

const GLSL_HEADER = `
    uniform float u_elapsedMs;
    uniform float u_p1Dur;
    uniform float u_holdDur;
    uniform float u_p2Dur;
    uniform float u_maxDist;
    uniform float u_globalScale;

    float _easeOut(float t) {
        return 1.0 - pow(max(0.0, 1.0 - t), 2.5);
    }
`;

function injectWaveReveal(material: any, maxRadius: number) {
  if (material.__waveInjected) return;

  const maxDist = maxRadius > 0 ? maxRadius : 10.0;

  material.uniforms.u_elapsedMs = { value: 0.0 };
  material.uniforms.u_p1Dur = { value: DURATION_P1 };
  material.uniforms.u_holdDur = { value: DURATION_HOLD };
  material.uniforms.u_p2Dur = { value: DURATION_P2 };
  material.uniforms.u_maxDist = { value: maxDist };
  // u_globalScale uniform is declared in GLSL_HEADER and set by caller

  material.vertexShader = material.vertexShader.replace(
    'uniform vec3 sceneCenter;',
    'uniform vec3 sceneCenter;\n' + GLSL_HEADER
  );

  material.vertexShader = material.vertexShader.replace(
    'vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);',
    `// ── Wave Reveal ──────────────────────────────────────────────────────────
            float _dist    = length(splatCenter - sceneCenter);

            float _p1T     = _easeOut(clamp(u_elapsedMs / u_p1Dur, 0.0, 1.0));
            float _p1WaveR = _p1T * 1.05 * u_maxDist;

            float _p2Raw   = clamp((u_elapsedMs - u_p1Dur - u_holdDur) / u_p2Dur, 0.0, 1.0);
            float _p2T     = _easeOut(_p2Raw);
            float _p2WaveR = _p2T * 1.05 * u_maxDist;

            float _rippleBand = max(u_maxDist * 0.05, 0.15);
            float _growBand   = max(u_maxDist * 0.18, 0.60);

            float _p1Visible = clamp((_p1WaveR - _dist) / _rippleBand, 0.0, 1.0);
            float _p2FadeIn  = clamp((_p2WaveR - _dist) / _growBand,   0.0, 1.0);

            float _p1Ripple  = max(0.0, 1.0 - abs(_dist - _p1WaveR) / _rippleBand);
            float _p2Ripple  = max(0.0, 1.0 - abs(_dist - _p2WaveR) / _growBand);
            float _rippleGlow = max(_p1Ripple * 0.85, _p2Ripple * 0.75);
            // ─────────────────────────────────────────────────────────────────
            vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);`
  );

  // Basis vectors are left unchanged so splats render at their original size

  const lastBrace = material.vertexShader.lastIndexOf('}');
  material.vertexShader =
    material.vertexShader.slice(0, lastBrace) +
    `\n            // Wave reveal
            vColor.a *= _p1Visible;\n        ` +
    material.vertexShader.slice(lastBrace);

  material.needsUpdate = true;
  material.__waveInjected = true;
}

function runWaveAnimation(splatMesh: any, onComplete?: () => void, onProgress?: (p: number) => void) {
  const material = splatMesh.material;
  const uniforms = material.uniforms;
  injectWaveReveal(material, splatMesh.maxSplatDistanceFromSceneCenter || 10);

  uniforms.u_elapsedMs.value = 0;
  uniforms.splatScale.value = 1.0;
  uniforms.pointCloudModeEnabled.value = 0;
  material.uniformsNeedUpdate = true;

  const startTime = performance.now();
  let rafId: number | null = null;

  function tick() {
    const elapsed = performance.now() - startTime;
    const done = elapsed >= TOTAL_DURATION;
    uniforms.u_elapsedMs.value = done ? TOTAL_DURATION : elapsed;
    material.uniformsNeedUpdate = true;
    if (onProgress) onProgress(Math.min(elapsed / TOTAL_DURATION, 1));
    if (!done) {
      rafId = requestAnimationFrame(tick);
    } else if (onComplete) {
      onComplete();
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

interface UseGaussianSplatV3Return {
  containerRef: React.RefObject<HTMLDivElement | null>;
  phase: 'downloading' | 'holding' | 'ready';
  progress: number;
  fps: number;
  error: string | null;
  vertexCount: number;
  totalSplats: number;
  carousel: boolean;
  setCarousel: (value: boolean) => void;
  loadSource: (source: string | File | null) => (() => void) | void;
  splatScale: number;
  setSplatScale: (value: number) => void;
  modelScale: number;
  setModelScale: (value: number) => void;
}

export function useGaussianSplatV3(): UseGaussianSplatV3Return {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<'downloading' | 'holding' | 'ready'>('downloading');
  const [progress, setProgress] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [totalSplats, setTotalSplats] = useState(0);
  const [carousel, setCarousel] = useState(false);
  const [splatScale, setSplatScale] = useState(1);
  const [modelScale, setModelScale] = useState(1);

  const sourceRef = useRef<string | File | null>(null);
  const carouselRef = useRef(carousel);
  const lastFrameRef = useRef(0);
  const avgFpsRef = useRef(0);

  useEffect(() => {
    carouselRef.current = carousel;
  }, [carousel]);

  const cleanup = useCallback(() => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
    if (viewerRef.current) {
      try {
        const c = viewerRef.current.controls;
        if (c && (c as any).__stopAutoRotate) {
          c.removeEventListener('start', (c as any).__stopAutoRotate);
        }
      } catch (_) {}
      try {
        const p = viewerRef.current.dispose();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
      viewerRef.current = null;
    }
  }, []);

  const loadSource = useCallback((source: string | File | null) => {
    cleanup();
    sourceRef.current = source;

    if (!source || !containerRef.current) return;

    setPhase('downloading');
    setProgress(0);
    setFps(0);
    setError(null);
    setVertexCount(0);
    setTotalSplats(0);

    const container = containerRef.current;

    let fileUrl: string;
    let isObjectUrl = false;

    if (typeof source === 'string') {
      fileUrl = source;
    } else {
      fileUrl = URL.createObjectURL(source);
      isObjectUrl = true;
    }

    const viewer = new GaussianSplats3D.Viewer({
      cameraUp: [0, -1, 0],
      initialCameraPosition: [0, -2.4, 4.4],
      initialCameraLookAt: [0, 0, 0],
      rootElement: container,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
      sharedMemoryForWorkers: false,
    });

    // Force pure black background so stray edge splats don't tint the screen
    if (viewer.renderer) {
      viewer.renderer.setClearColor(0x000000, 1);
    }

    viewerRef.current = viewer;

    // For local files we can't easily track download progress, so we fake it
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    if (isObjectUrl) {
      setProgress(0);
      let fakeProgress = 0;
      progressInterval = setInterval(() => {
        fakeProgress += Math.random() * 15;
        if (fakeProgress >= 95) {
          fakeProgress = 95;
          if (progressInterval) clearInterval(progressInterval);
        }
        setProgress(Math.round(fakeProgress));
      }, 300);
    }

    viewer.start();

    if (viewer.controls) {
      const c = viewer.controls;
      c.enableDamping = true;
      c.dampingFactor = 0.04;
      c.enableZoom = true;
      c.zoomSpeed = 1.2;
      c.enableRotate = true;
      c.rotateSpeed = 1.0;
      c.enablePan = true;
      c.panSpeed = 0.8;
      c.screenSpacePanning = true;
      c.minPolarAngle = Math.PI * 0.10;
      c.maxPolarAngle = Math.PI * 0.82;
      c.minDistance = 0.1;
      c.maxDistance = 100;
      c.autoRotate = true;
      c.autoRotateSpeed = 2.0;
      const stopAutoRotate = () => { c.autoRotate = false; };
      c.addEventListener('start', stopAutoRotate);
      (c as any).__stopAutoRotate = stopAutoRotate;
    }

    let isActive = true;

    (async () => {
      // Abort if this viewer was disposed while awaiting (e.g. StrictMode remount)
      if (!isActive || viewerRef.current !== viewer) return;

      const tryLoad = async () => {
        try {
          await viewer.addSplatScene(fileUrl, {
            showLoadingUI: false,
            progressiveLoad: true,
            format: GaussianSplats3D.SceneFormat.Splat,
          });
        } catch (err: any) {
          if (err?.message?.includes('does not support progressive loading')) {
            await viewer.addSplatScene(fileUrl, {
              showLoadingUI: false,
              progressiveLoad: false,
              format: GaussianSplats3D.SceneFormat.Splat,
            });
          } else {
            throw err;
          }
        }
      };

      tryLoad()
        .then(async () => {
          if (!isActive) return;
          if (progressInterval) clearInterval(progressInterval);
          setProgress(100);

          await new Promise((r) => setTimeout(r, 100));

          const splatMesh = viewer.getSplatMesh();
          const count = splatMesh?.getSplatCount?.() ?? 0;
          setVertexCount(count);
          setTotalSplats(count);

          const center = splatMesh?.sceneCenter || new THREE.Vector3(0, 0, 0);
          const radius = splatMesh?.maxSplatDistanceFromSceneCenter || 10;

          if (viewer.controls) {
            viewer.controls.target.copy(center);
            const camDist = Math.max(radius * 2, 1.5);
            viewer.controls.minDistance = camDist * 0.5;
            viewer.controls.maxDistance = camDist * 3;
            const camPos = new THREE.Vector3().copy(center).add(new THREE.Vector3(0, 0, camDist));
            viewer.camera.position.copy(camPos);
            viewer.controls.update();
          }
          // Set global scale uniform (inverse of radius)
          const mat = splatMesh.material;
          mat.uniforms.u_globalScale = { value: Math.max(0.1, 1 / radius) };

          // Controls are ready for full interaction

          if (splatMesh?.material?.uniforms) {
            setPhase('holding');
            cancelAnimRef.current = runWaveAnimation(
              splatMesh,
              () => { if (isActive) setPhase('ready'); },
              (p) => { if (isActive) setProgress(Math.round(p * 100)); }
            );
          }
          if (isObjectUrl) {
            URL.revokeObjectURL(fileUrl);
          }
        })
        .catch((err: any) => {
          if (!isActive) return;
          if (progressInterval) clearInterval(progressInterval);
          console.error('Error loading splat scene:', err);
          // Ignore aborted-load errors caused by React StrictMode remounts
          if (err?.name === 'AbortedPromiseError' || err?.message?.includes('Scene disposed')) {
            return;
          }
          setError(err?.message || 'Error al cargar el modelo');
          if (isObjectUrl) {
            URL.revokeObjectURL(fileUrl);
          }
        });
    })();

    // FPS loop
    const fpsLoop = (now: number) => {
      const frameTime = now - lastFrameRef.current;
      const currentFps = frameTime > 0 ? 1000 / frameTime : 0;
      avgFpsRef.current = avgFpsRef.current * 0.9 + currentFps * 0.1;
      if (now % 500 < 20) {
        setFps(Math.round(avgFpsRef.current));
      }
      lastFrameRef.current = now;
      requestAnimationFrame(fpsLoop);
    };
    const fpsRaf = requestAnimationFrame(fpsLoop);

    // Carousel
    const carouselLoop = () => {
      if (carouselRef.current && viewerRef.current?.controls) {
        // auto-rotate is handled by OrbitControls when enabled
      }
      requestAnimationFrame(carouselLoop);
    };
    const carouselRaf = requestAnimationFrame(carouselLoop);

    return () => {
      isActive = false;
      cancelAnimationFrame(fpsRaf);
      cancelAnimationFrame(carouselRaf);
      if (progressInterval) clearInterval(progressInterval);
      if (isObjectUrl) URL.revokeObjectURL(fileUrl);
      cleanup();
    };
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
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
    splatScale,
    setSplatScale,
    modelScale,
    setModelScale,
  };
}
