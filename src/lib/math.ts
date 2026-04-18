export function getProjectionMatrix(fx: number, fy: number, width: number, height: number): number[] {
  const znear = 0.2;
  const zfar = 200;
  // Pre-allocate array for better performance
  const m = new Array(16).fill(0);
  m[0] = (2 * fx) / width;
  m[5] = -(2 * fy) / height;
  m[10] = zfar / (zfar - znear);
  m[11] = 1;
  m[14] = -(zfar * znear) / (zfar - znear);
  return m;
}

export function getViewMatrix(camera: { position: number[]; rotation: number[][] }): number[] {
  const R = camera.rotation;
  const t = camera.position;
  
  // Flattened column-major order to match WebGL
  return [
    R[0][0], R[1][0], R[2][0], 0,
    R[0][1], R[1][1], R[2][1], 0,
    R[0][2], R[1][2], R[2][2], 0,
    -(t[0] * R[0][0] + t[1] * R[0][1] + t[2] * R[0][2]),
    -(t[0] * R[1][0] + t[1] * R[1][1] + t[2] * R[1][2]),
    -(t[0] * R[2][0] + t[2] * R[2][1] + t[2] * R[2][2]),
    1,
  ];
}

export function multiply4(a: number[], b: number[]): number[] {
  const out = new Array(16);
  
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] = 
        b[i * 4 + 0] * a[0 * 4 + j] +
        b[i * 4 + 1] * a[1 * 4 + j] +
        b[i * 4 + 2] * a[2 * 4 + j] +
        b[i * 4 + 3] * a[3 * 4 + j];
    }
  }
  return out;
}

export function invert4(a: number[]): number[] | null {
  const b00 = a[0] * a[5] - a[1] * a[4];
  const b01 = a[0] * a[6] - a[2] * a[4];
  const b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5];
  const b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12];
  const b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13];
  const b10 = a[9] * a[15] - a[11] * a[13];
  const b11 = a[10] * a[15] - a[11] * a[14];
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) return null;
  const detInv = 1.0 / det;

  return [
    (a[5] * b11 - a[6] * b10 + a[7] * b09) * detInv,
    (a[2] * b10 - a[1] * b11 - a[3] * b09) * detInv,
    (a[13] * b05 - a[14] * b04 + a[15] * b03) * detInv,
    (a[10] * b04 - a[9] * b05 - a[11] * b03) * detInv,
    (a[6] * b08 - a[4] * b11 - a[7] * b07) * detInv,
    (a[0] * b11 - a[2] * b08 + a[3] * b07) * detInv,
    (a[14] * b02 - a[12] * b05 - a[15] * b01) * detInv,
    (a[8] * b05 - a[10] * b02 + a[11] * b01) * detInv,
    (a[4] * b10 - a[5] * b08 + a[7] * b06) * detInv,
    (a[1] * b08 - a[0] * b10 - a[3] * b06) * detInv,
    (a[12] * b04 - a[13] * b02 + a[15] * b00) * detInv,
    (a[9] * b02 - a[8] * b04 - a[11] * b00) * detInv,
    (a[5] * b07 - a[4] * b09 - a[6] * b06) * detInv,
    (a[0] * b09 - a[1] * b07 + a[2] * b06) * detInv,
    (a[13] * b01 - a[12] * b03 - a[14] * b00) * detInv,
    (a[8] * b03 - a[9] * b01 + a[10] * b00) * detInv,
  ];
}

export function rotate4(a: number[], rad: number, x: number, y: number, z: number): number[] {
  const len = Math.hypot(x, y, z);
  if (len < 0.0001) return [...a];
  
  const ix = x / len, iy = y / len, iz = z / len;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const t = 1 - c;
  
  const b00 = ix * ix * t + c;
  const b01 = iy * ix * t + iz * s;
  const b02 = iz * ix * t - iy * s;
  const b10 = ix * iy * t - iz * s;
  const b11 = iy * iy * t + c;
  const b12 = iz * iy * t + ix * s;
  const b20 = ix * iz * t + iy * s;
  const b21 = iy * iz * t - ix * s;
  const b22 = iz * iz * t + c;
  
  return [
    a[0] * b00 + a[4] * b01 + a[8] * b02,
    a[1] * b00 + a[5] * b01 + a[9] * b02,
    a[2] * b00 + a[6] * b01 + a[10] * b02,
    a[3] * b00 + a[7] * b01 + a[11] * b02,
    a[0] * b10 + a[4] * b11 + a[8] * b12,
    a[1] * b10 + a[5] * b11 + a[9] * b12,
    a[2] * b10 + a[6] * b11 + a[10] * b12,
    a[3] * b10 + a[7] * b11 + a[11] * b12,
    a[0] * b20 + a[4] * b21 + a[8] * b22,
    a[1] * b20 + a[5] * b21 + a[9] * b22,
    a[2] * b20 + a[6] * b21 + a[10] * b22,
    a[3] * b20 + a[7] * b21 + a[11] * b22,
    a[12], a[13], a[14], a[15]
  ];
}

export function translate4(a: number[], x: number, y: number, z: number): number[] {
  const out = [...a];
  out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
  out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
  out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
  out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  return out;
}
