/* Comet coma + ion tail + curved dust tail (GPU particles) */
import { GLSL_LENS } from './common'

export const cometVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uNucleus;
  uniform vec3 uAntiLight;
  uniform vec3 uVelocity;
  uniform float uActivity;
  uniform float uPointScale;
  varying vec3 vColor;
  varying float vAlpha;
  ${GLSL_LENS}

  void main() {
    float kind = aSeed.w;               // 0 = coma, 1 = ion tail, 2 = dust tail
    float s = fract(aSeed.x + uTime * (kind > 1.5 ? 0.035 : 0.09));
    vec3 lateral = normalize(vec3(aSeed.y - 0.5, aSeed.z - 0.5, fract(aSeed.y * 7.13) - 0.5));

    vec3 pos;
    float size;
    if (kind < 0.5) {
      pos = uNucleus + lateral * aSeed.x * 0.18 * uActivity;
      size = 0.9 + aSeed.z * 1.4;
      vColor = vec3(0.75, 0.88, 1.0);
      vAlpha = 0.025 * (1.0 - aSeed.x);
    } else if (kind < 1.5) {
      float len = 9.0 * uActivity;
      pos = uNucleus + uAntiLight * s * len + lateral * (0.03 + s * 0.35) * uActivity;
      size = 0.55 + s * 1.2;
      vColor = vec3(0.35, 0.62, 1.0);
      vAlpha = 0.07 * pow(1.0 - s, 1.6) * smoothstep(0.0, 0.04, s);
    } else {
      float len = 6.0 * uActivity;
      // dust lags behind the orbit, curving the tail
      vec3 dir = normalize(uAntiLight - uVelocity * s * 0.9);
      pos = uNucleus + dir * s * len + lateral * (0.05 + s * 0.9) * uActivity;
      size = 0.8 + s * 2.2;
      vColor = vec3(1.0, 0.88, 0.70);
      vAlpha = 0.045 * pow(1.0 - s, 1.3) * smoothstep(0.0, 0.05, s);
    }

    vec4 mv = viewMatrix * vec4(lensWarp(pos), 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * uPointScale / max(-mv.z, 0.1), 1.0, 40.0);
  }
`

export const cometFragment = /* glsl */ `
  uniform vec3 uLightColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv) * 4.0;
    float a = exp(-d * 3.5) * vAlpha;
    if (a < 0.0005) discard;
    gl_FragColor = vec4(vColor * uLightColor * a * 2.2, 1.0);
  }
`
