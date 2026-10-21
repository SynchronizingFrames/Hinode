# wip11: procedural building/ground materials in WORLD_FS + reflective windows.
import sys
P = '/data/hinode/js/engine/renderer.js'
s = open(P, encoding='utf-8').read()

def rep(old, new):
    global s
    n = s.count(old)
    if n != 1:
        print('MATCH COUNT', n, 'for:', old[:70]); sys.exit(1)
    s = s.replace(old, new)

HELP = r'''  return up > 0.0 ? sky : gnd;
}
// Stable hash + value noise for procedural surface detail (no sin(), so no banding far from the origin).
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return n2(p) * 0.5 + n2(p * 2.03 + 7.1) * 0.3 + n2(p * 4.1 + 3.7) * 0.2; }
'''
rep('  return up > 0.0 ? sky : gnd;\n}\n', HELP)

MAT = r'''  vec3 V = uCam - vW; float dist = length(V); V /= dist;
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
'''
rep('  vec3 V = uCam - vW; float dist = length(V); V /= dist;\n', MAT)
rep('  float a = vC.a;\n  // Rain:', '  // Rain:')

GLOSS = r'''  // Glossy materials (glazed tile, glass, metal): fresnel reflection of the sky + sun glint.
  if (gloss > 0.0) {
    vec3 R = reflect(-V, n);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    vec3 refl = envRefl(R) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 400.0) * 20.0 * sh;
    if (mid > 5.5 && mid < 6.5) c = mix(alb * amb * 0.3, refl, 0.12 + 0.88 * F);
    else c = mix(c, refl, F * gloss) + uSunCol * pow(max(dot(n, H), 0.0), 70.0) * gloss * 0.3 * ndl * sh;
  }
  // Rain:'''
rep('  // Rain:', GLOSS)

WIN_OLD = '    if (a <= 0.5) c += uWinCol * (a * 2.0) * uNight * 2.2;\n'
WIN_NEW = r'''    if (a <= 0.5) {
      // Window glass: sky reflection by day; a warm room with curtain folds glowing through at night.
      vec3 R = reflect(-V, n);
      float F = 0.06 + 0.94 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
      vec3 refl = envRefl(R) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 500.0) * 25.0 * sh;
      float lit = a * 2.0;
      float cur = 0.72 + 0.28 * sin((vW.x + vW.z) * 23.0 + sin(vW.y * 3.0));
      c = mix(c * 0.5, refl, clamp(F * mix(0.95, 0.35, uNight * lit) + 0.08, 0.0, 1.0));
      c += uWinCol * lit * uNight * 2.2 * cur;
    }
'''
rep(WIN_OLD, WIN_NEW)
open(P, 'w', encoding='utf-8').write(s)
print('patched renderer.js OK')
