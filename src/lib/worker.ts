export function createWorker(self: Worker) {
  let buffer: ArrayBuffer | null = null;
  let vertexCount = 0;
  let viewProj: number[] | null = null;
  let lastProj: number[] = [];
  let lastVertexCount = 0;
  let textureGenerated = false;

  // Reusable texture data buffer to avoid allocations
  let cachedTexData: Uint32Array | null = null;

  const _floatView = new Float32Array(1);
  const _int32View = new Int32Array(_floatView.buffer);

  function floatToHalf(float: number): number {
    _floatView[0] = float;
    const f = _int32View[0];
    const sign = (f >> 31) & 0x0001;
    const exp = (f >> 23) & 0x00ff;
    const frac = f & 0x007fffff;

    let newExp;
    if (exp === 0) newExp = 0;
    else if (exp < 113) {
      newExp = 0;
      const newFrac = frac | 0x00800000;
      const shifted = newFrac >> (113 - exp);
      if (shifted & 0x01000000) newExp = 1;
    } else if (exp < 142) newExp = exp - 112;
    else newExp = 31;

    return (sign << 15) | (newExp << 10) | (frac >> 13);
  }

  function packHalf2x16(x: number, y: number): number {
    return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
  }

  function generateTexture(): { texdata: Uint32Array; texwidth: number; texheight: number } | null {
    if (!buffer || vertexCount === 0) return null;
    const f_buffer = new Float32Array(buffer);
    const u_buffer = new Uint8Array(buffer);

    const texwidth = 2048;
    const texheight = Math.ceil((2 * vertexCount) / texwidth);
    const requiredSize = texwidth * texheight * 4;

    // Reuse or allocate buffer
    if (!cachedTexData || cachedTexData.length < requiredSize) {
      cachedTexData = new Uint32Array(requiredSize);
    }
    const texdata = cachedTexData;
    const texdata_c = new Uint8Array(texdata.buffer);
    const texdata_f = new Float32Array(texdata.buffer);

    for (let i = 0; i < vertexCount; i++) {
      const idx8 = 8 * i;
      const idx32 = 32 * i;

      texdata_f[idx8 + 0] = f_buffer[idx8 + 0];
      texdata_f[idx8 + 1] = f_buffer[idx8 + 1];
      texdata_f[idx8 + 2] = f_buffer[idx8 + 2];

      const rgbaIdx = 4 * (idx8 + 7);
      texdata_c[rgbaIdx + 0] = u_buffer[idx32 + 24 + 0];
      texdata_c[rgbaIdx + 1] = u_buffer[idx32 + 24 + 1];
      texdata_c[rgbaIdx + 2] = u_buffer[idx32 + 24 + 2];
      texdata_c[rgbaIdx + 3] = u_buffer[idx32 + 24 + 3];

      const s0 = f_buffer[idx8 + 3], s1 = f_buffer[idx8 + 4], s2 = f_buffer[idx8 + 5];
      const r0 = (u_buffer[idx32 + 28 + 0] - 128) / 128;
      const r1 = (u_buffer[idx32 + 28 + 1] - 128) / 128;
      const r2 = (u_buffer[idx32 + 28 + 2] - 128) / 128;
      const r3 = (u_buffer[idx32 + 28 + 3] - 128) / 128;

      const M = [
        (1.0 - 2.0 * (r2 * r2 + r3 * r3)) * s0,
        (2.0 * (r1 * r2 + r0 * r3)) * s0,
        (2.0 * (r1 * r3 - r0 * r2)) * s0,
        (2.0 * (r1 * r2 - r0 * r3)) * s1,
        (1.0 - 2.0 * (r1 * r1 + r3 * r3)) * s1,
        (2.0 * (r2 * r3 + r0 * r1)) * s1,
        (2.0 * (r1 * r3 + r0 * r2)) * s2,
        (2.0 * (r2 * r3 - r0 * r1)) * s2,
        (1.0 - 2.0 * (r1 * r1 + r2 * r2)) * s2,
      ];

      const sigma = [
        M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
        M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
        M[0] * M[2] + M[3] * M[5] + M[6] * M[8],
        M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
        M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
        M[2] * M[2] + M[5] * M[5] + M[8] * M[8],
      ];

      texdata[idx8 + 4] = packHalf2x16(4 * sigma[0], 4 * sigma[1]);
      texdata[idx8 + 5] = packHalf2x16(4 * sigma[2], 4 * sigma[3]);
      texdata[idx8 + 6] = packHalf2x16(4 * sigma[4], 4 * sigma[5]);
    }

    textureGenerated = true;
    return { texdata: new Uint32Array(texdata.slice(0, requiredSize)), texwidth, texheight };
  }

  function runSort(viewProjArg: number[], force = false) {
    if (!buffer || vertexCount === 0) return;
    const f_buffer = new Float32Array(buffer);

    if (!textureGenerated || lastVertexCount !== vertexCount) {
      const tex = generateTexture();
      lastVertexCount = vertexCount;
      if (tex) {
        self.postMessage({
          texdata: tex.texdata,
          texwidth: tex.texwidth,
          texheight: tex.texheight,
          vertexCount,
        }, [tex.texdata.buffer]);
      }
    }

    if (!force && lastProj.length > 0) {
      const dot = lastProj[2] * viewProjArg[2] + lastProj[6] * viewProjArg[6] + lastProj[10] * viewProjArg[10];
      if (Math.abs(dot - 1) < 0.01) return;
    }

    let maxDepth = -Infinity;
    let minDepth = Infinity;
    const sizeList = new Int32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const idx8 = 8 * i;
      const depth = ((viewProjArg[2] * f_buffer[idx8 + 0] + viewProjArg[6] * f_buffer[idx8 + 1] + viewProjArg[10] * f_buffer[idx8 + 2]) * 4096) | 0;
      sizeList[i] = depth;
      if (depth > maxDepth) maxDepth = depth;
      if (depth < minDepth) minDepth = depth;
    }

    if (maxDepth === minDepth) {
      lastProj = viewProjArg;
      const defaultIndex = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) defaultIndex[i] = i;
      self.postMessage({ depthIndex: defaultIndex, viewProj: viewProjArg, vertexCount });
      return;
    }

    const depthInv = (256 * 256 - 1) / (maxDepth - minDepth);
    const counts = new Uint32Array(256 * 256);
    for (let i = 0; i < vertexCount; i++) {
      sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
      counts[sizeList[i]]++;
    }

    const starts = new Uint32Array(256 * 256);
    for (let i = 1; i < 256 * 256; i++) starts[i] = starts[i - 1] + counts[i - 1];

    const depthIndex = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) depthIndex[starts[sizeList[i]]++] = i;

    lastProj = viewProjArg;
    self.postMessage({
      depthIndex,
      viewProj: viewProjArg,
      vertexCount,
      isFinal: vertexCount === lastVertexCount,
    }, [depthIndex.buffer]);
  }

  self.onmessage = (e: MessageEvent) => {
    if (e.data.buffer) {
      buffer = e.data.buffer;
      vertexCount = e.data.vertexCount;

      let tex = null;
      if (vertexCount > 0 && (!textureGenerated || lastVertexCount !== vertexCount)) {
        tex = generateTexture();
        lastVertexCount = vertexCount;
      }

      const initialDepthIndex = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) initialDepthIndex[i] = i;

      if (tex) {
        self.postMessage({
          texdata: tex.texdata,
          texwidth: tex.texwidth,
          texheight: tex.texheight,
          depthIndex: initialDepthIndex,
          vertexCount,
        }, [tex.texdata.buffer, initialDepthIndex.buffer]);
      } else {
        self.postMessage({ depthIndex: initialDepthIndex, vertexCount }, [initialDepthIndex.buffer]);
      }
    } else if (e.data.view) {
      viewProj = e.data.view;
      if (e.data.force === true) {
        lastProj = [];
      }
      if (viewProj) runSort(viewProj, e.data.force === true);
    }
  };
}
