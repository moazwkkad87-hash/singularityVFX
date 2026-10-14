/* Shared GLSL chunks */

export const GLSL_COMMON = /* glsl */ `
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
          mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
          mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 10; i++) {
      if (i >= octaves) break;
      sum += amp * vnoise(p);
      norm += amp;
      p = p * 2.03 + vec3(1.7, 9.2, 5.3);
      amp *= 0.5;
    }
    return sum / norm;
  }

  float ridged(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 10; i++) {
      if (i >= octaves) break;
      float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
      sum += amp * n * n;
      norm += amp;
      p = p * 2.07 + vec3(3.1, 1.3, 7.7);
      amp *= 0.5;
    }
    return sum / norm;
  }

  // Approximate black-body colour (normalised, linear RGB) for a temperature in Kelvin
  vec3 blackbody(float T) {
    float t = clamp(T, 1000.0, 40000.0) / 100.0;
    vec3 c;
    c.r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    c.g = t <= 66.0
      ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
      : clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
    c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0));
    return pow(c, vec3(2.2));
  }

  // Equirectangular UV -> unit direction, matching THREE.SphereGeometry's UV layout
  vec3 sphereDir(vec2 uv) {
    float phi = uv.x * 6.28318530718;
    float theta = (1.0 - uv.y) * 3.14159265359;
    return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
  }
  // Equirectangular mapping used by the baked sky
  vec3 equirectDir(vec2 uv) {
    float phi = uv.x * 6.28318530718 - 3.14159265359;
    float theta = (1.0 - uv.y) * 3.14159265359;
    return vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
  }

  vec2 dirToEquirect(vec3 d) {
    return vec2(atan(d.z, d.x) / 6.28318530718 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
  }
`

/* ------------------------------------------------------------------ */
/*  Gravitational lensing for rasterised objects (vertex shader)       */
/*  Thin-lens point-mass solution: each vertex is moved to its primary */
/*  image  theta = (beta + sqrt(beta^2 + 4 thetaE^2)) / 2  with        */
/*  thetaE^2 = 2 Rs Dls / (Dl Ds). Same physics as the ray tracer's    */
/*  weak field, so planets warp consistently with the lensed sky.      */
/* ------------------------------------------------------------------ */

export const GLSL_LENS = /* glsl */ `
  vec3 lensWarp(vec3 X) {
    vec3 C = cameraPosition;
    float Dl = length(C);
    vec3 axis = -C / Dl;
    vec3 rel = X - C;
    float dist = length(rel);
    vec3 dir = rel / dist;
    float Ds = dot(rel, axis);
    float Dls = Ds - Dl;
    if (Dls <= 0.0) return X;
    float cosb = clamp(dot(dir, axis), -1.0, 1.0);
    float beta = acos(cosb);
    float thetaE2 = 2.0 * Dls / (Dl * Ds);
    float theta = 0.5 * (beta + sqrt(beta * beta + 4.0 * thetaE2));
    vec3 ortho = dir - axis * cosb;
    float ol = length(ortho);
    ortho = ol > 1e-6 ? ortho / ol : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
    return C + (axis * cos(theta) + ortho * sin(theta)) * dist;
  }
`
