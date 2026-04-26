export const ANIMATION = {
  DURATION_P1: 5000,
  DURATION_HOLD: 100,
  DURATION_P2: 5000,
  POINT_CLOUD_SCALE: 0.15,
  RIPPLE_BAND_FACTOR: 0.05,
  GROW_BAND_FACTOR: 0.18,
  GLOW_COLOR: [0.65, 0.90, 1.0],
};

export const vertexShaderSource = `
#version 300 es
precision highp float;
precision highp int;

uniform highp usampler2D u_texture;
uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;

uniform float u_elapsedMs;
uniform float u_maxDist;
uniform vec3 u_sceneCenter;
uniform float u_p1Dur;
uniform float u_holdDur;
uniform float u_p2Dur;
uniform float u_showEverything;
uniform float u_modelScale;

in vec2 position;
in int index;

out vec4 vColor;
out vec2 vPosition;

float _easeOut(float t) {
    return 1.0 - pow(max(0.0, 1.0 - t), 2.5);
}

void main () {
    uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);
    vec3 worldPos = uintBitsToFloat(cen.xyz) * u_modelScale;
    vec4 cam = view * vec4(worldPos, 1);
    vec4 pos2d = projection * cam;

    float clip = 1.2 * pos2d.w;
    if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    float _dist = length(worldPos - u_sceneCenter);

    float _p1T = _easeOut(clamp(u_elapsedMs / max(u_p1Dur, 1.0), 0.0, 1.0));
    float _p1WaveR = _p1T * 1.05 * u_maxDist;

    float _p2Raw = clamp((u_elapsedMs - u_p1Dur - u_holdDur) / max(u_p2Dur, 1.0), 0.0, 1.0);
    float _p2T = _easeOut(_p2Raw);
    float _p2WaveR = _p2T * 1.4 * u_maxDist;

    float _rippleBand = max(u_maxDist * 0.05, 0.15);
    float _growBand   = max(u_maxDist * 0.18, 0.60);

    float _p1Visible = clamp((_p1WaveR - _dist) / _rippleBand, 0.0, 1.0);
    float growth = clamp((_p2WaveR - _dist) / _growBand, 0.0, 1.0);

    if (u_showEverything > 0.5) {
        _p1Visible = 1.0;
        growth = 1.0;
    }

    float _p1Ripple = max(0.0, 1.0 - abs(_dist - _p1WaveR) / _rippleBand);
    float _p2Ripple = max(0.0, 1.0 - abs(_dist - _p2WaveR) / _growBand);
    float rippleGlow = max(_p1Ripple * 0.85, _p2Ripple * 0.75);

    uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);

    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.
    );

    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;

    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius, lambda2 = mid - radius;

    if(lambda2 < 0.0) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));

    float baseScale = mix(0.15, 1.0, growth);
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 2048.0) * diagonalVector * baseScale;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 2048.0) * vec2(diagonalVector.y, -diagonalVector.x) * baseScale;

    float depthFade = clamp(pos2d.z / pos2d.w + 1.0, 0.0, 1.0);
    vColor = depthFade * vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;

    vColor.rgb = mix(vColor.rgb, vec3(0.65, 0.90, 1.0), rippleGlow);
    vColor.a *= _p1Visible;
    vColor.rgb = mix(vColor.rgb * 0.8 + vec3(0.0, 0.2, 0.3), vColor.rgb, growth);

    vPosition = position;
    vec2 vCenter = vec2(pos2d) / pos2d.w;

    gl_Position = vec4(
        vCenter
        + position.x * majorAxis / viewport
        + position.y * minorAxis / viewport, 0.0, 1.0);
}
`.trim();

export const fragmentShaderSource = `
#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vPosition;

out vec4 fragColor;

void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    fragColor = vec4(B * vColor.rgb, B);
}
`.trim();
