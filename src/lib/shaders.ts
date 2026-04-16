// Animation constants - PHASE 2 duration is fixed, but Phase 1 is dynamic based on download
export const ANIMATION = {
  DURATION_HOLD: 100,       // Hold between phases (ms) - fixed short pause
  DURATION_P2: 5000,        // Splat reveal wave (ms) - fixed for visual effect
  POINT_CLOUD_SCALE: 0.08,  // Scale factor for point cloud mode
  RIPPLE_BAND: 0.15,        // Width of ripple effect
  GLOW_COLOR: [0.65, 0.90, 1.0], // Cyan glow color
};

export const vertexShaderSource = `
#version 300 es
precision highp float;
precision highp int;

uniform highp usampler2D u_texture;
uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;

// Wave animation uniforms
uniform float u_phase1Progress;     // 0.0 to 1.0 based on download progress
uniform float u_phase2Progress;     // 0.0 to 1.0 based on time after download
uniform float u_maxDist;            // Maximum distance from scene center
uniform vec3 u_sceneCenter;         // Center of the scene
uniform float u_isPhase2;           // 0.0 = phase 1, 1.0 = phase 2

in vec2 position;
in int index;

out vec4 vColor;
out vec2 vPosition;

// Easing function - smooth ease out
float easeOut(float t) {
    return 1.0 - pow(max(0.0, 1.0 - t), 2.5);
}

void main () {
    uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);
    vec3 worldPos = uintBitsToFloat(cen.xyz);
    vec4 cam = view * vec4(worldPos, 1);
    vec4 pos2d = projection * cam;

    float clip = 1.2 * pos2d.w;
    if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // ── Wave Reveal Animation ─────────────────────────────────────────────
    float dist = length(worldPos - u_sceneCenter);
    
    // Phase 1: All points visible as point cloud during download
    // No wave effect - just show all loaded points
    float p1Visible = 1.0;
    
    // Phase 2: Splat reveal wave (after all splats loaded)
    float p2Ease = easeOut(clamp(u_phase2Progress, 0.0, 1.0));
    float p2WaveR = p2Ease * 1.05 * u_maxDist;
    
    // Ripple bands
    float rippleBand = max(u_maxDist * 0.04, ${ANIMATION.RIPPLE_BAND.toFixed(2)});
    float growBand = max(u_maxDist * 0.15, 0.50);
    
    // Phase 2: splats grow from points to full gaussians based on wave
    float p2Grow = clamp((p2WaveR - dist) / growBand, 0.0, 1.0);
    
    // Ripple glow effect at wave front (only during phase 2)
    float p2Ripple = max(0.0, 1.0 - abs(dist - p2WaveR) / rippleBand);
    float rippleGlow = p2Ripple * 0.7 * (1.0 - u_phase2Progress * 0.5);
    // ───────────────────────────────────────────────────────────────────────

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

    if(lambda2 < 0.0) return;
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    
    // Scale: point cloud during phase 1, transition to full in phase 2
    float baseScale = mix(${ANIMATION.POINT_CLOUD_SCALE.toFixed(2)}, 1.0, p2Grow * u_isPhase2);
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector * baseScale;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x) * baseScale;

    vColor = clamp(pos2d.z/pos2d.w+1.0, 0.0, 1.0) * vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;
    
    // Apply wave visibility and cyan glow
    vColor.a *= mix(p1Visible, 1.0, u_isPhase2);
    vColor.rgb = mix(vColor.rgb, vec3(${ANIMATION.GLOW_COLOR[0].toFixed(2)}, ${ANIMATION.GLOW_COLOR[1].toFixed(2)}, ${ANIMATION.GLOW_COLOR[2].toFixed(2)}), rippleGlow);
    
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
