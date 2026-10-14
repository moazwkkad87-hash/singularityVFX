/**
 * Black-hole ray tracer.
 *
 * Pass 1 (tracer, reduced resolution) integrates photon geodesics through the
 * Schwarzschild metric and writes four layers (MRT, half-float):
 *   gBehind  rgb: far disk images + glow behind the first crossing, a: sky weight
 *   gDeflect xyz: escaped direction minus primary ray (small -> precise in fp16), w: sky lod
 *   gFront   rgb: first disk crossing (+ glow in front of it), a: its transmittance
 *   gDepth   r: eye depth of the hide plane / horizon, g: eye depth of the front layer
 *
 * Pass 2 (composite, full resolution) rebuilds the bent direction per pixel and
 * samples the sky + procedural stars there, so stars stay pin-sharp even though
 * the expensive march runs at a fraction of the screen resolution.
 */
import { DISK_INNER, DISK_OUTER, LENS_RADIUS, PLUNGE_INNER, SKY_RANGE, TIME_SCALE } from '../config/constants'
import { GLSL_COMMON } from './common'

export const fullscreenVertex = /* glsl */ `
  varying vec2 vNdc;
  varying vec2 vUv;
  void main() {
    vNdc = position.xy;
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const DEFINES = /* glsl */ `
  #define DISK_IN ${DISK_INNER.toFixed(3)}
  #define DISK_OUT ${DISK_OUTER.toFixed(3)}
  #define PLUNGE_IN ${PLUNGE_INNER.toFixed(3)}
  #define LENS_R ${LENS_RADIUS.toFixed(3)}
  #define SKY_RANGE ${SKY_RANGE.toFixed(3)}
`

/* ------------------------------------------------------------------ */
/*  Pass 1: tracer                                                     */
/* ------------------------------------------------------------------ */

export const tracerFragment = /* glsl */ `
  uniform float uTime;
  uniform mat4 uCamWorld;
  uniform mat4 uInvProj;
  uniform float uPixel;
  uniform float uStepScale;
  uniform int uMaxSteps;
  uniform vec2 uTexel; // one tracer pixel in NDC units
  uniform sampler2D uDisk;
  uniform vec2 uDiskSize;
  varying vec2 vNdc;

  ${GLSL_COMMON}
  ${DEFINES}

  /* ---------------- Weak-field lensing (closed form) ----------------
     For a nearly straight ray with impact parameter b, the bend still to come
     between the current point and infinity is (Rs / b) * (1 - s / r).
     The full integral over the whole ray gives the textbook 2 Rs / b.          */

  vec3 bendToInfinity(vec3 p, vec3 dir) {
    float s = dot(p, dir);
    vec3 perp = p - dir * s;
    float b = max(length(perp), 1e-3);
    float r = length(p);
    float delta = (1.0 - s / r) / b;
    return normalize(dir - (perp / b) * delta);
  }

  /* ---------------- Accretion disk ---------------- */

  vec4 diskSample(vec3 p, vec3 rayDir, float footprint) {
    float r = length(p.xz);
    float outer = 1.0 - smoothstep(DISK_OUT * 0.45, DISK_OUT, r);
    float inner = smoothstep(DISK_IN, DISK_IN + 0.35, r);
    // sparse, dim gas plunging from the ISCO into the horizon
    float plunge = (1.0 - inner) * smoothstep(PLUNGE_IN, DISK_IN, r) * 0.22;
    float profile = max(inner, plunge) * outer;
    if (profile <= 0.0) return vec4(0.0);

    // Keplerian angular velocity (G M = 0.5 with Rs = 1), slowed for viewing
    float omega = sqrt(0.5 / (r * r * r)) * 1.6;

    // two-phase flow map so differential rotation never winds up infinitely
    float period = 24.0;
    float t = uTime * ${TIME_SCALE.toFixed(2)};
    float ph1 = fract(t / period);
    float ph2 = fract(t / period + 0.5);
    float w = abs(ph1 * 2.0 - 1.0);

    float phi = atan(p.z, p.x);
    float v = (log(r) - log(PLUNGE_IN)) / (log(DISK_OUT) - log(PLUNGE_IN));
    float u1 = (phi + omega * ph1 * period) / 6.28318530718;
    float u2 = (phi + omega * ph2 * period) / 6.28318530718 + 0.37;

    // mip level from the pixel footprint on the disk (kills shimmer, saves bandwidth)
    float grazing = max(abs(normalize(rayDir).y), 0.3);
    float texelU = 6.28318530718 * r / uDiskSize.x;
    float texelV = r * (log(DISK_OUT) - log(PLUNGE_IN)) / uDiskSize.y;
    float lod = log2(max(footprint / grazing / min(texelU, texelV), 1.0)) - 1.5;

    float n1 = textureLod(uDisk, vec2(u1, v), lod).r;
    float n2 = textureLod(uDisk, vec2(u2, v), lod).r;
    float n = mix(n1, n2, w);

    // Novikov-Thorne style temperature profile
    float x = min(DISK_IN / r, 1.0);
    float tProfile = pow(x, 0.75) * pow(max(1.0 - sqrt(x * 0.92), 0.0), 0.25) * 2.05;
    float temperature = 6400.0 * tProfile;

    // relativistic Doppler beaming + gravitational redshift
    vec3 velDir = normalize(vec3(-p.z, 0.0, p.x));
    float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.2)), 0.0, 0.75);
    float gamma = inversesqrt(1.0 - beta * beta);
    float cosTheta = dot(velDir, -normalize(rayDir));
    float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));
    float gravShift = sqrt(max(1.0 - 1.0 / r, 0.0));
    float g = doppler * gravShift;

    float observedT = temperature * g;
    float brightness = pow(tProfile, 3.0) * pow(g, 4.0) * 2.4;

    float density = clamp(profile * (0.15 + 1.25 * pow(n, 1.6)), 0.0, 1.0);
    float detail = 0.35 + 1.15 * smoothstep(0.25, 0.85, n);
    vec3 emission = blackbody(observedT) * brightness * detail * profile;

    float alpha = clamp(density * 1.35, 0.0, 0.97);
    return vec4(emission * alpha, alpha);
  }

  layout(location = 0) out vec4 gBehind;
  layout(location = 1) out vec4 gDeflect;
  layout(location = 2) out vec4 gFront;
  layout(location = 3) out vec4 gDepth;

  struct Trace {
    vec4 behind;
    vec4 deflect;
    vec4 front;
    vec4 depth;
  };

  vec3 rayDir(vec2 ndc) {
    vec4 viewPos = uInvProj * vec4(ndc, 1.0, 1.0);
    viewPos /= viewPos.w;
    return normalize((uCamWorld * vec4(viewPos.xyz, 0.0)).xyz);
  }

  Trace traceRay(vec3 rd) {
    vec3 ro = cameraPosition;
    vec3 camForward = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
    float cosView = max(dot(rd, camForward), 0.05);

    vec3 front = vec3(0.0);
    float frontT = 1.0;
    float frontDist = -1.0;
    vec3 behind = vec3(0.0);
    float behindT = 1.0;
    float hideDist = -1.0;
    bool escaped = false;
    bool captured = false;
    vec3 outDir = rd;
    float r0 = length(ro);

    vec3 p = ro;
    vec3 v = rd;

    // Enter the lens sphere analytically (or skip the march entirely)
    if (r0 > LENS_R) {
      float b = dot(ro, rd);
      float disc = b * b - (r0 * r0 - LENS_R * LENS_R);
      if (disc < 0.0 || b > 0.0) {
        escaped = true;
        outDir = bendToInfinity(ro, rd);
      } else {
        float tEnter = -b - sqrt(disc);
        p = ro + rd * tEnter;
        // bend picked up between the camera and the sphere
        vec3 perp = ro - rd * dot(ro, rd);
        float bi = max(length(perp), 1e-3);
        float bend = (dot(p, rd) / LENS_R - dot(ro, rd) / r0) / bi;
        v = normalize(rd - (perp / bi) * bend);
      }
    }

    if (!escaped) {
      float jitter = 0.2 + 0.8 * hash13(vec3(gl_FragCoord.xy, 7.0));
      vec3 hv = cross(p, v);
      float h2 = dot(hv, hv);

      for (int i = 0; i < 400; i++) {
        if (i >= uMaxSteps) break;
        float r = length(p);

        if (r < 1.0) {
          captured = true;
          hideDist = max(r0 - 1.0, length(p - ro));
          behindT = 0.0;
          break;
        }
        if (r > LENS_R && dot(p, v) > 0.0) {
          escaped = true;
          outDir = bendToInfinity(p, normalize(v));
          break;
        }

        float dt = clamp(0.08 * (r - 0.85), 0.012, 1.6) * uStepScale * (i == 0 ? jitter : 1.0);
        float rxz = length(p.xz);
        bool nearDisk = rxz < DISK_OUT * 1.15 && abs(p.y) < 2.0;
        if (nearDisk) dt = min(dt, max(abs(p.y) * 0.8 + 0.03, 0.06));

        // soft scattered glow hugging the disk plane (cheap volumetric corona)
        if (rxz > DISK_IN * 0.9 && rxz < DISK_OUT) {
          float xg = DISK_IN / rxz;
          float hGlow = 0.12 + rxz * 0.045;
          float vert = exp(-abs(p.y) / hGlow);
          float fall = xg * xg * sqrt(xg) * smoothstep(DISK_IN * 0.9, DISK_IN * 1.6, rxz);
          vec3 glowStep = vec3(1.0, 0.62, 0.33) * vert * fall * dt * 0.03;
          if (frontDist < 0.0) front += glowStep; else behind += behindT * glowStep;
        }

        // velocity-Verlet step of the photon geodesic equation (Rs = 1)
        vec3 prev = p;
        float r2 = r * r;
        v += -0.75 * h2 * p / (r2 * r2 * r) * dt;
        p += v * dt;
        float rn = length(p);
        float rn2 = rn * rn;
        v += -0.75 * h2 * p / (rn2 * rn2 * rn) * dt;

        // crossed the disk plane?
        if (prev.y * p.y < 0.0) {
          float f = prev.y / (prev.y - p.y);
          vec3 hp = mix(prev, p, f);
          float hr = length(hp.xz);
          if (hr > PLUNGE_IN && hr < DISK_OUT) {
            float footprint = length(hp - ro) * uPixel;
            vec4 s = diskSample(hp, v, footprint);
            if (frontDist < 0.0) {
              front += s.rgb;
              frontT = 1.0 - s.a;
              frontDist = length(hp - ro);
            } else {
              behind += behindT * s.rgb;
              behindT *= 1.0 - s.a;
            }
            if (frontT * behindT < 0.01) break;
          }
        }
      }
      if (!escaped && !captured && frontT * behindT > 0.01) {
        escaped = true;
        outDir = normalize(v);
      }
    }

    float deflection = acos(clamp(dot(rd, outDir), -1.0, 1.0));
    float skyWeight = (escaped && !captured) ? behindT : 0.0;
    // strongly lensed sky is compressed: sample a blurrier mip to avoid sparkle
    float lod = clamp(log2(1.0 + deflection * 6.0), 0.0, 4.0);

    // Rasterised objects are only weakly lensed (vertex warp), so anything seen
    // through very strongly bent light is hidden behind the hole.
    if (hideDist < 0.0 && escaped && deflection > 0.6) hideDist = r0;
    // pure glow with no disk crossing sits at the black hole's distance
    if (frontDist < 0.0 && dot(front, front) > 0.0) frontDist = r0;
    // the front layer must never be occluded by the hole's own hide plane
    if (frontDist > 0.0 && hideDist > 0.0) frontDist = min(frontDist, hideDist * 0.999);

    Trace t;
    t.behind = vec4(behind, skyWeight);
    t.deflect = vec4(outDir - rd, lod);
    t.front = vec4(front, frontT);
    t.depth = vec4(
      hideDist > 0.0 ? hideDist * cosView : 60000.0,
      frontDist > 0.0 ? frontDist * cosView : 60000.0,
      0.0, 1.0);
    return t;
  }

  // critical impact parameter of the photon sphere: 3 sqrt(3) / 2 Rs
  const float B_CRIT = 2.598076;

  void main() {
    vec3 rd = rayDir(vNdc);
    Trace t = traceRay(rd);

    // Adaptive anti-aliasing: rays skimming the photon sphere form the razor-thin
    // photon ring and the shadow edge, both thinner than a tracer pixel. Only
    // that narrow annulus gets 3 extra rotated-grid samples.
    vec3 ro = cameraPosition;
    float b = length(cross(ro, rd));
    float bPixel = uPixel * length(ro);
    if (b > B_CRIT - 2.0 * bPixel && b < B_CRIT + 0.35 + 2.0 * bPixel) {
      Trace s1 = traceRay(rayDir(vNdc + vec2(0.375, 0.125) * uTexel));
      Trace s2 = traceRay(rayDir(vNdc + vec2(-0.125, 0.375) * uTexel));
      Trace s3 = traceRay(rayDir(vNdc + vec2(-0.375, -0.125) * uTexel));
      t.behind = (t.behind + s1.behind + s2.behind + s3.behind) * 0.25;
      t.front = (t.front + s1.front + s2.front + s3.front) * 0.25;
    }

    gBehind = t.behind;
    gDeflect = t.deflect;
    gFront = t.front;
    gDepth = t.depth;
  }
`

/* ------------------------------------------------------------------ */
/*  Pass 2: composites (full resolution, inside the main scene)        */
/* ------------------------------------------------------------------ */

const COMPOSITE_COMMON = /* glsl */ `
  uniform mat4 uProj;
  uniform sampler2D uDepth;
  float eyeToDepth(float eye) {
    if (eye > 50000.0) return 0.999999;
    float clipZ = uProj[2][2] * -eye + uProj[3][2];
    return clamp((clipZ / eye) * 0.5 + 0.5, 0.0, 0.999999);
  }
`

/** Background layer: sky + stars at full resolution, writes the hide-plane depth. */
export const compositeBackFragment = /* glsl */ `
  uniform mat4 uCamWorld;
  uniform mat4 uInvProj;
  uniform float uPixel;
  uniform sampler2D uBehind;
  uniform sampler2D uDeflect;
  uniform sampler2D uSkyColor;
  uniform sampler2D uSkyDust;
  varying vec2 vNdc;
  varying vec2 vUv;

  ${GLSL_COMMON}
  ${DEFINES}
  ${COMPOSITE_COMMON}

  vec3 starLayer(vec3 d, float scale, float density, float boost) {
    vec3 p = d * scale;
    vec3 cell = floor(p);
    vec3 h = hash33(cell);
    if (h.x > density) return vec3(0.0);
    vec3 starPos = normalize(cell + 0.3 + 0.4 * hash33(cell + 19.19)) * scale;
    float dist = length(p - starPos);
    float sigma = uPixel * scale * 0.7;
    float mag = pow(h.y, 9.0) * boost + 0.02;
    float core = exp(-dist * dist / (sigma * sigma));
    float halo = mag > 1.4 ? 0.012 * sigma * sigma / (dist * dist + sigma * sigma * 0.5) : 0.0;
    float temp = mix(2900.0, 14000.0, pow(h.z, 1.7));
    return blackbody(temp) * mag * (core + halo * 12.0);
  }

  const vec3 GALAXY_N = normalize(vec3(0.32, 0.88, -0.36));

  vec3 sky(vec3 d, float lod) {
    vec2 suv = dirToEquirect(d);
    vec3 neb = pow(textureLod(uSkyColor, suv, lod).rgb, vec3(2.2)) * SKY_RANGE;
    float dust = textureLod(uSkyDust, suv, lod).r;
    float lat = dot(d, GALAXY_N);
    float band = exp(-lat * lat * 26.0);
    vec3 stars = starLayer(d, 45.0, 0.10, 26.0);
    stars += starLayer(d, 95.0, 0.16, 10.0) * 0.7;
    stars += starLayer(d, 190.0, 0.12 + band * 0.45, 2.5) * (0.3 + band * 1.3);
    return neb + stars * dust;
  }

  void main() {
    vec4 behind = texture(uBehind, vUv);
    vec3 color = behind.rgb;
    if (behind.a > 0.002) {
      vec4 viewPos = uInvProj * vec4(vNdc, 1.0, 1.0);
      viewPos /= viewPos.w;
      vec3 rd = normalize((uCamWorld * vec4(viewPos.xyz, 0.0)).xyz);
      vec4 deflect = texture(uDeflect, vUv);
      vec3 dir = normalize(rd + deflect.xyz);
      color += behind.a * sky(dir, deflect.w);
    }
    gl_FragDepth = eyeToDepth(texture(uDepth, vUv).r);
    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Front disk layer, blended OVER anything rasterised behind it:
 *   result = front.rgb + destination * frontTransmittance
 */
export const compositeFrontFragment = /* glsl */ `
  uniform sampler2D uFront;
  varying vec2 vUv;
  ${COMPOSITE_COMMON}
  void main() {
    vec4 f = texture(uFront, vUv);
    if (f.a > 0.999 && dot(f.rgb, f.rgb) < 1e-8) discard;
    gl_FragDepth = eyeToDepth(texture(uDepth, vUv).g);
    gl_FragColor = f;
  }
`
