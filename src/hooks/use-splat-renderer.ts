import { useRef, useEffect, useCallback } from 'react';
import { vertexShaderSource, fragmentShaderSource } from '@/lib/shaders';

interface RendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onFrame: (now: number) => void;
}

export function useSplatRenderer({ canvasRef, onFrame }: RendererOptions) {
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const frameIdRef = useRef<number | null>(null);

  // Buffer and Texture Refs
  const buffersRef = useRef<{
    position: WebGLBuffer | null;
    index: WebGLBuffer | null;
    texture: WebGLTexture | null;
  }>({ position: null, index: null, texture: null });

  // Uniform Locations
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    if (!gl) throw new Error('WebGL2 not supported');
    glRef.current = gl;

    // Compile Shaders
    const createShader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || 'Shader error');
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Link error');
    }
    gl.useProgram(program);
    programRef.current = program;

    // Cache Uniforms
    const uniformNames = [
      'u_texture', 'projection', 'view', 'focal', 'viewport',
      'u_elapsedMs', 'u_maxDist', 'u_sceneCenter', 'u_p1Dur', 'u_holdDur', 'u_p2Dur', 'u_showEverything'
    ];
    uniformNames.forEach(name => {
      uniformsRef.current[name] = gl.getUniformLocation(program, name);
    });

    if (uniformsRef.current.u_texture) {
      gl.uniform1i(uniformsRef.current.u_texture, 0);
    }

    // Setup Buffers
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const idxBuffer = gl.createBuffer();
    const idxLoc = gl.getAttribLocation(program, 'index');
    gl.enableVertexAttribArray(idxLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, idxBuffer);
    gl.vertexAttribIPointer(idxLoc, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(idxLoc, 1);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    buffersRef.current = { position: posBuffer, index: idxBuffer, texture };

    // Initial GL State
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
  }, [canvasRef]);

  // Texture Update
  const updateTexture = useCallback((texdata: Uint32Array, width: number, height: number) => {
    const gl = glRef.current;
    if (!gl || !buffersRef.current.texture) return;
    gl.bindTexture(gl.TEXTURE_2D, buffersRef.current.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texdata);
  }, []);

  const currentVertexCountRef = useRef(0);

  // Depth Index Update
  const updateDepthIndex = useCallback((data: Uint32Array) => {
    const gl = glRef.current;
    if (!gl || !buffersRef.current.index) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.index);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    currentVertexCountRef.current = data.length;
  }, []);

  // Stable render loop
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    initWebGL();
    
    const loop = (now: number) => {
      if (onFrameRef.current) onFrameRef.current(now);
      frameIdRef.current = requestAnimationFrame(loop);
    };
    frameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
      // Cleanup WebGL resources ONLY on unmount (or if canvas changes, which is rare)
      const gl = glRef.current;
      if (gl) {
        gl.deleteBuffer(buffersRef.current.position);
        gl.deleteBuffer(buffersRef.current.index);
        gl.deleteTexture(buffersRef.current.texture);
        gl.deleteProgram(programRef.current);
      }
    };
  }, [initWebGL]); // Only restarts if canvas restarts

  return { 
    gl: glRef.current, 
    program: programRef.current, 
    uniforms: uniformsRef.current, 
    currentVertexCountRef,
    updateTexture, 
    updateDepthIndex 
  };
}
