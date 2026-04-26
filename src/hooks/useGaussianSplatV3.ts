import { useEffect, useRef, useState, useCallback } from 'react';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const DURATION_P1 = 5000;
const DURATION_HOLD = 100;
const DURATION_P2 = 5000;
const TOTAL_DURATION = DURATION_P1 + DURATION_HOLD + DURATION_P2;
const POINT_CLOUD_EV = 0.6;

const GLSL_HEADER = `
    uniform float u_elapsedMs;
    uniform float u_p1Dur;
    uniform float u_holdDur;
    uniform float u_p2Dur;
    uniform float u_maxDist;

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

  material.vertexShader = material.vertexShader.replace(
    'vec2 basisVector1 = eigenVector1 * splatScale * min(sqrt8 * sqrt(eigenValue1)',
    `float _ev1 = mix(${POINT_CLOUD_EV.toFixed(1)}, eigenValue1, _p2FadeIn);
            float _ev2 = mix(${POINT_CLOUD_EV.toFixed(1)}, eigenValue2, _p2FadeIn);
            vec2 basisVector1 = eigenVector1 * splatScale * min(sqrt8 * sqrt(_ev1)`
  );
  material.vertexShader = material.vertexShader.replace(
    'vec2 basisVector2 = eigenVector2 * splatScale * min(sqrt8 * sqrt(eigenValue2)',
    'vec2 basisVector2 = eigenVector2 * splatScale * min(sqrt8 * sqrt(_ev2)'
  );

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
  loadSource: (source: string | File | null) => void;
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
      c.minPolarAngle = Math.PI * 0.10;
      c.maxPolarAngle = Math.PI * 0.82;
      c.minDistance = 5.0;
      c.maxDistance = 5.0;
      c.autoRotate = true;
      c.autoRotateSpeed = 4.0;
    }

    let isActive = true;

    viewer
      .addSplatScene(fileUrl, {
        showLoadingUI: false,
        progressiveLoad: false,
        format: GaussianSplats3D.SceneFormat.Splat,
      })
      .then(async () => {
        if (!isActive) return;
        if (progressInterval) clearInterval(progressInterval);
        setProgress(100);

        await new Promise((r) => setTimeout(r, 100));

        const splatMesh = viewer.getSplatMesh();
        const count = splatMesh?.getSplatCount?.() ?? 0;
        setVertexCount(count);
        setTotalSplats(count);

        // Intro zoom: 5.0 → 2.3 over 4s
        if (viewer.controls) {
          const introStart = performance.now();
          const introTick = () => {
            if (!viewer.controls) return;
            const t = Math.min((performance.now() - introStart) / 4000, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            const dist = 5.0 + (2.3 - 5.0) * ease;
            viewer.controls.minDistance = dist;
            viewer.controls.maxDistance = dist;
            if (t < 1) {
              requestAnimationFrame(introTick);
            } else {
              viewer.controls.minDistance = 0.5;
              viewer.controls.maxDistance = 20;
            }
          };
          requestAnimationFrame(introTick);
        }

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
        setError(err?.message || 'Error al cargar el modelo');
        if (isObjectUrl) {
          URL.revokeObjectURL(fileUrl);
        }
      })

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
  };
}
