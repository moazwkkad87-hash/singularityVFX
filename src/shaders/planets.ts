/* Runtime planet shaders (sample the pre-baked textures) */
import { GLSL_LENS } from './common'

export const planetVertex = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  ${GLSL_LENS}
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz; // lighting uses the true position
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(lensWarp(wp.xyz), 1.0);
  }
`

export const PLANET_HEADER = /* glsl */ `
  uniform mat4 modelMatrix;
  uniform vec3 uLightColor;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  // the accretion disk at the origin is the light source
  vec3 lightDir(vec3 wp) { return normalize(-wp); }
  vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
`

export const gasGiantFragment = /* glsl */ `
  ${PLANET_HEADER}
  uniform sampler2D uAlbedo;
  uniform sampler2D uRingTex;
  uniform vec3 uCenter;
  uniform vec3 uRingNormal;
  uniform float uRingInner;
  uniform float uRingOuter;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 L = lightDir(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 albedo = srgbToLinear(texture(uAlbedo, vUv).rgb);

    float ndl = dot(n, L);
    float diffuse = smoothstep(-0.06, 1.0, ndl);
    float limb = pow(max(dot(n, V), 0.0), 0.35);

    // ring shadow cast on the planet
    float shadow = 1.0;
    float denom = dot(L, uRingNormal);
    if (abs(denom) > 1e-4) {
      float tr = dot(uCenter - vWorldPos, uRingNormal) / denom;
      if (tr > 0.0) {
        float d = length(vWorldPos + L * tr - uCenter);
        float x = (d - uRingInner) / (uRingOuter - uRingInner);
        if (x > 0.0 && x < 1.0) shadow = 1.0 - textureLod(uRingTex, vec2(x, 0.5), 1.5).r * 0.88;
      }
    }

    vec3 col = albedo * uLightColor * diffuse * limb * shadow;
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col += vec3(0.95, 0.8, 0.6) * rim * smoothstep(-0.2, 0.6, ndl) * 0.25 * uLightColor;
    col += albedo * 0.004;
    gl_FragColor = vec4(col, 1.0);
  }
`

export const ringVertex = /* glsl */ `
  varying vec3 vWorldPos;
  ${GLSL_LENS}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(lensWarp(wp.xyz), 1.0);
  }
`

export const ringFragment = /* glsl */ `
  uniform vec3 uLightColor;
  uniform sampler2D uRingTex;
  uniform vec3 uCenter;
  uniform vec3 uRingNormal;
  uniform float uRingInner;
  uniform float uRingOuter;
  uniform float uPlanetRadius;
  varying vec3 vWorldPos;

  void main() {
    float d = length(vWorldPos - uCenter);
    float x = (d - uRingInner) / (uRingOuter - uRingInner);
    if (x < 0.0 || x > 1.0) discard;
    // hardware mip filtering of the 1D profile = perfect anti-aliasing for free
    vec4 ring = texture(uRingTex, vec2(x, 0.5));
    float density = ring.r;
    if (density < 0.003) discard;

    vec3 L = normalize(-vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 oc = vWorldPos - uCenter;
    float b = dot(oc, L);
    float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
    float h = b * b - c;
    float shadow = (h > 0.0 && -b - sqrt(h) > 0.0) ? 0.04 : 1.0;

    float litSide = sign(dot(uRingNormal, L)) * sign(dot(uRingNormal, V));
    float ndl = abs(dot(uRingNormal, L));
    float lighting = litSide > 0.0
      ? 0.25 + 0.95 * ndl
      : (0.10 + 0.6 * ndl) * (1.0 - density) * 1.6;
    float forward = pow(max(dot(-V, L), 0.0), 8.0) * 1.4 * (1.0 - density);

    vec3 albedo = mix(vec3(0.78, 0.69, 0.56), vec3(0.58, 0.52, 0.47), ring.g);
    albedo = mix(albedo, vec3(0.45, 0.42, 0.40), smoothstep(0.25, 0.0, x));

    vec3 col = albedo * uLightColor * (lighting + forward) * shadow;
    gl_FragColor = vec4(col, density * 0.92);
  }
`

export const oceanWorldFragment = /* glsl */ `
  ${PLANET_HEADER}
  uniform sampler2D uAlbedo;
  uniform sampler2D uNormal;
  uniform sampler2D uClouds;
  uniform sampler2D uWater;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 L = lightDir(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 albedo = srgbToLinear(texture(uAlbedo, vUv).rgb);
    float water = texture(uWater, vUv).r;
    vec3 nObj = texture(uNormal, vUv).xyz * 2.0 - 1.0;
    vec3 nb = normalize(mat3(modelMatrix) * nObj);

    // clouds drift east relative to the surface
    vec2 cuv = vUv + vec2(uTime * 0.0006, 0.0);
    float clouds = texture(uClouds, cuv).r;

    // cloud shadow: offset along the light direction projected into UV space
    mat3 toObj = transpose(mat3(modelMatrix));
    vec3 Lobj = normalize(toObj * L);
    float phi = vUv.x * 6.28318530718;
    float theta = (1.0 - vUv.y) * 3.14159265359;
    vec3 dU = vec3(sin(phi) * sin(theta), 0.0, cos(phi) * sin(theta)) * 6.28318530718;
    vec3 dV = vec3(-cos(phi) * cos(theta), -sin(theta), sin(phi) * cos(theta)) * -3.14159265359;
    vec2 shift = vec2(dot(Lobj, dU) / max(dot(dU, dU), 1e-4), dot(Lobj, dV) / dot(dV, dV)) * 0.012;
    float cloudShadow = texture(uClouds, cuv + shift, 1.5).r;

    float ndl = dot(nb, L);
    float diffuse = max(ndl, 0.0);
    float terminator = smoothstep(-0.08, 0.12, dot(n, L));
    vec3 surface = albedo * diffuse * (1.0 - cloudShadow * 0.6);

    // ocean sun glint with a little wave roughness
    vec3 H = normalize(L + V);
    float nh = max(dot(n, H), 0.0);
    float spec = pow(nh, 260.0) * 7.0 + pow(nh, 40.0) * 0.15;
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    surface += water * (1.0 - clouds) * spec * (0.3 + fresnel) * terminator;
    surface += water * fresnel * vec3(0.10, 0.18, 0.35) * terminator * 0.25;

    vec3 cloudCol = vec3(0.80) * (max(dot(n, L), 0.0) * 0.95 + 0.01);
    vec3 col = mix(surface, cloudCol, clouds * 0.94);

    // Rayleigh haze towards the limb and a warm band along the terminator
    float mu = max(dot(n, V), 0.0);
    float haze = pow(1.0 - mu, 2.2);
    float nl = dot(n, L);
    vec3 sunset = vec3(1.0, 0.45, 0.2) * smoothstep(-0.12, 0.05, nl) * (1.0 - smoothstep(0.05, 0.3, nl));
    col = mix(col, vec3(0.20, 0.42, 0.95) * terminator * (0.4 + max(nl, 0.0)), haze * 0.35);
    col += sunset * 0.035 * (0.4 + haze);

    gl_FragColor = vec4(col * uLightColor, 1.0);
  }
`

export const atmosphereFragment = /* glsl */ `
  ${PLANET_HEADER}
  uniform vec3 uTint;
  uniform float uStrength;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 L = lightDir(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float mu = abs(dot(n, V));
    float ndl = dot(n, L);
    float rim = pow(1.0 - mu, 3.0) * smoothstep(0.0, 0.35, mu);
    float lit = smoothstep(-0.15, 0.35, ndl);
    float forward = pow(max(dot(-V, L), 0.0), 6.0);
    vec3 tint = mix(uTint, vec3(1.0, 0.55, 0.3), smoothstep(0.2, -0.1, ndl) * 0.5);
    gl_FragColor = vec4(tint * rim * lit * uStrength * (1.0 + forward * 3.0) * uLightColor, 1.0);
  }
`

export const rockyFragment = /* glsl */ `
  ${PLANET_HEADER}
  uniform sampler2D uAlbedo;
  uniform sampler2D uNormal;

  void main() {
    vec3 L = lightDir(vWorldPos);
    vec3 albedo = srgbToLinear(texture(uAlbedo, vUv).rgb);
    vec3 nObj = texture(uNormal, vUv).xyz * 2.0 - 1.0;
    vec3 nb = normalize(mat3(modelMatrix) * nObj);
    // rough regolith: flatter falloff than Lambert, slight opposition surge
    float ndl = max(dot(nb, L), 0.0);
    float rough = mix(ndl, sqrt(ndl), 0.35);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float opposition = 1.0 + 0.25 * pow(max(dot(V, L), 0.0), 20.0);
    vec3 col = albedo * rough * opposition * uLightColor + albedo * 0.003;
    gl_FragColor = vec4(col, 1.0);
  }
`
