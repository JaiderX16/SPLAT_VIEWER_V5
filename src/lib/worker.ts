export function createWorker(self: Worker) {
  let buffer: ArrayBuffer | null = null;
  let vertexCount = 0;
  let viewProj: number[] | null = null;
  const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
  let lastProj: number[] = [];
  let depthIndex = new Uint32Array();
  let lastVertexCount = 0;
  let textureGenerated = false;

  const _floatView = new Float32Array(1);
  const _int32View = new Int32Array(_floatView.buffer);

  function floatToHalf(float: number): number {
    _floatView[0] = float;
    const f = _int32View[0];

    const sign = (f >> 31) & 0x0001;
    const exp = (f >> 23) & 0x00ff;
    const frac = f & 0x007fffff;

    let newExp;
    if (exp === 0) {
      newExp = 0;
    } else if (exp < 113) {
      newExp = 0;
      const newFrac = frac | 0x00800000;
      const shifted = newFrac >> (113 - exp);
      if (shifted & 0x01000000) {
        newExp = 1;
      }
    } else if (exp < 142) {
      newExp = exp - 112;
    } else {
      newExp = 31;
    }

    return (sign << 15) | (newExp << 10) | (frac >> 13);
  }

  function packHalf2x16(x: number, y: number): number {
    return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
  }

  function generateTexture() {
    if (!buffer || vertexCount === 0) return;
    const f_buffer = new Float32Array(buffer);
    const u_buffer = new Uint8Array(buffer);

    const texwidth = 1024 * 2;
    const texheight = Math.ceil((2 * vertexCount) / texwidth);
    const texdata = new Uint32Array(texwidth * texheight * 4);
    const texdata_c = new Uint8Array(texdata.buffer);
    const texdata_f = new Float32Array(texdata.buffer);

    for (let i = 0; i < vertexCount; i++) {
      texdata_f[8 * i + 0] = f_buffer[8 * i + 0];
      texdata_f[8 * i + 1] = f_buffer[8 * i + 1];
      texdata_f[8 * i + 2] = f_buffer[8 * i + 2];

      texdata_c[4 * (8 * i + 7) + 0] = u_buffer[32 * i + 24 + 0];
      texdata_c[4 * (8 * i + 7) + 1] = u_buffer[32 * i + 24 + 1];
      texdata_c[4 * (8 * i + 7) + 2] = u_buffer[32 * i + 24 + 2];
      texdata_c[4 * (8 * i + 7) + 3] = u_buffer[32 * i + 24 + 3];

      const scale = [
        f_buffer[8 * i + 3 + 0],
        f_buffer[8 * i + 3 + 1],
        f_buffer[8 * i + 3 + 2],
      ];
      const rot = [
        (u_buffer[32 * i + 28 + 0] - 128) / 128,
        (u_buffer[32 * i + 28 + 1] - 128) / 128,
        (u_buffer[32 * i + 28 + 2] - 128) / 128,
        (u_buffer[32 * i + 28 + 3] - 128) / 128,
      ];

      const M = [
        1.0 - 2.0 * (rot[2] * rot[2] + rot[3] * rot[3]),
        2.0 * (rot[1] * rot[2] + rot[0] * rot[3]),
        2.0 * (rot[1] * rot[3] - rot[0] * rot[2]),

        2.0 * (rot[1] * rot[2] - rot[0] * rot[3]),
        1.0 - 2.0 * (rot[1] * rot[1] + rot[3] * rot[3]),
        2.0 * (rot[2] * rot[3] + rot[0] * rot[1]),

        2.0 * (rot[1] * rot[3] + rot[0] * rot[2]),
        2.0 * (rot[2] * rot[3] - rot[0] * rot[1]),
        1.0 - 2.0 * (rot[1] * rot[1] + rot[2] * rot[2]),
      ].map((k, idx) => k * scale[Math.floor(idx / 3)]);

      const sigma = [
        M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
        M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
        M[0] * M[2] + M[3] * M[5] + M[6] * M[8],
        M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
        M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
        M[2] * M[2] + M[5] * M[5] + M[8] * M[8],
      ];

      texdata[8 * i + 4] = packHalf2x16(4 * sigma[0], 4 * sigma[1]);
      texdata[8 * i + 5] = packHalf2x16(4 * sigma[2], 4 * sigma[3]);
      texdata[8 * i + 6] = packHalf2x16(4 * sigma[4], 4 * sigma[5]);
    }

    self.postMessage({ texdata, texwidth, texheight }, [texdata.buffer]);
    textureGenerated = true;
  }

  // Generate depth index sorted by view projection (back-to-front for correct alpha blending)
  function runSort(viewProjArg: number[], force = false) {
    if (!buffer || vertexCount === 0) return;
    const f_buffer = new Float32Array(buffer);
    
    // Generate texture if needed
    if (!textureGenerated || lastVertexCount !== vertexCount) {
      generateTexture();
      lastVertexCount = vertexCount;
    }
    
    // Skip sort if view hasn't changed much (unless forced)
    if (!force && lastProj.length > 0) {
      const dot =
        lastProj[2] * viewProjArg[2] +
        lastProj[6] * viewProjArg[6] +
        lastProj[10] * viewProjArg[10];
      if (Math.abs(dot - 1) < 0.015) {
        return;
      }
    }

    let maxDepth = -Infinity;
    let minDepth = Infinity;
    const sizeList = new Int32Array(vertexCount);
    
    // Calculate depths from camera (for back-to-front rendering)
    for (let i = 0; i < vertexCount; i++) {
      const depth =
        ((viewProjArg[2] * f_buffer[8 * i + 0] +
          viewProjArg[6] * f_buffer[8 * i + 1] +
          viewProjArg[10] * f_buffer[8 * i + 2]) *
          4096) |
        0;
      sizeList[i] = depth;
      if (depth > maxDepth) maxDepth = depth;
      if (depth < minDepth) minDepth = depth;
    }

    // Avoid division by zero
    if (maxDepth === minDepth) {
      lastProj = viewProjArg;
      // Send default depth index
      const defaultDepthIndex = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) defaultDepthIndex[i] = i;
      self.postMessage({ depthIndex: defaultDepthIndex, viewProj: viewProjArg, vertexCount });
      return;
    }

    const depthInv = (256 * 256 - 1) / (maxDepth - minDepth);
    const counts0 = new Uint32Array(256 * 256);
    
    for (let i = 0; i < vertexCount; i++) {
      sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
      counts0[sizeList[i]]++;
    }
    
    const starts0 = new Uint32Array(256 * 256);
    for (let i = 1; i < 256 * 256; i++)
      starts0[i] = starts0[i - 1] + counts0[i - 1];
    
    depthIndex = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++)
      depthIndex[starts0[sizeList[i]]++] = i;

    lastProj = viewProjArg;
    self.postMessage({ depthIndex, viewProj: viewProjArg, vertexCount }, [
      depthIndex.buffer,
    ]);
  }

  function processPlyBuffer(inputBuffer: ArrayBuffer) {
    const ubuf = new Uint8Array(inputBuffer);
    const header = new TextDecoder().decode(ubuf.slice(0, 1024 * 10));
    const header_end = 'end_header\n';
    const header_end_index = header.indexOf(header_end);
    if (header_end_index < 0)
      throw new Error('Unable to read .ply file header');
    const vertexCountMatch = /element vertex (\d+)\n/.exec(header);
    if (!vertexCountMatch) throw new Error('Unable to parse vertex count');
    const plyVertexCount = parseInt(vertexCountMatch[1]);

    let row_offset = 0;
    const offsets: Record<string, number> = {};
    const types: Record<string, string> = {};
    const TYPE_MAP: Record<string, string> = {
      double: 'getFloat64',
      int: 'getInt32',
      uint: 'getUint32',
      float: 'getFloat32',
      short: 'getInt16',
      ushort: 'getUint16',
      uchar: 'getUint8',
    };
    for (const prop of header
      .slice(0, header_end_index)
      .split('\n')
      .filter((k) => k.startsWith('property '))) {
      const [, type, name] = prop.split(' ');
      const arrayType = TYPE_MAP[type] || 'getInt8';
      types[name] = arrayType;
      offsets[name] = row_offset;
      row_offset += parseInt(arrayType.replace(/\D/g, '')) / 8;
    }

    const dataView = new DataView(
      inputBuffer,
      header_end_index + header_end.length,
    );
    let row = 0;
    const attrs = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (!types[prop]) throw new Error(prop + ' not found');
          return (dataView as unknown as Record<string, (offset: number, littleEndian: boolean) => number>)[types[prop]](
            row * row_offset + offsets[prop],
            true,
          );
        },
      },
    );

    const sizeList = new Float32Array(plyVertexCount);
    const sizeIndex = new Uint32Array(plyVertexCount);
    for (row = 0; row < plyVertexCount; row++) {
      sizeIndex[row] = row;
      if (!types['scale_0']) continue;
      const size =
        Math.exp((attrs as Record<string, number>).scale_0) *
        Math.exp((attrs as Record<string, number>).scale_1) *
        Math.exp((attrs as Record<string, number>).scale_2);
      const opacity = 1 / (1 + Math.exp(-(attrs as Record<string, number>).opacity));
      sizeList[row] = size * opacity;
    }

    sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);

    const outRowLength = 3 * 4 + 3 * 4 + 4 + 4;
    const outBuffer = new ArrayBuffer(outRowLength * plyVertexCount);

    for (let j = 0; j < plyVertexCount; j++) {
      row = sizeIndex[j];

      const position = new Float32Array(outBuffer, j * outRowLength, 3);
      const scales = new Float32Array(outBuffer, j * outRowLength + 4 * 3, 3);
      const rgba = new Uint8ClampedArray(
        outBuffer,
        j * outRowLength + 4 * 3 + 4 * 3,
        4,
      );
      const rot = new Uint8ClampedArray(
        outBuffer,
        j * outRowLength + 4 * 3 + 4 * 3 + 4,
        4,
      );

      if (types['scale_0']) {
        const qlen = Math.sqrt(
          (attrs as Record<string, number>).rot_0 ** 2 +
          (attrs as Record<string, number>).rot_1 ** 2 +
          (attrs as Record<string, number>).rot_2 ** 2 +
          (attrs as Record<string, number>).rot_3 ** 2,
        );

        rot[0] = ((attrs as Record<string, number>).rot_0 / qlen) * 128 + 128;
        rot[1] = ((attrs as Record<string, number>).rot_1 / qlen) * 128 + 128;
        rot[2] = ((attrs as Record<string, number>).rot_2 / qlen) * 128 + 128;
        rot[3] = ((attrs as Record<string, number>).rot_3 / qlen) * 128 + 128;

        scales[0] = Math.exp((attrs as Record<string, number>).scale_0);
        scales[1] = Math.exp((attrs as Record<string, number>).scale_1);
        scales[2] = Math.exp((attrs as Record<string, number>).scale_2);
      } else {
        scales[0] = 0.01;
        scales[1] = 0.01;
        scales[2] = 0.01;

        rot[0] = 255;
        rot[1] = 0;
        rot[2] = 0;
        rot[3] = 0;
      }

      position[0] = (attrs as Record<string, number>).x;
      position[1] = (attrs as Record<string, number>).y;
      position[2] = (attrs as Record<string, number>).z;

      if (types['f_dc_0']) {
        const SH_C0 = 0.28209479177387814;
        rgba[0] = (0.5 + SH_C0 * (attrs as Record<string, number>).f_dc_0) * 255;
        rgba[1] = (0.5 + SH_C0 * (attrs as Record<string, number>).f_dc_1) * 255;
        rgba[2] = (0.5 + SH_C0 * (attrs as Record<string, number>).f_dc_2) * 255;
      } else {
        rgba[0] = (attrs as Record<string, number>).red;
        rgba[1] = (attrs as Record<string, number>).green;
        rgba[2] = (attrs as Record<string, number>).blue;
      }
      if (types['opacity']) {
        rgba[3] = (1 / (1 + Math.exp(-(attrs as Record<string, number>).opacity))) * 255;
      } else {
        rgba[3] = 255;
      }
    }
    return outBuffer;
  }

  self.onmessage = (e: MessageEvent) => {
    if (e.data.ply) {
      vertexCount = 0;
      textureGenerated = false;
      if (viewProj) runSort(viewProj);
      buffer = processPlyBuffer(e.data.ply);
      vertexCount = Math.floor(buffer.byteLength / rowLength);
      self.postMessage({ buffer: buffer, save: !!e.data.save });
    } else if (e.data.buffer) {
      buffer = e.data.buffer;
      vertexCount = e.data.vertexCount;
      // Generate texture immediately when buffer is received
      if (vertexCount > 0 && !textureGenerated) {
        generateTexture();
        lastVertexCount = vertexCount;
      }
      // Send initial depth index (sequential) so rendering starts immediately
      if (vertexCount > 0) {
        const initialDepthIndex = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) initialDepthIndex[i] = i;
        self.postMessage({ depthIndex: initialDepthIndex, vertexCount }, [initialDepthIndex.buffer]);
      }
    } else if (e.data.vertexCount) {
      vertexCount = e.data.vertexCount;
      if (vertexCount > 0 && !textureGenerated) {
        generateTexture();
        lastVertexCount = vertexCount;
      }
    } else if (e.data.view) {
      viewProj = e.data.view;
      // If force flag is set, reset lastProj to force a complete re-sort
      if (e.data.force === true) {
        lastProj = [];
      }
      // Sort immediately - pass force flag if provided
      if (viewProj) runSort(viewProj, e.data.force === true);
    }
  };
}
