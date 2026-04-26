import { useState, useRef, useEffect, useCallback } from 'react';
import { createWorker } from '@/lib/worker';

export type LoadPhase = 'downloading' | 'holding' | 'ready';

interface SplatLoaderOptions {
  source: string | File | null;
  onTextureUpdate: (data: { texdata: Uint32Array; texwidth: number; texheight: number; vertexCount: number }) => void;
  onDepthUpdate: (depthIndex: Uint32Array, vertexCount: number) => void;
  onBoundsUpdate: (bounds: { center: [number, number, number], maxDist: number }) => void;
}

export function useSplatLoader({ source, onTextureUpdate, onDepthUpdate, onBoundsUpdate }: SplatLoaderOptions) {
  // Guard: no-op when source is null
  const hasSource = source !== null && (typeof source !== 'string' || source.length > 0);
  const [phase, setPhase] = useState<LoadPhase>('downloading');
  const [progress, setProgress] = useState(0);
  const [vertexCount, setVertexCount] = useState(0);
  const [totalSplats, setTotalSplats] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const isLoadedRef = useRef(false);
  const lastUiUpdateRef = useRef(0);

  const callbacksRef = useRef({ onTextureUpdate, onDepthUpdate, onBoundsUpdate });
  callbacksRef.current = { onTextureUpdate, onDepthUpdate, onBoundsUpdate };

  // Reset when source changes
  useEffect(() => {
    setSourceKey(k => k + 1);
    isLoadedRef.current = false;
    setError(null);
    setProgress(0);
    setVertexCount(0);
    setTotalSplats(0);
    setPhase('downloading');
  }, [source]);

  // Initialize Worker
  useEffect(() => {
    const worker = new Worker(
      URL.createObjectURL(
        new Blob(['(', createWorker.toString(), ')(self)'], {
          type: 'application/javascript',
        }),
      ),
    );

    worker.onmessage = (e) => {
      const { texdata, depthIndex, vertexCount: vc, bounds } = e.data;

      if (vc !== undefined) {
        const now = performance.now();
        const isFinal = vc >= totalSplats && totalSplats > 0;
        if (now - lastUiUpdateRef.current > 100 || isFinal) {
          setVertexCount(prev => {
            if (prev === vc) return prev;
            return vc;
          });
          lastUiUpdateRef.current = now;
        }
      }

      if (texdata) {
        callbacksRef.current.onTextureUpdate({ texdata, texwidth: e.data.texwidth, texheight: e.data.texheight, vertexCount: vc });
      }

      if (depthIndex) {
        callbacksRef.current.onDepthUpdate(depthIndex, vc);
      }

      if (bounds) {
        callbacksRef.current.onBoundsUpdate(bounds);
      }
    };

    workerRef.current = worker;
    isLoadedRef.current = false;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [sourceKey, totalSplats]);

  // Load Model
  useEffect(() => {
    if (!workerRef.current || isLoadedRef.current || !hasSource) return;

    const load = async () => {
      try {
        const rowLength = 32;
        let dataBuffer: Uint8Array;
        let contentLength: number;

        if (typeof source === 'string') {
          const response = await fetch(source, { mode: 'cors' });
          if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load splat`);

          const reader = response.body?.getReader();
          if (!reader) throw new Error('Response body not readable');

          contentLength = parseInt(response.headers.get('content-length') || '0');
          dataBuffer = new Uint8Array(contentLength);
          let bytesRead = 0;
          let lastReportedVertexCount = 0;

          while (true) {
            const { done, value } = await reader.read();

            if (value) {
              dataBuffer.set(value, bytesRead);
              bytesRead += value.length;
              const currentVC = Math.floor(bytesRead / rowLength);

              if (currentVC > lastReportedVertexCount + 5000) {
                const chunk = dataBuffer.slice(0, currentVC * rowLength).buffer;
                workerRef.current?.postMessage({ buffer: chunk, vertexCount: currentVC }, [chunk]);
                lastReportedVertexCount = currentVC;
                setProgress(Math.round((bytesRead / contentLength) * 100));
              }
            }

            if (done) {
              const currentVC = Math.floor(bytesRead / rowLength);
              if (currentVC > lastReportedVertexCount) {
                const chunk = dataBuffer.slice(0, currentVC * rowLength).buffer;
                workerRef.current?.postMessage({ buffer: chunk, vertexCount: currentVC }, [chunk]);
              }
              break;
            }
          }
        } else {
          // Local File
          const arrayBuffer = await source.arrayBuffer();
          dataBuffer = new Uint8Array(arrayBuffer);
          contentLength = dataBuffer.byteLength;
          const total = Math.floor(contentLength / rowLength);
          setTotalSplats(total);

          // Stream chunks to worker for consistent UX and to avoid blocking
          let offset = 0;
          const chunkSize = 5000 * rowLength;
          while (offset < dataBuffer.byteLength) {
            const end = Math.min(offset + chunkSize, dataBuffer.byteLength);
            const slice = dataBuffer.slice(0, end);
            const chunk = slice.buffer;
            const currentVC = Math.floor(end / rowLength);
            workerRef.current?.postMessage({ buffer: chunk, vertexCount: currentVC }, [chunk]);
            offset = end;
            setProgress(Math.round((end / contentLength) * 100));
            // Yield to event loop
            await new Promise(r => setTimeout(r, 0));
          }
        }

        isLoadedRef.current = true;
        const finalVC = Math.floor(contentLength / rowLength);
        setTotalSplats(finalVC);
        setVertexCount(finalVC);
        setPhase('ready');
        setProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown loading error');
      }
    };

    load();
  }, [sourceKey, source]);

  const sendViewToSort = useCallback((viewProj: number[], force = false) => {
    workerRef.current?.postMessage({ view: viewProj, force });
  }, []);

  return { phase, progress, vertexCount, totalSplats, error, sendViewToSort };
}
