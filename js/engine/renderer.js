// WebGL2 renderer: sun shadow mapping (depth pass + PCF), one lit world shader, one sky shader,
// HDR post-processing (MSAA float buffer -> soft-knee bloom mip chain -> ACES, grade, vignette, dither).
// Draws are queued during begin()..end() then replayed for a shadow pass and the main pass,
// so game code just calls draw(mesh, model) and never worries about passes.
// No external engine: the sandbox this was built in has no network, so Three.js could not be vendored.
import { mat4, perspective, ortho, lookAt, multiply, invert } from './math.js';

// Shadow map resolution. Full quality on real GPUs; smaller on software rasterizers (e.g. the
// SwiftShader CPU renderer used in CI) so the depth pass stays cheap. Set per-renderer in the constructor.
let SHADOW_SIZE = 2048;

// Graphics presets (Settings > Graphics). scale = render resolution vs. the screen (ultra supersamples),
// shadow = shadow map size, post = HDR bloom/tonemap pass, rain = max streaks, draw = chunk draw distance (m),
// lod = distance (m) where cars switch to their low-detail mesh.
export const QUALITY = {
  low:    { label: 'Low',    scale: 0.7,  shadow: 1024, post: false, rain: 2500,  draw: 150, lod: 16 },
  medium: { label: 'Medium', scale: 0.85, shadow: 2048, post: true,  rain: 4500,  draw: 190, lod: 24 },
  high:   { label: 'High',   scale: 1,    shadow: 2048, post: true,  rain: 7000,  draw: 230, lod: 32 },
  ultra:  { label: 'Ultra',  scale: 2,    shadow: 8192, post: true,  rain: 12000, draw: 600, lod: 160, fx: true, msaa: 8, pcss: true, vol: true, fxFull: true },
};

const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;
uniform mat4 uVP, uModel;
out vec3 vW; out vec3 vN; out vec4 vC;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = mat3(uModel) * aNor;
  vC = vec4(pow(aCol.rgb, vec3(2.2)), aCol.a);
  gl_Position = uVP * w;
}`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec4 vC;
uniform vec3 uCam, uSunDir, uSunCol, uSkyCol, uGndCol, uFogCol, uWinCol;
uniform float uFogK, uNight, uExposure, uWet, uPost, uTime;
uniform vec4 uLamps[16]; uniform vec3 uLampC[16]; uniform int uLampN; uniform vec3 uLampCol;
uniform mat4 uLightVP;
uniform highp sampler2DShadow uShadow;
uniform vec2 uShadowTexel;
uniform float uShadowOn;
uniform highp sampler2D uShadowRaw;
uniform float uPcss, uShadowRange, uShadowWorld;
// Ultra: contact-hardening soft shadows (PCSS). Blocker search on the raw depth map, then a wide
// rotated Vogel-disk PCF whose radius grows with the blocker-to-receiver distance.
float shadowPcss(vec3 p, float z){
  float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float sr = 26.0, bs = 0.0, bn = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i), r = sqrt((fi + 0.5) / 16.0), a = rot + fi * 2.39996323;
    float sz = texture(uShadowRaw, p.xy + vec2(cos(a), sin(a)) * r * sr * uShadowTexel).r;
    if (sz < z) { bs += sz; bn += 1.0; }
  }
  if (bn < 0.5) return 1.0;
  float pen = (z - bs / bn) * uShadowRange * 0.024 / uShadowWorld;
  float rt = clamp(pen, 1.2, 24.0), s = 0.0;
  for (int i = 0; i < 32; i++) {
    float fi = float(i), r = sqrt((fi + 0.5) / 32.0), a = rot * 1.7 + fi * 2.39996323;
    s += texture(uShadow, vec3(p.xy + vec2(cos(a), sin(a)) * r * rt * uShadowTexel, z));
  }
  return s / 32.0;
}
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float shadow(vec3 n, float ndl){
  if (uShadowOn < 0.5) return 1.0;
  vec4 ls = uLightVP * vec4(vW, 1.0);
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float bias = max(0.0016 * (1.0 - ndl), 0.00055);
  float z = p.z - bias;
  float s = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
      s += texture(uShadow, vec3(p.xy + vec2(float(x), float(y)) * uShadowTexel, z));
  s /= 9.0;
  if (uPcss > 0.5) s = shadowPcss(p, z);
  // Fade the shadow out at the edge of the map so moving past its range has no hard line.
  vec2 e = min(p.xy, 1.0 - p.xy);
  float edge = clamp(min(e.x, e.y) / 0.06, 0.0, 1.0);
  return mix(1.0, s, edge);
}
// Cheap environment for reflections: sky gradient, a fake skyline of rooftops/trees near the horizon, dim ground.
vec3 envRefl(vec3 R){
  float up = R.y;
  vec3 sky = mix(uFogCol, uSkyCol * 1.15, smoothstep(0.0, 0.55, up));
  float az = atan(R.z, R.x);
  float bh = 0.04 + 0.14 * fract(sin(floor(az * 11.0) * 43.7) * 917.3);
  float bld = (1.0 - smoothstep(bh - 0.012, bh + 0.012, up)) * step(-0.02, up);
  sky = mix(sky, uGndCol * 0.45 + uFogCol * 0.12, bld * 0.85);
  vec3 gnd = mix(uFogCol * 0.55, uGndCol * 0.3, smoothstep(0.0, -0.35, up));
  return up > 0.0 ? sky : gnd;
}
// Stable hash + value noise for procedural surface detail (no sin(), so no banding far from the origin).
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return n2(p) * 0.5 + n2(p * 2.03 + 7.1) * 0.3 + n2(p * 4.1 + 3.7) * 0.2; }
void main(){
  // Guarded normalize: a zero-length normal would give NaN, which bloom would smear into a dark blob.
  vec3 n = vN * inversesqrt(max(dot(vN, vN), 1e-12));
  vec3 alb = vC.rgb;
  vec3 V = uCam - vW; float dist = length(V); V /= dist;
  float a = vC.a;
  // Building + ground materials (alpha = -0.05 * id). Detail fades out with distance so it never shimmers.
  float gloss = 0.0, mid = 0.0;
  if (a > -0.48 && a < -0.02) {
    mid = floor(-a * 20.0 + 0.5);
    float fd = 1.0 - smoothstep(18.0, 65.0, dist);
    vec3 an = abs(n);
    bool isFlat = an.y > 0.75;
    vec2 uv = isFlat ? vW.xz : vec2(an.x > an.z ? vW.z : vW.x, vW.y);
    if (mid < 1.5) {            // 1 plaster: stucco grain, soft blotches, rain streaks, grime at the base
      float st = n2(uv * 26.0), bl = fbm(uv * 0.9);
      float streak = n2(vec2(uv.x * 5.0, vW.y * 0.35)) * smoothstep(0.55, 0.0, fract(vW.y / 2.6));
      alb *= (0.9 + 0.2 * bl) * (0.94 + 0.12 * st * fd) * (1.0 - 0.14 * streak);
      alb *= mix(0.76, 1.0, smoothstep(0.0, 0.9, vW.y));
    } else if (mid < 2.5) {     // 2 kawara: glazed clay tiles, channels running down the slope, courses across
      vec2 dn = length(n.xz) > 0.05 ? normalize(n.xz) : vec2(0.0, 1.0);
      vec2 ac = vec2(-dn.y, dn.x);
      float u = dot(vW.xz, ac) / 0.27, v = vW.y / 0.11;
      float fu = fract(u), fv = fract(v);
      n = normalize(n + vec3(ac.x, 0.0, ac.y) * sin(fu * 6.2832) * 0.6 * fd);
      alb *= (0.84 + 0.26 * h21(floor(vec2(u, v)))) * mix(0.55, 1.0, smoothstep(0.0, 0.22, fv));
      alb *= mix(1.0, 0.8, smoothstep(0.36, 0.5, abs(fu - 0.5)) * fd);
      gloss = 0.6;
    } else if (mid < 3.5) {     // 3 wood siding: horizontal boards, grain, per-board tone, overlap shadow
      float b = vW.y / 0.19, bi = floor(b), bf = fract(b);
      float grain = n2(vec2(uv.x * 1.3 + bi * 7.1, b * 9.0)) * 0.6 + n2(vec2(uv.x * 0.25 + bi, b * 31.0)) * 0.4;
      alb *= (0.8 + 0.32 * h21(vec2(bi, 3.7))) * (0.84 + 0.28 * grain * fd);
      alb *= mix(0.5, 1.0, smoothstep(0.0, 0.12, bf));
      if (!isFlat) n = normalize(n + vec3(0.0, (1.0 - smoothstep(0.0, 0.12, bf)) * 0.7 * fd, 0.0));
      gloss = 0.05;
    } else if (mid < 4.5) {     // 4 concrete block wall: 39x19 cm blocks, running bond, mortar, moss at the base
      float row = floor(vW.y / 0.2);
      vec2 g = vec2(uv.x / 0.4 + row * 0.5, vW.y / 0.2), gi = floor(g), gf = fract(g);
      float mortar = 1.0 - smoothstep(0.0, 0.045, min(min(gf.x, 1.0 - gf.x) * 2.0, min(gf.y, 1.0 - gf.y)));
      if (isFlat) mortar = 0.0;
      alb *= (0.86 + 0.2 * h21(gi)) * (0.9 + 0.16 * n2(uv * 30.0) * fd) * (1.0 - 0.28 * mortar * fd);
      alb = mix(alb, vec3(0.19, 0.26, 0.11), (1.0 - smoothstep(0.0, 0.55, vW.y)) * 0.5 * n2(uv * 3.0));
    } else if (mid < 5.5) {     // 5 asphalt: aggregate, repair patches, sparse cracks, oil stains, sparkle
      float ag = n2(vW.xz * 55.0), pt = fbm(vW.xz * 0.12);
      float cr = abs(n2(vW.xz * 0.55) - 0.5), crm = smoothstep(0.5, 0.7, n2(vW.xz * 0.07 + 3.0));
      alb *= (0.82 + 0.34 * ag * fd) * mix(1.0, 0.8, smoothstep(0.62, 0.66, pt));
      alb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.014, cr)) * crm * fd;
      alb *= 1.0 - 0.14 * smoothstep(0.62, 0.82, n2(vW.xz * 0.35 + 13.0));
      n = normalize(n + vec3(ag - 0.5, 0.0, n2(vW.xz * 55.0 + 9.1) - 0.5) * 0.3 * fd);
      gloss = 0.07;
    } else if (mid < 6.5) {     // 6 glass (unlit): reflection added after lighting
      gloss = 1.0;
    } else if (mid < 7.5) {     // 7 concrete paving / sidewalk: slab joints, speckle, stains
      vec2 g = uv / 0.9, gf = fract(g);
      float j = 1.0 - smoothstep(0.0, 0.03, min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y)));
      alb *= (0.9 + 0.12 * h21(floor(g))) * (0.92 + 0.14 * n2(uv * 40.0) * fd) * (1.0 - 0.3 * j * fd);
      alb *= 1.0 - 0.12 * smoothstep(0.55, 0.75, fbm(uv * 0.5));
    } else if (mid < 8.5) {     // 8 corrugated metal: ridges, satin sheen, rust streaks
      float cu = (isFlat ? vW.x : uv.x) / 0.076;
      vec3 across = isFlat ? vec3(1.0, 0.0, 0.0) : (an.x > an.z ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
      n = normalize(n + across * sin(cu * 6.2832) * 0.45 * fd);
      alb = mix(alb, vec3(0.42, 0.24, 0.12), smoothstep(0.62, 0.9, n2(vec2(cu * 0.08, vW.y * 0.6))) * 0.55);
      gloss = 0.3;
    } else {                    // 9 grass / soil: dry patches, clumps
      float m1 = fbm(vW.xz * 0.18), bl = n2(vW.xz * 18.0);
      alb *= mix(vec3(1.0), vec3(1.2, 1.08, 0.7), smoothstep(0.55, 0.78, m1)) * (0.8 + 0.32 * bl * fd);
    }
  }
  float ndl = max(dot(n, uSunDir), 0.0);
  float wrap = max((dot(n, uSunDir) + 0.35) / 1.35, 0.0);
  float sh = shadow(n, ndl);
  vec3 amb = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), mix(24.0, 90.0, uWet)) * mix(0.04, 0.35, uWet) * ndl;
  float sun = mix(ndl, wrap, 0.25) * sh;
  vec3 c = alb * (amb + uSunCol * sun) + uSunCol * spec * sh;
  // Street lamps: warm pools of light on the ground and walls after dark.
  if (uNight > 0.02) {
    vec3 lp = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      if (i >= uLampN) break;
      vec4 L = uLamps[i];
      if (L.w <= 0.0) continue;
      vec3 d = L.xyz - vW; float d2 = dot(d, d);
      float win = clamp(1.0 - d2 / 196.0, 0.0, 1.0);
      float nl = max(dot(n, d * inversesqrt(max(d2, 1e-4))), 0.0) * 0.85 + 0.15;
      lp += uLampC[i] * (L.w * nl * win * win / (1.0 + d2 * 0.12));
    }
    c += alb * lp * uNight * 4.0;
  }
  // Glossy materials (glazed tile, glass, metal): fresnel reflection of the sky + sun glint.
  if (gloss > 0.0) {
    vec3 R = reflect(-V, n);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    vec3 refl = envRefl(R) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 400.0) * 20.0 * sh;
    if (mid > 5.5 && mid < 6.5) c = mix(alb * amb * 0.3, refl, 0.12 + 0.88 * F);
    else c = mix(c, refl, F * gloss) + uSunCol * pow(max(dot(n, H), 0.0), 70.0) * gloss * 0.3 * ndl * sh;
  }
  // Rain: wet surfaces go darker; flat ground picks up puddles, mirror-like reflections and drop ripples.
  if (uWet > 0.01 && a > -0.5 && a < 0.001) {
    float up = clamp((n.y - 0.55) / 0.4, 0.0, 1.0);
    vec2 q = vW.xz * 0.23, qi = floor(q), qf = fract(q);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float h00 = fract(sin(dot(qi, vec2(127.1, 311.7))) * 43758.5453);
    float h10 = fract(sin(dot(qi + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
    float h01 = fract(sin(dot(qi + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    float h11 = fract(sin(dot(qi + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    float vn = mix(mix(h00, h10, qf.x), mix(h01, h11, qf.x), qf.y);
    float pud = smoothstep(0.56, 0.7, vn) * up * smoothstep(0.3, 0.8, uWet);
    float w = uWet * mix(0.4, 1.0, up);
    c *= mix(1.0, 0.6, w * (0.65 + 0.35 * pud));
    if (up > 0.0) {
      vec2 g = vW.xz * 1.6, gi = floor(g), gf = fract(g) - 0.5;
      float ph = fract(uTime * 1.4 + fract(sin(dot(gi, vec2(12.9898, 78.233))) * 43758.5453));
      float rr = length(gf);
      float ring = sin((rr - ph * 0.45) * 42.0) * exp(-rr * 7.0) * (1.0 - ph) * uWet;
      vec3 nr = normalize(n + vec3(gf.x, 0.0, gf.y) * ring * 0.5);
      vec3 R = reflect(-V, nr);
      float ndv = clamp(dot(nr, V), 0.0, 1.0);
      float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
      vec3 refl = envRefl(R) * 0.85 + uSunCol * pow(max(dot(R, uSunDir), 0.0), 320.0) * 10.0 * sh;
      if (uNight > 0.02) {
        // Squash the vertical axis so lamp reflections smear into long streaks, like real wet asphalt.
        vec3 Rs = normalize(vec3(R.x, R.y * 0.3, R.z));
        vec3 lr = vec3(0.0), lm = vec3(0.0);
        for (int i = 0; i < 16; i++) {
          if (i >= uLampN) break;
          vec4 L = uLamps[i];
          if (L.w <= 0.0) continue;
          vec3 d = L.xyz - vW; float ld = length(d);
          vec3 ds = normalize(vec3(d.x, d.y * 0.3, d.z));
          vec3 e = uLampC[i] * L.w * pow(max(dot(Rs, ds), 0.0), 60.0) * 16.0 * uNight / (1.0 + ld * ld * 0.006);
          lr += e; if (dot(e, vec3(1.0)) > dot(lm, vec3(1.0))) lm = e;
        }
        // Many neon signs stacked in one puddle: roll off instead of summing to white.
        lr = lm + (lr - lm) * 0.35;
        refl += lr / (1.0 + dot(lr, vec3(0.3333)) * 0.6);
      }
      // A water film reflects far more than dry asphalt even looking straight down, so keep a floor under F.
      float k = clamp(mix(0.22, 1.0, F) * w * up * mix(0.75, 1.3, pud) + pud * 0.3, 0.0, 0.92);
      c = mix(c, refl, k);
    }
  }
  // Vehicle materials live in negative alpha: -1 clearcoat paint, -2 glass, -3 chrome, -4 rubber, -5 satin metal.
  if (a < -0.5) {
    float m = floor(-a + 0.5);
    float ndv = clamp(dot(n, V), 0.0, 1.0);
    vec3 R = reflect(-V, n);
    float fr = pow(1.0 - ndv, 5.0);
    vec3 refl = envRefl(R) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 700.0) * 45.0 * sh;
    if (uNight > 0.02) {
      for (int i = 0; i < 16; i++) {
        if (i >= uLampN) break;
        vec4 L = uLamps[i];
        if (L.w <= 0.0) continue;
        vec3 d = L.xyz - vW; float ld = length(d);
        refl += uLampC[i] * L.w * pow(max(dot(R, d / max(ld, 1e-3)), 0.0), 260.0) * 14.0 * uNight / (1.0 + ld * ld * 0.015);
      }
    }
    float broad = pow(max(dot(n, H), 0.0), 48.0) * ndl * sh;
    if (m < 1.5) {        // paint: base coat + metallic flake sheen + clearcoat reflection
      float F = 0.05 + 0.95 * fr;
      c = c * (1.0 - F) + alb * uSunCol * broad * 0.45 + refl * F;
    } else if (m < 2.5) { // glass: dark cabin behind, strong fresnel reflection
      float F = 0.1 + 0.9 * fr;
      c = alb * amb * 0.35 * (1.0 - F) + refl * F;
    } else if (m < 3.5) { // chrome: tinted mirror
      c = alb * (refl * 0.85 + amb * 0.08);
    } else if (m < 4.5) { // rubber / textured plastic
      c = c * 0.85 + envRefl(R) * fr * 0.12 + uSunCol * pow(max(dot(n, H), 0.0), 10.0) * 0.025 * ndl * sh;
    } else {              // satin metal (rims, calipers)
      c = c * 0.45 + alb * (envRefl(R) * 0.55 + uSunCol * broad * 0.7);
    }
  }
  // Emissive: alpha <= 0.5 = window (warm, only at night); alpha > 0.5 = self-lit sign/bulb.
  if (a > 0.001) {
    if (a <= 0.5) {
      // Window glass: sky reflection by day; a warm room with curtain folds glowing through at night.
      vec3 R = reflect(-V, n);
      float F = 0.06 + 0.94 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
      vec3 refl = envRefl(R) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 500.0) * 25.0 * sh;
      float lit = a * 2.0;
      float cur = 0.92 + 0.3 * sin((vW.x + vW.z) * 23.0 + sin(vW.y * 3.0));
      c = mix(c * 0.5, refl, clamp(F * mix(0.95, 0.35, uNight * lit) + 0.08, 0.0, 1.0));
      c += uWinCol * lit * uNight * 2.2 * cur;
    }
    else c += alb * ((a - 0.5) * 2.0) * mix(0.35, 2.6, uNight);
  }
  // Distance fog, slightly thicker near the ground.
  float hf = exp(-max(vW.y, 0.0) * 0.035);
  float f = 1.0 - exp(-pow(dist * uFogK * (0.75 + 0.5 * hf), 1.35));
  c = mix(c, uFogCol, clamp(f, 0.0, 1.0));
  // With post-processing on, output linear HDR; tone mapping happens in the composite pass.
  vec3 hc = c * uExposure;
  if (any(isnan(hc)) || any(isinf(hc))) hc = vec3(0.0);
  o = uPost > 0.5 ? vec4(clamp(hc, 0.0, 64.0), 1.0) : vec4(pow(aces(hc), vec3(1.0 / 2.2)), 1.0);
}`;

// Rain streaks: one GL line per drop, animated entirely on the GPU inside a box that follows the camera.
// aD = (x, z, phase) in [0,1) + end flag (0 top, 1 bottom). uRain (0..1) thins the drop count.
const RAIN_VS = `#version 300 es
layout(location = 0) in vec4 aD;
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime, uRain;
out float vA;
void main(){
  const float B = 36.0, H = 22.0;
  float sp = 0.8 + 0.4 * fract(aD.z * 37.0);
  float y = fract(aD.z - uTime * 0.6 * sp);
  vec3 p = vec3(uCam.x + (fract(aD.x - uCam.x / B) - 0.5) * B, uCam.y - 8.0 + y * H, uCam.z + (fract(aD.y - uCam.z / B) - 0.5) * B);
  p += vec3(0.06, -0.62, 0.025) * aD.w;
  float keep = step(fract(aD.x * 91.7 + aD.y * 53.3), uRain);
  float near = length(p - uCam);
  vA = keep * (1.0 - aD.w * 0.7) * clamp(near / 3.0, 0.0, 1.0) * (1.0 - smoothstep(10.0, 18.0, near));
  gl_Position = keep > 0.5 ? uVP * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const RAIN_FS = `#version 300 es
precision mediump float;
in float vA; uniform vec3 uCol; uniform float uPost;
out vec4 o;
void main(){ vec3 c = uCol * vA; o = vec4(uPost > 0.5 ? c : pow(c, vec3(1.0 / 2.2)), 1.0); }`;

const SKY_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vP;
void main(){ vP = P[gl_VertexID]; gl_Position = vec4(vP, 0.9999, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform mat4 uInvVP;
uniform vec3 uCam, uSunDir, uSunCol, uZenith, uHorizon, uFogCol;
uniform float uExposure, uNight, uTime, uPost;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec4 w = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - uCam);
  float up = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.55));
  c = mix(uFogCol, c, smoothstep(-0.08, 0.06, d.y));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25 + pow(sd, 3.0) * 0.08);
  // Soft drifting cloud bands.
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.25) * 1.6 + vec2(uTime * 0.004, 0.0);
    float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
    float cl = smoothstep(0.55, 0.85, n) * smoothstep(0.0, 0.25, d.y);
    vec3 cc = mix(uHorizon * 1.1 + uSunCol * 0.15, uZenith * 0.6, uNight);
    c = mix(c, cc, cl * 0.55);
    // stars
    float s = step(0.9975, h21(floor(d.xz / (d.y + 0.3) * 260.0)));
    c += vec3(s) * uNight * smoothstep(0.1, 0.4, d.y) * 0.9;
  }
  // With post-processing on, output linear HDR; tone mapping happens in the composite pass.
  vec3 hc = c * uExposure;
  if (any(isnan(hc)) || any(isinf(hc))) hc = vec3(0.0);
  o = uPost > 0.5 ? vec4(clamp(hc, 0.0, 64.0), 1.0) : vec4(pow(aces(hc), vec3(1.0 / 2.2)), 1.0);
}`;

const SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

const SHADOW_FS = `#version 300 es
precision highp float;
void main(){}`;

// ---- Post-processing ----
const POST_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUV;
void main(){ vec2 p = P[gl_VertexID]; vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Bright pass + first downsample. Soft knee so glow fades in instead of switching on.
const PRE_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh, uKnee;
out vec4 o;
// Sanitized sample: any NaN/Inf/negative pixel is dropped so it can never spread through the blur chain.
vec3 S(vec2 d){ vec3 c = texture(uSrc, vUV + uTexel * d).rgb; return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 64.0); }
void main(){
  vec3 s = S(vec2(-1.0, -1.0)) + S(vec2(1.0, -1.0)) + S(vec2(-1.0, 1.0)) + S(vec2(1.0, 1.0));
  s *= 0.25;
  float br = max(s.r, max(s.g, s.b));
  float rq = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee);
  rq = rq * rq / (4.0 * uKnee + 1e-4);
  float wgt = max(rq, br - uThresh) / max(br, 1e-4);
  o = vec4(min(s * wgt, vec3(24.0)), 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uSrc; uniform vec2 uTexel;
out vec4 o;
void main(){
  vec3 c = texture(uSrc, vUV).rgb * 4.0;
  c += texture(uSrc, vUV + uTexel * vec2(-1.0, -1.0)).rgb + texture(uSrc, vUV + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1.0, 1.0)).rgb + texture(uSrc, vUV + uTexel * vec2(1.0, 1.0)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;

// 9-tap tent upsample, added on top of the next-larger level (additive blend).
const UP_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uSrc; uniform vec2 uTexel;
out vec4 o;
vec3 T(float x, float y){ return texture(uSrc, vUV + uTexel * vec2(x, y)).rgb; }
void main(){
  vec3 c = T(-1.0,-1.0) + T(1.0,-1.0) + T(-1.0,1.0) + T(1.0,1.0)
         + 2.0 * (T(0.0,-1.0) + T(-1.0,0.0) + T(1.0,0.0) + T(0.0,1.0)) + 4.0 * T(0.0,0.0);
  o = vec4(c / 16.0, 1.0);
}`;

const FINAL_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uHdr, uBloom, uFx, uDepth, uVol;
uniform float uBloomK, uVig, uTime, uUltra, uVolOn;
uniform vec2 uRes;
uniform vec3 uSun, uSunCol;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c;
  vec3 bl = texture(uBloom, vUV).rgb;
  if (uUltra > 0.5) {
    // Lens: a whisper of chromatic fringing toward the frame edges.
    vec2 dq = vUV - 0.5; float r2 = dot(dq, dq);
    vec2 off = dq * r2 * 0.010;
    c = vec3(texture(uHdr, vUV + off).r, texture(uHdr, vUV).g, texture(uHdr, vUV - off).b);
    // Ambient occlusion (emissive neon/lamps stay bright) + screen-space reflections on wet ground.
    vec4 fx = texture(uFx, vUV);
    float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = c * mix(fx.a, 1.0, smoothstep(1.2, 5.0, l0)) + fx.rgb;
    if (uVolOn > 0.5) {
      vec2 vt = 2.0 / uRes;
      c += texture(uVol, vUV).rgb * 0.4 + (texture(uVol, vUV + vt).rgb + texture(uVol, vUV - vt).rgb + texture(uVol, vUV + vec2(vt.x, -vt.y)).rgb + texture(uVol, vUV + vec2(-vt.x, vt.y)).rgb) * 0.15;
    }
    // Sun shafts: march toward the sun counting open sky; buildings and trees cut the beams.
    if (uSun.z > 0.001) {
      vec2 dl = (uSun.xy - vUV) / 64.0;
      vec2 uv = vUV + dl * h21(gl_FragCoord.xy);
      float acc = 0.0, dec = 1.0;
      for (int i = 0; i < 64; i++) {
        uv += dl;
        acc += step(0.999999, texture(uDepth, clamp(uv, 0.001, 0.999)).r) * dec;
        dec *= 0.978;
      }
      float sd = length((vUV - uSun.xy) * vec2(uRes.x / uRes.y, 1.0));
      c += uSunCol * (acc / 64.0) * exp(-sd * 1.7) * uSun.z * (uVolOn > 0.5 ? 0.16 : 0.3);
    }
    // Lens ghosts + halo from the bloom buffer (headlights, neon, the sun).
    vec2 g = vec2(1.0) - vUV, gv = (vec2(0.5) - g) * 0.42;
    vec3 gh = vec3(0.0);
    for (int i = 1; i < 5; i++) {
      vec2 gu = g + gv * float(i);
      float w = pow(1.0 - clamp(length(vec2(0.5) - gu) / 0.71, 0.0, 1.0), 6.0);
      gh += texture(uBloom, gu).rgb * w * vec3(1.0 - 0.15 * float(i), 0.9, 0.75 + 0.12 * float(i));
    }
    vec2 hu = g + normalize(vec2(0.5) - g + 1e-5) * 0.46;
    float hw = pow(1.0 - clamp(length(vec2(0.5) - hu) / 0.71, 0.0, 1.0), 5.0);
    gh += texture(uBloom, hu).rgb * hw * vec3(0.8, 0.9, 1.1);
    bl += gh * 0.06;
  } else {
    c = texture(uHdr, vUV).rgb;
  }
  c += bl * uBloomK;
  c = aces(c);
  // Gentle grade: a touch more saturation.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.07), 0.0);
  if (uUltra > 0.5) {
    // Filmic finish: soft S-curve, cool shadows, warm highlights.
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.14);
    c *= mix(vec3(0.97, 1.0, 1.04), vec3(1.035, 1.0, 0.965), smoothstep(0.15, 0.75, l));
  }
  c = pow(c, vec3(1.0 / 2.2));
  // Vignette (aspect-corrected) and a 1/255 dither so the sky gradient never bands.
  vec2 q = vUV - 0.5; q.x *= uRes.x / uRes.y;
  c *= 1.0 - smoothstep(0.3, 1.15, length(q)) * uVig;
  if (uUltra > 0.5) c += (h21(gl_FragCoord.xy * 1.37 + fract(uTime * 13.0) * 97.0) - 0.5) * 0.014 * (1.0 - l);
  c += (h21(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

// Ultra: half-res screen-space ambient occlusion (a) + wet-ground screen-space reflections (rgb).
const FX_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uDepth, uScene;
uniform mat4 uVP, uInvVP;
uniform vec3 uCam;
uniform vec2 uTexel;
uniform float uWet, uTime;
out vec4 o;
const float NEAR = 0.1, FAR = 900.0;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * NEAR * FAR / (FAR + NEAR - z * (FAR - NEAR)); }
vec3 wp(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float d = texture(uDepth, vUV).r;
  if (d >= 0.999999) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 P = wp(vUV, d);
  vec2 tx = vec2(uTexel.x * 2.0, 0.0), ty = vec2(0.0, uTexel.y * 2.0);
  vec3 Pr = wp(vUV + tx, texture(uDepth, vUV + tx).r), Pl = wp(vUV - tx, texture(uDepth, vUV - tx).r);
  vec3 Pu = wp(vUV + ty, texture(uDepth, vUV + ty).r), Pd = wp(vUV - ty, texture(uDepth, vUV - ty).r);
  vec3 dx = length(Pr - P) < length(P - Pl) ? Pr - P : P - Pl;
  vec3 dy = length(Pu - P) < length(P - Pd) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy) + 1e-7);
  vec3 toC = uCam - P; float dist = length(toC);
  if (dot(N, toC) < 0.0) N = -N;
  vec3 T = normalize(abs(N.y) < 0.95 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
  vec3 Bt = cross(N, T);
  float rot = ign(gl_FragCoord.xy) * 6.2831853, jit = h21(gl_FragCoord.xy + 17.0);
  float R = 0.6 + dist * 0.008, lp = lin(d), occ = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i), u = (fi + jit) / 24.0, a = rot + fi * 2.39996323;
    vec3 dir = (T * cos(a) + Bt * sin(a)) * sqrt(u) + N * sqrt(1.0 - u);
    float k = (fi + 0.5) / 24.0;
    vec4 cs = uVP * vec4(P + N * 0.03 + dir * R * mix(0.12, 1.0, k * k), 1.0);
    if (cs.w <= 0.0) continue;
    vec3 nd = cs.xyz / cs.w; vec2 su = nd.xy * 0.5 + 0.5;
    if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) continue;
    float sd = lin(texture(uDepth, su).r);
    occ += step(0.02, lin(nd.z * 0.5 + 0.5) - sd) * smoothstep(0.0, 1.0, R / max(abs(lp - sd), 1e-3));
  }
  float ao = 1.0 - occ / 24.0;
  ao = mix(1.0, ao, smoothstep(90.0, 25.0, dist));
  ao = clamp(pow(max(ao, 0.0), 1.6), 0.0, 1.0);
  vec3 refl = vec3(0.0);
  if (uWet > 0.02 && N.y > 0.92 && P.y < 0.6) {
    vec2 q = P.xz * 0.23, qi = floor(q), qf = fract(q);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float vn = mix(mix(hs(qi), hs(qi + vec2(1.0, 0.0)), qf.x), mix(hs(qi + vec2(0.0, 1.0)), hs(qi + vec2(1.0, 1.0)), qf.x), qf.y);
    float pud = smoothstep(0.56, 0.7, vn) * smoothstep(0.3, 0.8, uWet);
    float kw = uWet * (0.22 + 0.78 * pud);
    vec3 V = normalize(P - uCam);
    vec2 jn = vec2(h21(P.xz * 3.1 + uTime), h21(P.xz * 2.7 - uTime)) - 0.5;
    vec3 Nr = normalize(vec3(jn.x * (1.0 - pud) * 0.06, 1.0, jn.y * (1.0 - pud) * 0.06));
    vec3 Rd = reflect(V, Nr);
    float F = 0.02 + 0.98 * pow(1.0 - clamp(-dot(V, Nr), 0.0, 1.0), 5.0);
    float t = 0.2 * (0.75 + 0.5 * jit), tp = 0.0, fade = 0.0;
    vec2 hit = vec2(-1.0);
    for (int i = 0; i < 96; i++) {
      vec4 cq = uVP * vec4(P + Rd * t, 1.0);
      if (cq.w <= 0.0) break;
      vec3 nq = cq.xyz / cq.w; vec2 qu = nq.xy * 0.5 + 0.5;
      if (qu.x < 0.0 || qu.x > 1.0 || qu.y < 0.0 || qu.y > 1.0) break;
      float sd = texture(uDepth, qu).r, zs = lin(sd), zq = lin(nq.z * 0.5 + 0.5);
      if (sd < 0.999999 && zq > zs && zq - zs < max(0.6, t * 0.12)) {
        float a0 = tp, a1 = t;
        for (int j = 0; j < 8; j++) {
          float am = 0.5 * (a0 + a1);
          vec4 cm = uVP * vec4(P + Rd * am, 1.0);
          vec3 nm = cm.xyz / cm.w; vec2 um = nm.xy * 0.5 + 0.5;
          if (lin(nm.z * 0.5 + 0.5) > lin(texture(uDepth, um).r)) { a1 = am; qu = um; } else { a0 = am; }
        }
        hit = qu;
        vec2 e = smoothstep(0.0, 0.08, qu) * smoothstep(1.0, 0.92, qu);
        fade = e.x * e.y * (1.0 - float(i) / 96.0);
        break;
      }
      tp = t; t = t * 1.075 + 0.035;
    }
    if (hit.x >= 0.0) refl = min(texture(uScene, hit).rgb, vec3(24.0)) * kw * mix(0.18, 1.0, F) * fade * smoothstep(80.0, 30.0, dist);
  }
  o = vec4(refl, ao);
}`;

// Ultra: volumetric light. Ray-march the sun's shadow map through height fog (light shafts that
// real buildings and trees cut), plus analytic in-scattering around the nearest street lamps.
const VOL_FS = `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler2DShadow;
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2DShadow uShadow;
uniform mat4 uInvVP, uLightVP;
uniform vec3 uCam, uSunDir, uSunCol;
uniform float uSunK, uLampK, uDens, uShadowOn;
uniform vec4 uLamps[16]; uniform vec3 uLampC[16]; uniform int uLampN;
out vec4 o;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 wp(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
void main(){
  float d = texture(uDepth, vUV).r;
  vec3 P = wp(vUV, min(d, 0.99999));
  vec3 V = P - uCam; float L = length(V); V /= max(L, 1e-4);
  if (d >= 0.999999) L = 160.0;
  vec3 col = vec3(0.0);
  if (uSunK > 0.001) {
    float Lm = min(L, 110.0), st = Lm / 56.0, j = ign(gl_FragCoord.xy), acc = 0.0;
    for (int i = 0; i < 56; i++) {
      vec3 X = uCam + V * (st * (float(i) + j));
      vec4 ls = uLightVP * vec4(X, 1.0);
      vec3 q = ls.xyz / ls.w * 0.5 + 0.5;
      float lit = 1.0;
      if (uShadowOn > 0.5 && q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && q.z < 1.0) lit = texture(uShadow, vec3(q.xy, q.z - 0.0012));
      acc += lit * exp(-max(X.y, 0.0) * 0.045);
    }
    float c = dot(V, uSunDir), g = 0.58, g2 = g * g;
    float ph = mix(0.0796, (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)), 0.75);
    col += uSunCol * (acc * st * uDens * ph * uSunK);
  }
  if (uLampK > 0.001) {
    for (int i = 0; i < 16; i++) {
      if (i >= uLampN) break;
      vec4 Lp = uLamps[i];
      if (Lp.w <= 0.0) continue;
      vec3 w = Lp.xyz - uCam; float tc = dot(w, V);
      float h = sqrt(max(dot(w, w) - tc * tc, 0.09));
      float I = (atan((min(L, 120.0) - tc) / h) - atan(-tc / h)) / h;
      col += uLampC[i] * (Lp.w * I * uLampK);
    }
  }
  o = vec4(col, 1.0);
}`;

// Depth-aware 5x5 blur for the half-res effects buffer (keeps AO from bleeding across edges).
const FXBLUR_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uSrc, uDepth;
uniform vec2 uTexel;
out vec4 o;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * 0.1 * 900.0 / (900.1 - z * 899.9); }
void main(){
  float dc = lin(texture(uDepth, vUV).r);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
      float w = exp(-float(x * x + y * y) * 0.18) * exp(-abs(lin(texture(uDepth, uv).r) - dc) / max(dc * 0.02, 0.05));
      acc += texture(uSrc, uv) * w; ws += w;
    }
  }
  o = acc / max(ws, 1e-4);
}`;

export class WebGLUnavailable extends Error {}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance', alpha: false });
    if (!gl) throw new WebGLUnavailable('WebGL2 is not available in this browser.');
    this.gl = gl;
    // Detect a software rasterizer and dial the shadow map down so it doesn't crater the frame rate.
    let soft = false;
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rend = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      soft = /swiftshader|software|llvmpipe|basic|microsoft/i.test(String(rend));
    } catch (e) {}
    this.soft = soft;
    SHADOW_SIZE = soft ? 1024 : 2048;
    this.world = this.program(WORLD_VS, WORLD_FS);
    this.sky = this.program(SKY_VS, SKY_FS);
    this.shadowP = this.program(SHADOW_VS, SHADOW_FS);
    try { this.initRain(); } catch (e) { console.warn('rain disabled:', e && e.message); this.rainP = null; }
    this.skyVao = gl.createVertexArray();
    this.view = mat4(); this.proj = mat4(); this.vp = mat4(); this.inv = mat4(); this.ident = mat4();
    this.lView = mat4(); this.lProj = mat4(); this.lVP = mat4();
    this.camPos = [0, 0, 0];
    this.scale = 1;
    this.stats = { draws: 0, tris: 0 };
    // Queued draw list (parallel arrays; model matrices pooled to avoid per-frame allocation).
    this.qMesh = []; this.qModel = []; this.qCast = []; this.n = 0;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    this.shadowOK = this.initShadow();
    this.postOn = true;
    this.postOK = this.initPost();
    this.setQuality('high');
  }

  // Switch graphics preset at runtime. The shadow map is reallocated only when its size changes.
  setQuality(q) {
    const P = QUALITY[q] || QUALITY.high, gl = this.gl;
    this.quality = QUALITY[q] ? q : 'high'; this.Q = P;
    this.scale = P.scale; this.postOn = P.post;
    this.rainLimit = P.rain; this.drawDist = P.draw; this.lodDist = P.lod;
    if (this.postOK) {
      const want = this.soft ? 0 : Math.min(P.msaa || 4, this.maxSamples || 0);
      if (want !== this.samplesWant || !!P.fx !== !!this.fxWant || !!P.fxFull !== !!this.fxFullWant) { this.samplesWant = want; this.samples = want; this.fxWant = !!P.fx; this.fxFullWant = !!P.fxFull; this.freePost(); this.pw = 0; this.ph = 0; }
    }
    let size = this.soft ? Math.min(1024, P.shadow) : P.shadow;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    size = Math.min(size, max);
    if (size !== SHADOW_SIZE) {
      if (this.shadowTex) gl.deleteTexture(this.shadowTex);
      if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo);
      SHADOW_SIZE = size;
      this.shadowOK = this.initShadow();
    }
    return this.quality;
  }

  initShadow() {
    const gl = this.gl;
    try {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.shadowTex = tex; this.shadowFbo = fbo;
      if (status !== gl.FRAMEBUFFER_COMPLETE) { console.warn('[HINODE] shadow map unavailable (' + status + '); rendering without shadows'); return false; }
      return true;
    } catch (e) { console.warn('[HINODE] shadow map init failed; rendering without shadows: ' + e.message); return false; }
  }

  initPost() {
    const gl = this.gl;
    this.pw = 0; this.ph = 0; this.bloom = []; this.msFbo = null; this.sceneFbo = null; this.sceneTex = null; this.postRes = null;
    try {
      if (!gl.getExtension('EXT_color_buffer_float')) { console.warn('[HINODE] float render targets unavailable; post-processing off'); return false; }
      let max = 0;
      try { const sm = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES); max = sm && sm.length ? sm[0] : 0; } catch (e) {}
      this.maxSamples = max;
      this.samples = this.soft ? 0 : Math.min(4, max); this.samplesWant = this.samples;
      this.bloomLevels = this.soft ? 4 : 6;
      this.pp = {
        pre: this.program(POST_VS, PRE_FS), down: this.program(POST_VS, DOWN_FS),
        up: this.program(POST_VS, UP_FS), final: this.program(POST_VS, FINAL_FS),
      };
      try { this.fxP = { fx: this.program(POST_VS, FX_FS), blur: this.program(POST_VS, FXBLUR_FS) }; }
      catch (e) { console.warn('[HINODE] ultra effects unavailable: ' + e.message); this.fxP = null; }
      if (this.fxP) { try { this.fxP.vol = this.program(POST_VS, VOL_FS); } catch (e) { console.warn('[HINODE] volumetric light unavailable: ' + e.message); } }
      return true;
    } catch (e) { console.warn('[HINODE] post-processing init failed: ' + e.message); return false; }
  }

  freePost() {
    const gl = this.gl, R = this.postRes;
    if (R) { R.tex.forEach((t) => gl.deleteTexture(t)); R.fbo.forEach((f) => gl.deleteFramebuffer(f)); R.rb.forEach((b) => gl.deleteRenderbuffer(b)); }
    this.postRes = null; this.msFbo = null; this.sceneFbo = null; this.sceneTex = null; this.bloom = []; this.fxRes = null;
  }

  // (Re)allocate the HDR scene buffer and bloom chain for the current canvas size.
  resizePost(W, H) {
    if (W === this.pw && H === this.ph) return this.postOK;
    const gl = this.gl;
    this.freePost();
    this.pw = W; this.ph = H;
    // Supersampled frames already anti-alias; cap MSAA by pixel count so 4K-class buffers stay in VRAM.
    if (this.samplesWant != null) this.samples = Math.min(this.samplesWant, W * H > 12e6 ? 2 : W * H > 4.2e6 ? 4 : 8);
    const R = this.postRes = { tex: [], fbo: [], rb: [] };
    const tex = (w, h) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      R.tex.push(t); return t;
    };
    const fboFor = (t) => {
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      R.fbo.push(f); return f;
    };
    const rb = (samples, fmt) => {
      const b = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b);
      if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, W, H);
      else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, W, H);
      R.rb.push(b); return b;
    };
    let ok = true;
    try {
      this.sceneTex = tex(W, H);
      this.sceneFbo = fboFor(this.sceneTex);
      if (this.samples > 0) {
        // Multisampled float target for anti-aliasing; resolved into sceneTex each frame.
        const c = rb(this.samples, gl.RGBA16F), d = rb(this.samples, gl.DEPTH_COMPONENT24);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); R.fbo.push(f);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) this.msFbo = f;
        else { console.warn('[HINODE] MSAA float buffer unavailable; using non-MSAA HDR'); this.samples = 0; this.samplesWant = 0; }
      }
      let depthTex = null;
      if (this.fxWant && this.fxP) {
        depthTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, depthTex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, W, H);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        R.tex.push(depthTex);
      }
      if (!this.msFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
        if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
        else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb(0, gl.DEPTH_COMPONENT24));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
      let w = W, h = H;
      for (let i = 0; i < this.bloomLevels; i++) {
        w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
        if (i > 0 && (w < 8 || h < 8)) break;
        const t = tex(w, h), f = fboFor(t);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
        this.bloom.push({ tex: t, fbo: f, w, h });
      }
      if (depthTex) {
        let fxok = true, depthFbo = null;
        if (this.msFbo) {
          depthFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo); R.fbo.push(depthFbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
          gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fxok = false;
        }
        const full = !!(this.Q && this.Q.fxFull), hw = full ? W : Math.max(1, W >> 1), hh = full ? H : Math.max(1, H >> 1);
        const vw = Math.max(1, W >> 1), vh = Math.max(1, H >> 1), tv = tex(vw, vh), fv = fboFor(tv);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fxok = false;
        const ta = tex(hw, hh), fa = fboFor(ta);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fxok = false;
        const tb = tex(hw, hh), fb = fboFor(tb);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fxok = false;
        this.fxRes = fxok ? { depthTex, depthFbo, a: { tex: ta, fbo: fa, w: hw, h: hh }, b: { tex: tb, fbo: fb, w: hw, h: hh }, v: { tex: tv, fbo: fv, w: vw, h: vh } } : null;
        if (!fxok) console.warn('[HINODE] ultra effect buffers incomplete; ultra effects off');
      }
    } catch (e) { ok = false; console.warn('[HINODE] post buffers failed: ' + e.message); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok || !this.bloom.length) { console.warn('[HINODE] HDR buffers incomplete; post-processing off'); this.freePost(); this.postOK = false; return false; }
    return true;
  }

  program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Shader link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  initRain(N = 12000) {
    const gl = this.gl;
    this.rainP = this.program(RAIN_VS, RAIN_FS);
    const d = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), z = Math.random(), y = Math.random();
      d.set([x, z, y, 0, x, z, y, 1], i * 8);
    }
    this.rainVao = gl.createVertexArray(); gl.bindVertexArray(this.rainVao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.rainCount = N * 2;
  }

  mesh(builder) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, loc, size) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const bufs = [buf(builder.pos, 0, 3), buf(builder.nor, 1, 3), buf(builder.col, 2, 4)];
    gl.bindVertexArray(null);
    // Bounding sphere (model space) so the shadow pass can skip meshes outside the sun's view.
    const P = builder.pos; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i];
      if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1];
      if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2];
    }
    const c = P.length ? [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] : [0, 0, 0];
    const rad = P.length ? Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 : 0;
    return { vao, bufs, count: P.length / 3, c, rad };
  }

  dispose(mesh) {
    const gl = this.gl;
    for (const b of mesh.bufs) gl.deleteBuffer(b);
    gl.deleteVertexArray(mesh.vao);
  }

  resize() {
    let dpr = Math.min(Math.min(window.devicePixelRatio || 1, 2) * this.scale * (this.resMul || 1), 3);
    dpr = Math.min(dpr, Math.sqrt(36e6 / Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight)));
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return w / h;
  }

  // cam: { pos:[x,y,z], target:[x,y,z], fov }; env: lighting state from the sky/time system.
  begin(cam, env) {
    const aspect = this.resize();
    this.gpuBegin();
    perspective(this.proj, cam.fov, aspect, 0.1, 900);
    lookAt(this.view, cam.pos[0], cam.pos[1], cam.pos[2], cam.target[0], cam.target[1], cam.target[2]);
    multiply(this.vp, this.proj, this.view);
    invert(this.inv, this.vp);
    this.camPos = cam.pos;
    this.cam = cam;
    this.env = env;
    this.n = 0;
    this.stats.draws = 0; this.stats.tris = 0;
  }

  // Queue a mesh. castShadow=false for fake blob shadows, floating markers, etc.
  draw(mesh, model = this.ident, castShadow = true) {
    const i = this.n++;
    let m = this.qModel[i]; if (!m) m = this.qModel[i] = new Float32Array(16);
    m.set(model);
    this.qMesh[i] = mesh; this.qCast[i] = castShadow;
  }

  // Build the sun's light-space matrix, centred on what the camera looks at, snapped to texels.
  lightMatrix() {
    const sd = this.env.sunDir, c = this.cam.target;
    const S = 46, D = 140;
    const up = Math.abs(sd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    lookAt(this.lView, c[0] + sd[0] * D, c[1] + sd[1] * D, c[2] + sd[2] * D, c[0], c[1], c[2], up[0], up[1], up[2]);
    ortho(this.lProj, -S, S, -S, S, 1, D * 2);
    multiply(this.lVP, this.lProj, this.lView);
    // Texel snap: nudge the projection so the centre lands on a whole texel (kills edge shimmer).
    const m = this.lVP, cw = m[3] * c[0] + m[7] * c[1] + m[11] * c[2] + m[15];
    const cx = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
    const cy = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
    const sx = (cx / cw) * 0.5 + 0.5, sy = (cy / cw) * 0.5 + 0.5;
    const tx = (Math.round(sx * SHADOW_SIZE) / SHADOW_SIZE - sx) * 2;
    const ty = (Math.round(sy * SHADOW_SIZE) / SHADOW_SIZE - sy) * 2;
    this.lProj[12] += tx; this.lProj[13] += ty;
    multiply(this.lVP, this.lProj, this.lView);
  }

  end() {
    const gl = this.gl, env = this.env, cam = this.cam;

    // ---- Shadow pass: render scene depth from the sun ----
    if (this.shadowOK) {
      this.lightMatrix();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3.0);
      const sp = this.shadowP;
      gl.useProgram(sp.p);
      gl.uniformMatrix4fv(sp.u.uLightVP, false, this.lVP);
      const L = this.lVP, lim = 1 / 46;
      for (let i = 0; i < this.n; i++) {
        if (!this.qCast[i]) continue;
        const mesh = this.qMesh[i], M = this.qModel[i];
        if (mesh.c) {
          // World-space centre, then light-space NDC; skip if the sphere is fully outside the map.
          const c = mesh.c, wx = M[0] * c[0] + M[4] * c[1] + M[8] * c[2] + M[12];
          const wy = M[1] * c[0] + M[5] * c[1] + M[9] * c[2] + M[13], wz = M[2] * c[0] + M[6] * c[1] + M[10] * c[2] + M[14];
          const lx = L[0] * wx + L[4] * wy + L[8] * wz + L[12], ly = L[1] * wx + L[5] * wy + L[9] * wz + L[13];
          const r = 1 + mesh.rad * lim;
          if (lx > r || lx < -r || ly > r || ly < -r) continue;
        }
        gl.uniformMatrix4fv(sp.u.uModel, false, M);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ---- Main pass (into the HDR buffer when post-processing is available) ----
    const W = this.canvas.width, Hh = this.canvas.height;
    const post = this.postOK && this.postOn && this.resizePost(W, Hh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? (this.msFbo || this.sceneFbo) : null);
    gl.viewport(0, 0, W, Hh);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky first, depth test passes only where nothing else will draw (z = far).
    const s = this.sky;
    gl.useProgram(s.p);
    gl.depthMask(false);
    gl.uniformMatrix4fv(s.u.uInvVP, false, this.inv);
    gl.uniform3fv(s.u.uCam, cam.pos);
    gl.uniform3fv(s.u.uSunDir, env.sunDir);
    gl.uniform3fv(s.u.uSunCol, env.sunCol);
    gl.uniform3fv(s.u.uZenith, env.zenith);
    gl.uniform3fv(s.u.uHorizon, env.horizon);
    gl.uniform3fv(s.u.uFogCol, env.fog);
    gl.uniform1f(s.u.uExposure, env.exposure);
    gl.uniform1f(s.u.uNight, env.night);
    gl.uniform1f(s.u.uTime, env.time);
    gl.uniform1f(s.u.uPost, post ? 1 : 0);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    const w = this.world;
    gl.useProgram(w.p);
    gl.uniformMatrix4fv(w.u.uVP, false, this.vp);
    gl.uniform3fv(w.u.uCam, cam.pos); this.fxCam = cam.pos;
    gl.uniform3fv(w.u.uSunDir, env.sunDir);
    gl.uniform3fv(w.u.uSunCol, env.sunCol);
    gl.uniform3fv(w.u.uSkyCol, env.sky);
    gl.uniform3fv(w.u.uGndCol, env.ground);
    gl.uniform3fv(w.u.uFogCol, env.fog);
    gl.uniform3fv(w.u.uWinCol, env.window);
    gl.uniform1f(w.u.uFogK, env.fogK);
    gl.uniform1f(w.u.uNight, env.night);
    gl.uniform1f(w.u.uExposure, env.exposure);
    gl.uniform1f(w.u.uWet, env.wet || 0);
    if (w.u.uTime) gl.uniform1f(w.u.uTime, env.time || 0);
    const uL = w.u.uLamps || w.u['uLamps[0]'];
    if (uL) gl.uniform4fv(uL, env.lampBuf || this.noLamps || (this.noLamps = new Float32Array(64)));
    const uLC = w.u.uLampC || w.u['uLampC[0]'];
    if (uLC) gl.uniform3fv(uLC, env.lampColBuf || this.noLampC || (this.noLampC = new Float32Array(48)));
    if (w.u.uLampN) gl.uniform1i(w.u.uLampN, this.quality === 'low' ? 8 : 16);
    if (w.u.uLampCol) gl.uniform3fv(w.u.uLampCol, env.lampCol || [1.0, 0.72, 0.42]);
    gl.uniform1f(w.u.uPost, post ? 1 : 0);
    gl.uniform1f(w.u.uShadowOn, this.shadowOK ? 1 : 0);
    if (this.shadowOK) {
      gl.uniformMatrix4fv(w.u.uLightVP, false, this.lVP);
      gl.uniform2f(w.u.uShadowTexel, 1 / SHADOW_SIZE, 1 / SHADOW_SIZE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(w.u.uShadow, 0);
    }
    // Ultra soft shadows read the same depth map raw (no compare) through a sampler object on unit 7.
    if (!this.rawSampler) {
      const s = this.rawSampler = gl.createSampler();
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(s, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    }
    const pcss = !!(this.shadowOK && this.Q && this.Q.pcss);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, pcss ? this.shadowTex : null); gl.bindSampler(7, this.rawSampler);
    if (w.u.uShadowRaw) gl.uniform1i(w.u.uShadowRaw, 7);
    if (w.u.uPcss) gl.uniform1f(w.u.uPcss, pcss ? 1 : 0);
    if (w.u.uShadowRange) gl.uniform1f(w.u.uShadowRange, 279);
    if (w.u.uShadowWorld) gl.uniform1f(w.u.uShadowWorld, 92 / SHADOW_SIZE);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < this.n; i++) {
      const mesh = this.qMesh[i];
      gl.uniformMatrix4fv(w.u.uModel, false, this.qModel[i]);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      this.stats.draws++; this.stats.tris += mesh.count / 3;
    }
    // Rain streaks: additive, depth-tested against the scene but never writing depth.
    if (this.rainP && env.rain > 0.01) {
      const rp = this.rainP;
      gl.useProgram(rp.p);
      gl.uniformMatrix4fv(rp.u.uVP, false, this.vp);
      gl.uniform3fv(rp.u.uCam, cam.pos);
      gl.uniform1f(rp.u.uTime, env.time || 0);
      gl.uniform1f(rp.u.uRain, env.rain);
      gl.uniform3fv(rp.u.uCol, env.rainCol || [0.3, 0.33, 0.37]);
      gl.uniform1f(rp.u.uPost, post ? 1 : 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.bindVertexArray(this.rainVao);
      gl.drawArrays(gl.LINES, 0, Math.min(this.rainCount, (this.rainLimit || 7000) * 2));
      gl.depthMask(true); gl.disable(gl.BLEND);
      this.stats.draws++;
    }
    gl.bindVertexArray(null);
    if (post) this.postProcess(W, Hh, env);
    this.gpuEnd();
  }

  // GPU frame time via EXT_disjoint_timer_query_webgl2 (shown in the FPS counter when the browser exposes it).
  gpuBegin() {
    const gl = this.gl;
    if (this.tq === undefined) { try { this.tq = gl.getExtension('EXT_disjoint_timer_query_webgl2') || null; } catch (e) { this.tq = null; } this.qs = []; }
    const X = this.tq; if (!X) return;
    if (this.qOn) { gl.endQuery(X.TIME_ELAPSED_EXT); this.qOn = false; gl.deleteQuery(this.qs.pop()); }
    this.gpuPoll();
    if (this.qs.length < 5) { const q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); this.qs.push(q); this.qOn = true; }
  }

  gpuEnd() { if (this.qOn && this.tq) { this.gl.endQuery(this.tq.TIME_ELAPSED_EXT); this.qOn = false; } }

  gpuPoll() {
    const gl = this.gl, X = this.tq;
    const disj = gl.getParameter(X.GPU_DISJOINT_EXT);
    while (this.qs.length) {
      const q = this.qs[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q); this.qs.shift();
      if (!disj && ns > 0) { const ms = ns / 1e6; this.gpuMs = this.gpuMs ? this.gpuMs * 0.92 + ms * 0.08 : ms; }
    }
  }

  // Bloom chain + final composite to the screen.
  postProcess(W, H, env) {
    const gl = this.gl, P = this.pp, B = this.bloom, L = B.length;
    if (this.msFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sceneFbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    const FX = this.fxRes && this.fxP && this.Q && this.Q.fx && this.fxOn !== false ? this.fxRes : null;
    if (FX && this.msFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, FX.depthFbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.bindVertexArray(this.skyVao);
    gl.activeTexture(gl.TEXTURE0);
    const pass = (prog, dst, src, sw, sh) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
      gl.useProgram(prog.p); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(prog.u.uSrc, 0); gl.uniform2f(prog.u.uTexel, 1 / sw, 1 / sh);
    };
    pass(P.pre, B[0], this.sceneTex, W, H);
    gl.uniform1f(P.pre.u.uThresh, env.bloomThreshold ?? 1.05);
    gl.uniform1f(P.pre.u.uKnee, 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (let i = 1; i < L; i++) { pass(P.down, B[i], B[i - 1].tex, B[i - 1].w, B[i - 1].h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = L - 1; i > 0; i--) { pass(P.up, B[i - 1], B[i].tex, B[i].w, B[i].h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    gl.disable(gl.BLEND);
    let sx = 0, sy = 0, sk = 0;
    if (FX) {
      const X = this.fxP.fx;
      gl.bindFramebuffer(gl.FRAMEBUFFER, FX.a.fbo); gl.viewport(0, 0, FX.a.w, FX.a.h);
      gl.useProgram(X.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FX.depthTex); gl.uniform1i(X.u.uDepth, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(X.u.uScene, 1);
      gl.uniformMatrix4fv(X.u.uVP, false, this.vp); gl.uniformMatrix4fv(X.u.uInvVP, false, this.inv);
      gl.uniform3fv(X.u.uCam, this.fxCam || [0, 0, 0]);
      gl.uniform2f(X.u.uTexel, 1 / W, 1 / H);
      gl.uniform1f(X.u.uWet, env.wet || 0); gl.uniform1f(X.u.uTime, env.time || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const Bp = this.fxP.blur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, FX.b.fbo);
      gl.useProgram(Bp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FX.a.tex); gl.uniform1i(Bp.u.uSrc, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, FX.depthTex); gl.uniform1i(Bp.u.uDepth, 1);
      gl.uniform2f(Bp.u.uTexel, 1 / FX.a.w, 1 / FX.a.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
      const d = env.sunDir, m = this.vp, c = this.fxCam || [0, 0, 0];
      if (d && d[1] > -0.02) {
        const px = c[0] + d[0] * 400, py = c[1] + d[1] * 400, pz = c[2] + d[2] * 400;
        const cx = m[0] * px + m[4] * py + m[8] * pz + m[12], cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
        const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
        if (cw > 0) {
          sx = (cx / cw) * 0.5 + 0.5; sy = (cy / cw) * 0.5 + 0.5;
          const out = Math.max(0, Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5);
          sk = Math.max(0, 1 - out * 2.2) * Math.min(1, (d[1] + 0.02) * 8) * (1 - (env.night || 0)) * (1 - 0.7 * Math.min(1, env.rain || 0));
        }
      }
    }
    let volOn = false;
    if (FX && FX.v && this.fxP.vol && this.Q && this.Q.vol) {
      const Vp = this.fxP.vol, sd = env.sunDir || [0, 1, 0], night = env.night || 0, rain = Math.min(1, env.rain || 0);
      const sunK = Math.max(0, Math.min(1, (sd[1] + 0.02) / 0.12)) * (1 - night) * (1 - 0.55 * rain);
      const lampK = night * (0.018 + 0.03 * rain) * (this.volLamp ?? 1);
      if (sunK > 0.001 || lampK > 0.001) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, FX.v.fbo); gl.viewport(0, 0, FX.v.w, FX.v.h);
        gl.useProgram(Vp.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FX.depthTex); gl.uniform1i(Vp.u.uDepth, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowOK ? this.shadowTex : null); gl.uniform1i(Vp.u.uShadow, 1);
        gl.uniformMatrix4fv(Vp.u.uInvVP, false, this.inv);
        gl.uniformMatrix4fv(Vp.u.uLightVP, false, this.lVP);
        gl.uniform3fv(Vp.u.uCam, this.fxCam || [0, 0, 0]);
        gl.uniform3fv(Vp.u.uSunDir, sd);
        gl.uniform3fv(Vp.u.uSunCol, env.sunCol || [1, 0.9, 0.8]);
        gl.uniform1f(Vp.u.uSunK, sunK);
        gl.uniform1f(Vp.u.uLampK, lampK);
        gl.uniform1f(Vp.u.uDens, (0.0032 + 0.0065 * rain + 0.004 * Math.max(0, 1 - sd[1] * 4)) * (this.volDens ?? 1));
        gl.uniform1f(Vp.u.uShadowOn, this.shadowOK ? 1 : 0);
        const uL = Vp.u.uLamps || Vp.u['uLamps[0]'], uC = Vp.u.uLampC || Vp.u['uLampC[0]'];
        if (uL) gl.uniform4fv(uL, env.lampBuf || this.noLamps || (this.noLamps = new Float32Array(64)));
        if (uC) gl.uniform3fv(uC, env.lampColBuf || this.noLampC || (this.noLampC = new Float32Array(48)));
        if (Vp.u.uLampN) gl.uniform1i(Vp.u.uLampN, 16);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
        volOn = true;
      }
    }
    this.volOn = volOn;
    this.fxStats = { on: !!FX, sun: [sx, sy, sk], samples: this.samples };
    // Composite: scene + bloom -> ACES -> grade -> vignette -> dither.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    const f = P.final; gl.useProgram(f.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(f.u.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex); gl.uniform1i(f.u.uBloom, 1);
    gl.uniform1f(f.u.uBloomK, (env.bloom ?? 0.5) / L);
    gl.uniform1f(f.u.uVig, env.vignette ?? 0.3);
    gl.uniform2f(f.u.uRes, W, H);
    gl.uniform1f(f.u.uTime, env.time);
    gl.uniform1f(f.u.uUltra, FX ? 1 : 0);
    if (f.u.uVolOn) gl.uniform1f(f.u.uVolOn, volOn ? 1 : 0);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, volOn ? FX.v.tex : null); if (f.u.uVol) gl.uniform1i(f.u.uVol, 4); gl.activeTexture(gl.TEXTURE1);
    if (FX) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, FX.b.tex); gl.uniform1i(f.u.uFx, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, FX.depthTex); gl.uniform1i(f.u.uDepth, 3);
      gl.uniform3f(f.u.uSun, sx, sy, sk);
      gl.uniform3fv(f.u.uSunCol, env.sunCol || [1, 0.9, 0.8]);
    } else { gl.uniform1i(f.u.uFx, 1); gl.uniform1i(f.u.uDepth, 1); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE1);
    if (FX) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE1); }
    // Unbind so next frame's scene pass never samples a texture it's rendering into.
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
  }
}
