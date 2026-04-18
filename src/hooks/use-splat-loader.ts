import { useState, useRef, useEffect, useCallback } from 'react';
import { createWorker } from '@/lib/worker';

export type LoadPhase = 'downloading' | 'holding' | 'ready';

interface SplatLoaderOptions {
  url: string;
  onTextureUpdate: (data: { texdata: Uint32Array; texwidth: number; texheight: number; vertexCount: number }) => void;
  onDepthUpdate: (depthIndex: Uint32Array, vertexCount: number) => void;
  onBoundsUpdate: (bounds: { center: [number, number, number], maxDist: number }) => void;
}

export function useSplatLoader({ url, onTextureUpdate, onDepthUpdate, onBoundsUpdate }: SplatLoaderOptions) {
  const [phase, setPhase] = useState<LoadPhase>('downloading');
  const [progress, setProgress] = useState(0);
  const [vertexCount, setVertexCount] = useState(0);
  const [totalSplats, setTotalSplats] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const isLoadedRef = useRef(false);
  const lastUiUpdateRef = useRef(0);

  const callbacksRef = useRef({ onTextureUpdate, onDepthUpdate, onBoundsUpdate });
  callbacksRef.current = { onTextureUpdate, onDepthUpdate, onBoundsUpdate };

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
        // Throttled UI update for vertex count
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
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []); // Truly stable worker

  // Load Model
  useEffect(() => {
    if (!workerRef.current || isLoadedRef.current) return;
    
    const load = async () => {
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load splat`);
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body not readable');

        const contentLength = parseInt(response.headers.get('content-length') || '0');
        const rowLength = 32;
        const total = Math.floor(contentLength / rowLength);
        setTotalSplats(total);

        const dataBuffer = new Uint8Array(contentLength);
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

        isLoadedRef.current = true;
        const finalVC = Math.floor(bytesRead / rowLength);
        setTotalSplats(finalVC); // Correct for GZIP/Brotli mismatch
        setVertexCount(finalVC);
        setPhase('ready');
        setProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown loading error');
      }
    };

    load();
  }, [url]);

  const sendViewToSort = useCallback((viewProj: number[], force = false) => {
    workerRef.current?.postMessage({ view: viewProj, force });
  }, []);

  return { phase, progress, vertexCount, totalSplats, error, sendViewToSort };
}
