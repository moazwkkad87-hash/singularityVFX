/**
 * Offline / one-time bake shaders. These are NOT used at runtime: they are run
 * by the bake tool (bake.html) to produce the WebP textures in /public/textures.
 * All are rendered on a full-screen quad; vUv is the texture coordinate.
 */
import { DISK_OUTER, PLUNGE_INNER, SKY_RANGE } from '../config/constants'
import { GLSL_COMMON } from './common'

export const bakeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const skyBakeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uPass;
  ${GLSL_COMMON}

  const vec3 GALAXY_N = normalize(vec3(0.32, 0.88, -0.36));
  const vec3 GALAXY_CORE = normalize(vec3(-0.62, 0.18, -0.76));

  // distant galaxies: tiny elliptical smudges
  vec3 galaxies(vec3 d) {
    vec3 p = d * 34.0;
    vec3 cell = floor(p);
    vec3 h = hash33(cell + 71.0);
    if (h.x > 0.05) return vec3(0.0);
    vec3 c = normalize(cell + 0.5 + (hash33(cell) - 0.5) * 0.6) * 34.0;
    vec3 off = p - c;
    vec3 axis = normalize(hash33(cell + 3.0) - 0.5);
    float along = dot(off, axis);
    float across = length(off - axis * along);
    float size = 0.02 + h.y * 0.05;
    float g = exp(-(along * along / (size * size) + across * across / (size * size * 0.12)));
    return mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.82, 1.0), h.z) * g * 0.35;
  }

  void main() {
    vec3 d = equirectDir(vUv);
    float lat = dot(d, GALAXY_N);
    float band = exp(-lat * lat * 26.0);
    float wideBand = exp(-lat * lat * 5.0);
    float core = pow(max(dot(d, GALAXY_CORE), 0.0), 6.0);

    // domain-warped star clouds (far more octaves than real-time allowed)
    vec3 warp = vec3(fbm(d * 2.0 + 1.0, 5), fbm(d * 2.0 + 6.0, 5), fbm(d * 2.0 + 11.0, 5)) - 0.5;
    float clouds = fbm(d * 3.2 + 4.0 + warp * 1.2, 9);
    float fine = fbm(d * 14.0 + warp, 7);
    float grain = fbm(d * 60.0, 5);
    float dust = ridged(d * 5.5 + 11.0 + warp * 0.8, 8);
    float dustFine = ridged(d * 17.0 + 3.0, 6);
    float dustMask = smoothstep(0.42, 0.85, dust * 0.75 + dustFine * 0.35) * exp(-lat * lat * 55.0) * 0.9;

    vec3 milky = vec3(0.0);
    milky += vec3(0.52, 0.60, 0.86) * band * (0.25 + 1.0 * clouds * fine) * (0.8 + grain * 0.4) * 0.05;
    milky += vec3(1.00, 0.82, 0.62) * core * band * (0.5 + clouds) * 0.15;
    milky += vec3(0.30, 0.34, 0.48) * wideBand * 0.010;

    // emission nebulae: H-alpha red and O-III teal filaments
    float neb = pow(fbm(d * 2.1 + 31.0 + warp, 8), 4.0);
    float filaments = ridged(d * 9.0 + warp * 2.0, 6);
    milky += vec3(0.80, 0.16, 0.22) * neb * band * (0.6 + filaments * 0.8) * 0.14;
    milky += vec3(0.10, 0.45, 0.50) * pow(fbm(d * 2.7 + 7.0 + warp, 7), 5.0) * wideBand * 0.07;
    // reflection nebula glow (blue) around a few bright regions
    milky += vec3(0.25, 0.4, 0.9) * pow(fbm(d * 1.6 + 50.0, 6), 6.0) * wideBand * 0.12;

    milky *= 1.0 - dustMask;
    // dust also reddens what it does not fully block
    milky *= mix(vec3(1.0), vec3(1.0, 0.75, 0.55), dustMask * 0.6);
    milky += galaxies(d) * (1.0 - wideBand * 0.8);

    if (uPass < 0.5) {
      // HDR nebula colour, gamma-encoded into 8 bits
      gl_FragColor = vec4(pow(clamp(milky / ${SKY_RANGE.toFixed(3)}, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    } else {
      // how much the dust lets background stars through
      gl_FragColor = vec4(vec3(1.0 - dustMask), 1.0);
    }
  }
`

export const diskBakeFragment = /* glsl */ `
  varying vec2 vUv;
  ${GLSL_COMMON}

  float turbulence(vec2 q, float lr, vec3 seed) {
    vec3 coord = vec3(q * 3.6, lr * 9.0) + seed;
    vec3 warp = vec3(fbm(coord + 1.7, 5), fbm(coord + 9.2, 5), fbm(coord + 4.4, 5)) - 0.5;
    float n = fbm(coord + warp * 2.4, 8);
    float streak = fbm(vec3(q * 9.0, lr * 26.0) + seed + warp * 2.0, 7);
    float fineStreak = fbm(vec3(q * 22.0, lr * 70.0) + seed + warp * 1.2, 5);
    float clumps = fbm(vec3(q * 3.5, lr * 7.0) + 3.0 + seed + warp, 5);
    return n * 0.5 + streak * 0.28 + fineStreak * 0.12 + clumps * 0.3;
  }

  void main() {
    float angle = vUv.x * 6.28318530718;
    vec2 q = vec2(cos(angle), sin(angle));
    float lr = mix(log(${PLUNGE_INNER.toFixed(3)}), log(${DISK_OUTER.toFixed(3)}), vUv.y);
    float a = clamp(turbulence(q, lr, vec3(0.0)), 0.0, 1.0);
    gl_FragColor = vec4(vec3(a), 1.0);
  }
`

export const gasGiantBake = /* glsl */ `
  varying vec2 vUv;
  ${GLSL_COMMON}
  void main() {
    vec3 sp = sphereDir(vUv);
    float lat = sp.y;
    vec3 warp = vec3(fbm(sp * 5.0 + 1.0, 5), fbm(sp * 5.0 + 7.0, 5), fbm(sp * 5.0 + 3.0, 5)) - 0.5;
    float turb = fbm(vec3(sp.x * 3.0, lat * 9.0, sp.z * 3.0) + warp * 0.6, 8);
    float eddies = fbm(vec3(sp.x * 9.0, lat * 38.0, sp.z * 9.0) + warp * 1.6, 7);
    float shear = fbm(vec3(sp.x * 22.0, lat * 120.0, sp.z * 22.0) + warp * 2.5, 5);
    float y = lat + (turb - 0.5) * 0.06 + (eddies - 0.5) * 0.02 + (shear - 0.5) * 0.006;

    float b1 = sin(y * 26.0) * 0.5 + 0.5;
    float b2 = sin(y * 61.0 + 1.7) * 0.5 + 0.5;
    float b3 = sin(y * 143.0 + 0.4) * 0.5 + 0.5;
    float b4 = sin(y * 310.0 + 2.2) * 0.5 + 0.5;

    vec3 cream = vec3(0.74, 0.63, 0.46);
    vec3 tan = vec3(0.58, 0.42, 0.25);
    vec3 umber = vec3(0.38, 0.25, 0.14);
    vec3 pale = vec3(0.82, 0.77, 0.64);

    vec3 albedo = mix(cream, tan, smoothstep(0.3, 0.8, b1));
    albedo = mix(albedo, umber, smoothstep(0.65, 0.95, b2) * 0.45);
    albedo = mix(albedo, pale, smoothstep(0.7, 1.0, b3) * 0.25);
    albedo *= 0.93 + 0.1 * b4;
    albedo *= 0.88 + 0.24 * eddies;

    // a long-lived anticyclonic storm
    vec3 stormC = normalize(vec3(0.6, -0.33, 0.73));
    float sd = length((sp - stormC) * vec3(1.0, 3.2, 1.0));
    float storm = smoothstep(0.17, 0.05, sd + (fbm(sp * 30.0, 4) - 0.5) * 0.05);
    albedo = mix(albedo, vec3(0.86, 0.72, 0.55), storm * 0.7);
    albedo = mix(albedo, vec3(0.62, 0.40, 0.24), smoothstep(0.08, 0.02, sd) * 0.6);

    // bluish polar haze, hexagonal-ish polar vortex
    albedo = mix(albedo, vec3(0.50, 0.58, 0.66), smoothstep(0.72, 0.95, abs(lat)) * 0.55);

    gl_FragColor = vec4(pow(albedo, vec3(1.0 / 2.2)), 1.0);
  }
`

// Rocky bodies: pass 0 = albedo (sRGB), pass 1 = object-space normal
export const rockyBake = /* glsl */ `
  varying vec2 vUv;
  uniform float uSeed;
  uniform float uPass;
  uniform vec3 uAlbedoA;
  uniform vec3 uAlbedoB;
  ${GLSL_COMMON}

  float craters(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float res = 0.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = hash33(i + g + uSeed);
      if (hash13(i + g + uSeed * 1.7) > 0.42) continue;
      float rad = 0.12 + 0.42 * pow(o.z, 2.0);
      float d = length(g + o - f) / rad;
      if (d < 1.4) {
        float bowl = d < 1.0 ? (d * d - 1.0) * 0.6 : 0.0;
        float rimRaise = exp(-pow((d - 1.0) * 5.0, 2.0)) * 0.14;
        res = min(res, bowl) + rimRaise;
      }
    }
    return res;
  }

  float height(vec3 sp) {
    float h = fbm(sp * 3.0 + uSeed, 8) * 0.6;
    h += craters(sp * 4.0) * 0.30;
    h += craters(sp * 11.0) * 0.10;
    h += craters(sp * 27.0) * 0.035;
    h += craters(sp * 61.0) * 0.012;
    h += (ridged(sp * 40.0 + uSeed, 4) - 0.5) * 0.01;
    return h;
  }

  void main() {
    vec3 sp = sphereDir(vUv);
    float h0 = height(sp);
    if (uPass < 0.5) {
      float mottling = fbm(sp * 6.0 + uSeed * 3.0, 7);
      vec3 albedo = mix(uAlbedoA, uAlbedoB, smoothstep(0.3, 0.75, mottling + h0 * 0.4));
      // bright ejecta rays around fresh craters
      albedo *= 0.9 + 0.2 * fbm(sp * 40.0 + uSeed, 4);
      gl_FragColor = vec4(pow(albedo, vec3(1.0 / 2.2)), 1.0);
      return;
    }
    float e = 0.0015;
    vec3 t1 = normalize(cross(sp, abs(sp.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
    vec3 t2 = cross(sp, t1);
    float hx = height(normalize(sp + t1 * e));
    float hy = height(normalize(sp + t2 * e));
    vec3 n = normalize(sp - (t1 * (hx - h0) + t2 * (hy - h0)) / e * 0.22);
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`

// Ocean world: pass 0 = albedo (rgb sRGB) + water mask (a), pass 1 = normal, pass 2 = clouds
export const oceanBake = /* glsl */ `
  varying vec2 vUv;
  uniform float uPass;
  ${GLSL_COMMON}

  float terrain(vec3 sp) {
    float c = fbm(sp * 1.6 + 2.0, 9);
    float m = ridged(sp * 4.0 + 5.0, 7);
    return c + m * 0.12 * smoothstep(0.5, 0.62, c);
  }

  void main() {
    vec3 sp = sphereDir(vUv);
    float sea = 0.585;

    if (uPass > 1.5 && uPass < 2.5) {
      vec3 cw = vec3(fbm(sp * 2.0 + 4.0, 4), fbm(sp * 2.0 + 9.0, 4), fbm(sp * 2.0 + 1.0, 4)) - 0.5;
      float cloudBase = fbm(sp * 3.2 + vec3(0.0, 7.0, 0.0) + cw * 1.3, 9);
      float swirl = fbm(sp * 9.0 + cloudBase * 2.0, 6);
      float wisps = fbm(vec3(sp.x * 14.0, sp.y * 40.0, sp.z * 14.0) + cw * 3.0, 5);
      float clouds = smoothstep(0.56, 0.80, cloudBase * 0.72 + swirl * 0.3 + wisps * 0.06);
      // fewer clouds in the subtropical deserts, storm belts near the equator
      float lat = abs(sp.y);
      clouds *= 0.65 + 0.55 * smoothstep(0.15, 0.0, abs(lat - 0.55)) + 0.3 * smoothstep(0.2, 0.0, lat);
      gl_FragColor = vec4(vec3(clamp(clouds, 0.0, 1.0)), 1.0);
      return;
    }

    float h = terrain(sp);
    if (uPass > 0.5 && uPass < 1.5) {
      float e = 0.0012;
      vec3 t1 = normalize(cross(sp, abs(sp.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
      vec3 t2 = cross(sp, t1);
      float hx = max(terrain(normalize(sp + t1 * e)), sea);
      float hy = max(terrain(normalize(sp + t2 * e)), sea);
      float hc = max(h, sea);
      vec3 n = normalize(sp - (t1 * (hx - hc) + t2 * (hy - hc)) / e * 0.08);
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      return;
    }

    float land = smoothstep(sea, sea + 0.004, h);
    float elevation = clamp((h - sea) / 0.22, 0.0, 1.0);
    float lat = abs(sp.y);

    vec3 deep = vec3(0.004, 0.020, 0.055);
    vec3 shallow = vec3(0.02, 0.10, 0.16);
    vec3 ocean = mix(deep, shallow, smoothstep(sea - 0.06, sea, h));

    float aridity = fbm(sp * 3.0 + 40.0, 6);
    vec3 forest = vec3(0.05, 0.10, 0.04);
    vec3 grass = vec3(0.12, 0.15, 0.06);
    vec3 desert = vec3(0.42, 0.32, 0.20);
    vec3 rock = vec3(0.24, 0.21, 0.19);
    vec3 ground = mix(forest, grass, smoothstep(0.4, 0.55, aridity));
    ground = mix(ground, desert, smoothstep(0.5, 0.64, aridity + (0.5 - lat) * 0.15));
    ground = mix(ground, rock, smoothstep(0.35, 0.8, elevation));
    ground *= 0.85 + 0.3 * fbm(sp * 30.0, 4); 
    float snow = smoothstep(0.86, 0.92, lat + elevation * 0.3 + (aridity - 0.5) * 0.1);
    ground = mix(ground, vec3(0.85, 0.88, 0.92), snow);
    float iceCap = smoothstep(0.93, 0.96, lat + (aridity - 0.5) * 0.05);

    vec3 albedo = mix(ocean, ground, land);
    albedo = mix(albedo, vec3(0.86, 0.9, 0.95), iceCap);
    float water = (1.0 - land) * (1.0 - iceCap);
    if (uPass > 2.5) {
      gl_FragColor = vec4(vec3(water), 1.0);
      return;
    }
    gl_FragColor = vec4(pow(albedo, vec3(1.0 / 2.2)), 1.0);
  }
`
