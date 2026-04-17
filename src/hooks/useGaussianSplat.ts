import { useEffect, useRef, useState, useCallback } from 'react';
import type { Camera } from '@/types';
import { 
  getProjectionMatrix, 
  multiply4, 
  invert4, 
  rotate4, 
  translate4 
} from '@/lib/math';
import { createWorker } from '@/lib/worker';
import { vertexShaderSource, fragmentShaderSource, ANIMATION } from '@/lib/shaders';

const defaultCameras: Camera[] = [
  {
    id: 0,
    img_name: "00001",
    width: 1959,
    height: 1090,
    position: [-3.0089893469241797, -0.11086489695181866, -3.7527640949141428],
    rotation: [
      [0.876134201218856, 0.06925962026449776, 0.47706599800804744],
      [-0.04747421839895102, 0.9972110940209488, -0.057586739349882114],
      [-0.4797239414934443, 0.027805376500959853, 0.8769787916452908],
    ],
    fy: 1164.6601287484507,
    fx: 1159.5880733038064,
  },
];

const defaultViewMatrix: number[] = [
  0.47, 0.04, 0.88, 0, -0.11, 0.99, 0.02, 0, -0.88, -0.11, 0.47, 0, 0.07,
  0.03, 6.55, 1,
];

// Animation states - merged: revealing now includes the final correct render
type AnimationPhase = 'downloading' | 'hold' | 'revealing';

interface UseGaussianSplatReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isLoading: boolean;
  error: string | null;
  fps: number;
  vertexCount: number;
  totalSplats: number;
  animationPhase: AnimationPhase;
  animationProgress: number;
  carousel: boolean;
  setCarousel: (value: boolean) => void;
}

export function useGaussianSplat(): UseGaussianSplatReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [vertexCount, setVertexCount] = useState(0);
  const vertexCountRef = useRef(0);
  const [totalSplats, setTotalSplats] = useState(0);
  const totalSplatsRef = useRef(0);
  const downloadCompleteRef = useRef(false);
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('downloading');
  const [animationProgress, setAnimationProgress] = useState(0);
  const [carousel, setCarousel] = useState(false);

  // WebGL refs
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  // Camera and view refs
  const viewMatrixRef = useRef<number[]>(defaultViewMatrix);
  const projectionMatrixRef = useRef<number[]>([]);
  const cameraRef = useRef<Camera>(defaultCameras[0]);
  const activeKeysRef = useRef<string[]>([]);
  const carouselRef = useRef(carousel);
  const startTimeRef = useRef(Date.now() + 2000);
  
  // Animation refs
  const animationPhaseRef = useRef<AnimationPhase>('downloading');
  const phase1ProgressRef = useRef(0);
  const phase2ProgressRef = useRef(0);
  const phase2StartTimeRef = useRef<number | null>(null);
  const sceneCenterRef = useRef<[number, number, number]>([0, 0, 0]);
  const maxDistRef = useRef(100); 
  const animationProgressRef = useRef(0);
  
  // Performance refs
  const lastFrameRef = useRef(0);
  const avgFpsRef = useRef(0);
  const fpsUpdateRef = useRef(0);
  const lastViewProjRef = useRef<number[]>([]);
  const forceSortRef = useRef(false);
  const lastUiUpdateRef = useRef(0);
  const lastDownloadUiUpdateRef = useRef(0);
  const lastTexturedVertexCountRef = useRef(0);
  const frameIdRef = useRef<number | null>(null);
  
  // WebGL resource refs for cleanup
  const vertexBufferRef = useRef<WebGLBuffer | null>(null);
  const indexBufferRef = useRef<WebGLBuffer | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const resizeUniformsRef = useRef<{ focal: WebGLUniformLocation | null; viewport: WebGLUniformLocation | null; projection: WebGLUniformLocation | null } | null>(null);
  
  // Uniform locations ref
  const uniformsRef = useRef<{
    view: WebGLUniformLocation | null;
    phase1Progress: WebGLUniformLocation | null;
    phase2Progress: WebGLUniformLocation | null;
    maxDist: WebGLUniformLocation | null;
    sceneCenter: WebGLUniformLocation | null;
    isPhase2: WebGLUniformLocation | null;
  } | null>(null);

  useEffect(() => {
    carouselRef.current = carousel;
  }, [carousel]);

  useEffect(() => {
    animationPhaseRef.current = animationPhase;
  }, [animationPhase]);

  useEffect(() => {
    vertexCountRef.current = vertexCount;
  }, [vertexCount]);

  useEffect(() => {
    totalSplatsRef.current = totalSplats;
  }, [totalSplats]);

  const updateFps = useCallback((newFps: number) => {
    const now = Date.now();
    if (now - fpsUpdateRef.current > 500) {
      setFps(newFps);
      fpsUpdateRef.current = now;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL2
    const gl = canvas.getContext('webgl2', { 
      antialias: false,
      powerPreference: 'high-performance',
    });
    
    if (!gl) {
      setError('WebGL2 not supported. Please use a modern browser.');
      setIsLoading(false);
      return;
    }
    
    glRef.current = gl;

    // Create and compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      setError('Failed to create shaders');
      setIsLoading(false);
      return;
    }

    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
      setError('Vertex shader compilation failed');
      setIsLoading(false);
      return;
    }
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
      setError('Fragment shader compilation failed');
      setIsLoading(false);
      return;
    }

    // Create program
    const program = gl.createProgram();
    if (!program) {
      setError('Failed to create WebGL program');
      setIsLoading(false);
      return;
    }
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      setError('WebGL program linking failed');
      setIsLoading(false);
      return;
    }
    
    gl.useProgram(program);
    programRef.current = program;

    // Configure WebGL state
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE_MINUS_DST_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_DST_ALPHA,
      gl.ONE,
    );
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

    // Cache uniform locations
    uniformsRef.current = {
      view: gl.getUniformLocation(program, 'view'),
      phase1Progress: gl.getUniformLocation(program, 'u_phase1Progress'),
      phase2Progress: gl.getUniformLocation(program, 'u_phase2Progress'),
      maxDist: gl.getUniformLocation(program, 'u_maxDist'),
      sceneCenter: gl.getUniformLocation(program, 'u_sceneCenter'),
      isPhase2: gl.getUniformLocation(program, 'u_isPhase2'),
    };

    // Create worker
    const worker = new Worker(
      URL.createObjectURL(
        new Blob(['(', createWorker.toString(), ')(self)'], {
          type: 'application/javascript',
        }),
      ),
    );
    workerRef.current = worker;

    // Cache resize uniform locations once
    resizeUniformsRef.current = {
      focal: gl.getUniformLocation(program, 'focal'),
      viewport: gl.getUniformLocation(program, 'viewport'),
      projection: gl.getUniformLocation(program, 'projection'),
    };

    // Setup geometry buffers
    const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
    const vertexBuffer = gl.createBuffer();
    vertexBufferRef.current = vertexBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
    const a_position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    // Setup texture
    const texture = gl.createTexture();
    textureRef.current = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const u_textureLocation = gl.getUniformLocation(program, 'u_texture');
    gl.uniform1i(u_textureLocation, 0);

    // Setup index buffer
    const indexBuffer = gl.createBuffer();
    indexBufferRef.current = indexBuffer;
    const a_index = gl.getAttribLocation(program, 'index');
    gl.enableVertexAttribArray(a_index);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.vertexAttribIPointer(a_index, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(a_index, 1);

    // Handle worker messages
    worker.onmessage = (e) => {
      if (e.data.texdata) {
        const { texdata, texwidth, texheight, vertexCount: vc } = e.data;
        lastTexturedVertexCountRef.current = vc ?? vertexCountRef.current;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32UI,
          texwidth,
          texheight,
          0,
          gl.RGBA_INTEGER,
          gl.UNSIGNED_INT,
          texdata,
        );
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
      if (e.data.depthIndex) {
        const { depthIndex, vertexCount: vc } = e.data;
        gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
        // Throttle React state update for vertex count
        vertexCountRef.current = vc;
        const now = performance.now();
        if (now - lastDownloadUiUpdateRef.current > 200) {
          setVertexCount(vc);
          lastDownloadUiUpdateRef.current = now;
        }
      }
    };

    // Resize handler
    const resize = () => {
      const ru = resizeUniformsRef.current;
      if (!ru) return;

      gl.uniform2fv(ru.focal, new Float32Array([cameraRef.current.fx, cameraRef.current.fy]));

      projectionMatrixRef.current = getProjectionMatrix(
        cameraRef.current.fx,
        cameraRef.current.fy,
        window.innerWidth,
        window.innerHeight,
      );

      gl.uniform2fv(ru.viewport, new Float32Array([window.innerWidth, window.innerHeight]));

      canvas.width = Math.round(window.innerWidth);
      canvas.height = Math.round(window.innerHeight);
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.uniformMatrix4fv(ru.projection, false, projectionMatrixRef.current);
    };

    window.addEventListener('resize', resize);
    resize();

    // Calculate scene bounds from splat data (progressive - uses only loaded splats)
    const calculateSceneBounds = (splatData: Uint8Array, currentCount?: number) => {
      const f_buffer = new Float32Array(splatData.buffer);
      const numSplats = currentCount ?? Math.floor(splatData.length / 32);
      
      if (numSplats === 0) return;
      
      let cx = 0, cy = 0, cz = 0;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (let i = 0; i < numSplats; i++) {
        const x = f_buffer[8 * i + 0];
        const y = f_buffer[8 * i + 1];
        const z = f_buffer[8 * i + 2];
        cx += x;
        cy += y;
        cz += z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }

      cx /= numSplats;
      cy /= numSplats;
      cz /= numSplats;

      const maxDist = Math.sqrt(
        Math.pow(Math.max(maxX - cx, cx - minX), 2) +
        Math.pow(Math.max(maxY - cy, cy - minY), 2) +
        Math.pow(Math.max(maxZ - cz, cz - minZ), 2)
      );

      sceneCenterRef.current = [cx, cy, cz];
      maxDistRef.current = Math.max(maxDist * 1.2, 10); // Ensure minimum of 10
    };

    // Load model progressively
    const loadModel = async () => {
      try {
        const url = new URL(
          'train.splat',
          'https://huggingface.co/cakewalk/splat-data/resolve/main/',
        );
        const req = await fetch(url, {
          mode: 'cors',
          credentials: 'omit',
        });

        if (req.status !== 200) {
          throw new Error(`${req.status} Unable to load ${req.url}`);
        }

        const rowLength = 32;
        const reader = req.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        const contentLength = parseInt(req.headers.get('content-length') || '0');
        const splatData = new Uint8Array(contentLength);
        let bytesRead = 0;
        let lastVertexCount = -1;
        const totalVertexCount = Math.floor(contentLength / rowLength);
        setTotalSplats(totalVertexCount);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (value) {
            splatData.set(value, bytesRead);
            bytesRead += value.length;
          }
          
          const currentVertexCount = Math.floor(bytesRead / rowLength);
          
          if (currentVertexCount > lastVertexCount) {
            phase1ProgressRef.current = currentVertexCount / totalVertexCount;
            const downloadProgress = Math.round(phase1ProgressRef.current * 90);
            
            // Send only the valid slice to the worker (copies just the used bytes)
            worker.postMessage({
              buffer: splatData.slice(0, currentVertexCount * rowLength).buffer,
              vertexCount: currentVertexCount,
            });
            
            // Update scene bounds progressively (every 1000 splats or early on)
            if (currentVertexCount % 1000 === 0 || currentVertexCount < 1000) {
              calculateSceneBounds(splatData, currentVertexCount);
            }
            
            // Send view for depth sorting every 10 chunks during download
            if (currentVertexCount % 10 === 0 && projectionMatrixRef.current.length > 0) {
              const viewProj = multiply4(projectionMatrixRef.current, viewMatrixRef.current);
              worker.postMessage({ view: viewProj });
            }
            
            // Throttle React UI updates during download (~5fps)
            const now = performance.now();
            if (now - lastDownloadUiUpdateRef.current > 200) {
              setVertexCount(currentVertexCount);
              setAnimationProgress(downloadProgress);
              lastDownloadUiUpdateRef.current = now;
            }
            
            lastVertexCount = currentVertexCount;
            
            if (currentVertexCount > 0 && isLoading) {
              setIsLoading(false);
            }
          }
        }

        // Download complete
        downloadCompleteRef.current = true;
        calculateSceneBounds(splatData);
        
        // Send final view for depth sorting
        if (projectionMatrixRef.current.length > 0) {
          const viewProj = multiply4(projectionMatrixRef.current, viewMatrixRef.current);
          worker.postMessage({ view: viewProj });
        }
        
        phase1ProgressRef.current = 1.0;
        setAnimationProgress(90);
        setAnimationPhase('downloading'); // Keep showing "downloading" until all splats ready
        
        if (isLoading) setIsLoading(false);
      } catch (err) {
        console.error('Error loading model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
        if (isLoading) setIsLoading(false);
      }
    };

    loadModel();

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      carouselRef.current = false;
      setCarousel(false);
      if (!activeKeysRef.current.includes(e.code)) {
        activeKeysRef.current.push(e.code);
      }
      if (e.code === 'KeyP') {
        carouselRef.current = true;
        setCarousel(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      activeKeysRef.current = activeKeysRef.current.filter((k) => k !== e.code);
    };

    const handleBlur = () => {
      activeKeysRef.current = [];
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    // Mouse controls
    let startX = 0, startY = 0, down = 0;

    const handleMouseDown = (e: MouseEvent) => {
      carouselRef.current = false;
      setCarousel(false);
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      down = e.ctrlKey || e.metaKey ? 2 : 1;
    };

    const handleContextMenu = (e: MouseEvent) => {
      carouselRef.current = false;
      setCarousel(false);
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      down = 2;
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      if (down === 1) {
        const invResult = invert4(viewMatrixRef.current);
        if (!invResult) return;
        let inv = invResult;
        const dx = (5 * (e.clientX - startX)) / window.innerWidth;
        const dy = (5 * (e.clientY - startY)) / window.innerHeight;
        const d = 4;
        inv = translate4(inv, 0, 0, d);
        inv = rotate4(inv, dx, 0, 1, 0);
        inv = rotate4(inv, -dy, 1, 0, 0);
        inv = translate4(inv, 0, 0, -d);
        const newViewMatrix = invert4(inv);
        if (newViewMatrix) viewMatrixRef.current = newViewMatrix;
        startX = e.clientX;
        startY = e.clientY;
      } else if (down === 2) {
        const invResult = invert4(viewMatrixRef.current);
        if (!invResult) return;
        let inv = invResult;
        inv = translate4(inv, (-10 * (e.clientX - startX)) / window.innerWidth, 0, (10 * (e.clientY - startY)) / window.innerHeight);
        const newViewMatrix = invert4(inv);
        if (newViewMatrix) viewMatrixRef.current = newViewMatrix;
        startX = e.clientX;
        startY = e.clientY;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      down = 0;
      startX = 0;
      startY = 0;
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Touch controls
    let altX = 0, altY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        carouselRef.current = false;
        setCarousel(false);
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        down = 1;
      } else if (e.touches.length === 2) {
        carouselRef.current = false;
        setCarousel(false);
        startX = e.touches[0].clientX;
        altX = e.touches[1].clientX;
        startY = e.touches[0].clientY;
        altY = e.touches[1].clientY;
        down = 1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && down) {
        const invResult = invert4(viewMatrixRef.current);
        if (!invResult) return;
        let inv = invResult;
        const dx = (4 * (e.touches[0].clientX - startX)) / window.innerWidth;
        const dy = (4 * (e.touches[0].clientY - startY)) / window.innerHeight;
        const d = 4;
        inv = translate4(inv, 0, 0, d);
        inv = rotate4(inv, dx, 0, 1, 0);
        inv = rotate4(inv, -dy, 1, 0, 0);
        inv = translate4(inv, 0, 0, -d);
        const newViewMatrix = invert4(inv);
        if (newViewMatrix) viewMatrixRef.current = newViewMatrix;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const dtheta = Math.atan2(startY - altY, startX - altX) - Math.atan2(e.touches[0].clientY - e.touches[1].clientY, e.touches[0].clientX - e.touches[1].clientX);
        const dscale = Math.hypot(startX - altX, startY - altY) / Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const dx = (e.touches[0].clientX + e.touches[1].clientX - (startX + altX)) / 2;
        const dy = (e.touches[0].clientY + e.touches[1].clientY - (startY + altY)) / 2;
        const invResult = invert4(viewMatrixRef.current);
        if (!invResult) return;
        let inv = invResult;
        inv = rotate4(inv, dtheta, 0, 0, 1);
        inv = translate4(inv, -dx / window.innerWidth, -dy / window.innerHeight, 0);
        inv = translate4(inv, 0, 0, 3 * (1 - dscale));
        const newViewMatrix = invert4(inv);
        if (newViewMatrix) viewMatrixRef.current = newViewMatrix;
        startX = e.touches[0].clientX;
        altX = e.touches[1].clientX;
        startY = e.touches[0].clientY;
        altY = e.touches[1].clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      down = 0;
      startX = 0;
      startY = 0;
      altX = 0;
      altY = 0;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    const handleWheel = (e: WheelEvent) => {
      carouselRef.current = false;
      setCarousel(false);
      e.preventDefault();
      const lineHeight = 10;
      const scale = e.deltaMode === 1 ? lineHeight : e.deltaMode === 2 ? window.innerHeight : 1;
      const invResult = invert4(viewMatrixRef.current);
      if (!invResult) return;
      let inv = invResult;
      if (e.shiftKey) {
        inv = translate4(inv, (e.deltaX * scale) / window.innerWidth, (e.deltaY * scale) / window.innerHeight, 0);
      } else if (e.ctrlKey || e.metaKey) {
        inv = translate4(inv, 0, 0, (-10 * (e.deltaY * scale)) / window.innerHeight);
      } else {
        const d = 4;
        inv = translate4(inv, 0, 0, d);
        inv = rotate4(inv, -(e.deltaX * scale) / window.innerWidth, 0, 1, 0);
        inv = rotate4(inv, (e.deltaY * scale) / window.innerHeight, 1, 0, 0);
        inv = translate4(inv, 0, 0, -d);
      }
      const newViewMatrix = invert4(inv);
      if (newViewMatrix) viewMatrixRef.current = newViewMatrix;
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Animation loop
    const frame = (now: number) => {
      // ALWAYS schedule the next frame at the very beginning
      frameIdRef.current = requestAnimationFrame(frame);

      // Throttle UI updates to ~20fps (every 50ms) to avoid pegging React scheduler
      const shouldUpdateUi = now - lastUiUpdateRef.current > 50;
      if (shouldUpdateUi) {
        lastUiUpdateRef.current = now;
      }
      
      const gl = glRef.current;
      const program = programRef.current;
      const worker = workerRef.current;
      const uniforms = uniformsRef.current;
      
      if (!gl || !program || !worker || !uniforms) return;

      // Check if download complete and all splats processed -> start phase 2
      if (animationPhaseRef.current === 'downloading' && 
          downloadCompleteRef.current && 
          vertexCountRef.current >= totalSplatsRef.current && 
          totalSplatsRef.current > 0) {
        
        // Single trigger for phase transition
        setAnimationPhase('hold');
        animationPhaseRef.current = 'hold'; // Immediate ref update to prevent multiple triggers
        
        setTimeout(() => {
          setAnimationPhase('revealing');
          animationPhaseRef.current = 'revealing'; // Immediate ref update
          phase2StartTimeRef.current = performance.now();
          // Force an immediate depth sort so the model is correct from the start of the reveal
          forceSortRef.current = true;
          lastViewProjRef.current = [];
        }, ANIMATION.DURATION_HOLD);
      }

          // Update phase 2 progress
      if (animationPhaseRef.current === 'revealing' && phase2StartTimeRef.current) {
        const elapsed = performance.now() - phase2StartTimeRef.current;
        phase2ProgressRef.current = Math.min(elapsed / ANIMATION.DURATION_P2, 1);
        const unifiedProgress = 90 + Math.round(phase2ProgressRef.current * 10);
        
        // Update internal progress ref for shader and completion check
        animationProgressRef.current = unifiedProgress;
        
        // Sync UI state only if throttled and value changed
        if (shouldUpdateUi) {
          setAnimationProgress(unifiedProgress);
        }
      } else if (animationPhaseRef.current === 'hold' && shouldUpdateUi) {
        animationProgressRef.current = 90;
        setAnimationProgress(90);
      }

      // Update animation uniforms
      gl.uniform1f(uniforms.phase1Progress, phase1ProgressRef.current);
      gl.uniform1f(uniforms.phase2Progress, phase2ProgressRef.current);
      gl.uniform1f(uniforms.maxDist, maxDistRef.current);
      gl.uniform3fv(uniforms.sceneCenter, new Float32Array(sceneCenterRef.current));
      // isPhase2 is true during revealing (including when it completes)
      gl.uniform1f(uniforms.isPhase2, animationPhaseRef.current === 'revealing' ? 1.0 : 0.0);

      // Process camera movement
      const invResult = invert4(viewMatrixRef.current);
      if (!invResult) return;
      let inv = invResult;

      const shiftKey = activeKeysRef.current.includes('Shift') || activeKeysRef.current.includes('ShiftLeft') || activeKeysRef.current.includes('ShiftRight');
      
      if (activeKeysRef.current.includes('ArrowUp')) {
        if (shiftKey) inv = translate4(inv, 0, -0.03, 0);
        else inv = translate4(inv, 0, 0, 0.1);
      }
      if (activeKeysRef.current.includes('ArrowDown')) {
        if (shiftKey) inv = translate4(inv, 0, 0.03, 0);
        else inv = translate4(inv, 0, 0, -0.1);
      }
      if (activeKeysRef.current.includes('ArrowLeft')) inv = translate4(inv, -0.03, 0, 0);
      if (activeKeysRef.current.includes('ArrowRight')) inv = translate4(inv, 0.03, 0, 0);
      if (activeKeysRef.current.includes('KeyA')) inv = rotate4(inv, -0.01, 0, 1, 0);
      if (activeKeysRef.current.includes('KeyD')) inv = rotate4(inv, 0.01, 0, 1, 0);
      if (activeKeysRef.current.includes('KeyQ')) inv = rotate4(inv, 0.01, 0, 0, 1);
      if (activeKeysRef.current.includes('KeyE')) inv = rotate4(inv, -0.01, 0, 0, 1);
      if (activeKeysRef.current.includes('KeyW')) inv = rotate4(inv, 0.005, 1, 0, 0);
      if (activeKeysRef.current.includes('KeyS')) inv = rotate4(inv, -0.005, 1, 0, 0);

      const newViewMatrix = invert4(inv);
      if (newViewMatrix) viewMatrixRef.current = newViewMatrix;

      // Carousel animation
      if (carouselRef.current) {
        const defaultInv = invert4(defaultViewMatrix);
        if (defaultInv) {
          let carouselInv = defaultInv;
          const t = Math.sin((Date.now() - startTimeRef.current) / 5000);
          carouselInv = translate4(carouselInv, 2.5 * t, 0, 6 * (1 - Math.cos(t)));
          carouselInv = rotate4(carouselInv, -0.6 * t, 0, 1, 0);
          const carouselViewMatrix = invert4(carouselInv);
          if (carouselViewMatrix) viewMatrixRef.current = carouselViewMatrix;
        }
      }

      // Apply jump
      const isJumping = activeKeysRef.current.includes('Space');
      const jumpDelta = isJumping ? 0.5 : 0;

      const inv2Result = invert4(viewMatrixRef.current);
      if (inv2Result && projectionMatrixRef.current.length > 0) {
        let inv2 = inv2Result;
        inv2 = translate4(inv2, 0, -jumpDelta, 0);
        inv2 = rotate4(inv2, -0.1 * jumpDelta, 1, 0, 0);
        const actualViewMatrix = invert4(inv2);
        
        if (actualViewMatrix) {
          const viewProj = multiply4(projectionMatrixRef.current, actualViewMatrix);
          
          // Sorting strategy:
          // During revealing (unified phase), always sort by camera depth so the model is correct
          const isRevealing = animationPhaseRef.current === 'revealing';
          
          // Always update lastViewProj so we track camera changes
          const dot = lastViewProjRef.current.length > 0 
            ? lastViewProjRef.current[2] * viewProj[2] + lastViewProjRef.current[6] * viewProj[6] + lastViewProjRef.current[10] * viewProj[10]
            : 0;
          
          const viewChanged = lastViewProjRef.current.length === 0 || Math.abs(dot - 1) > 0.01;
          
          if (isRevealing) {
            const isRevealAnimationComplete = phase2ProgressRef.current >= 1.0;
            // Only sort:
            // 1) Once at the very start of revealing (force)
            // 2) After the reveal wave animation is finished and the camera moves
            const shouldSort = forceSortRef.current || (isRevealAnimationComplete && viewChanged);
            
            if (shouldSort) {
              const force = forceSortRef.current;
              worker.postMessage({ view: viewProj, force });
              lastViewProjRef.current = viewProj;
              if (forceSortRef.current) {
                forceSortRef.current = false;
              }
            }
          } else {
            // Not revealing yet: just track view changes
            if (viewChanged) {
              lastViewProjRef.current = viewProj;
            }
          }

          // Update FPS (throttled)
          if (shouldUpdateUi) {
            const frameTime = now - lastFrameRef.current;
            const currentFps = frameTime > 0 ? 1000 / frameTime : 0;
            avgFpsRef.current = avgFpsRef.current * 0.9 + currentFps * 0.1;
            updateFps(Math.round(avgFpsRef.current));
          }

          // Render
          gl.uniformMatrix4fv(uniforms.view, false, actualViewMatrix);
          gl.clear(gl.COLOR_BUFFER_BIT);
          
          const currentVertexCount = Math.min(vertexCountRef.current, lastTexturedVertexCountRef.current);
          if (currentVertexCount > 0) {
            gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, currentVertexCount);
          }
        }
      }
      
      lastFrameRef.current = now;
    };

    frameIdRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('wheel', handleWheel);
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
      worker.terminate();
      
      // Clean up WebGL resources
      const glCleanup = glRef.current;
      if (glCleanup) {
        const vb = vertexBufferRef.current;
        if (vb) glCleanup.deleteBuffer(vb);
        const ib = indexBufferRef.current;
        if (ib) glCleanup.deleteBuffer(ib);
        const tex = textureRef.current;
        if (tex) glCleanup.deleteTexture(tex);
        const prog = programRef.current;
        if (prog) {
          const shaders = glCleanup.getAttachedShaders(prog);
          if (shaders) {
            shaders.forEach((s) => glCleanup?.deleteShader(s));
          }
          glCleanup.deleteProgram(prog);
        }
        glCleanup.disableVertexAttribArray(0);
        glCleanup.disableVertexAttribArray(1);
      }
    };
  }, [updateFps]);

  return {
    canvasRef,
    isLoading,
    error,
    fps,
    vertexCount,
    totalSplats,
    animationPhase,
    animationProgress,
    carousel,
    setCarousel,
  };
}
