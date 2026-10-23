// Hinode Motors: every car you can own. h = handling (m/s and m/s2), perk = what the car changes about the work.
// care > 0 means fewer parcel bumps while you drive it, care < 0 means more. pay is a bonus on every delivery.
export const PAINTS = [
  { id: 'akane', name: 'Akane red', hex: '#b3161d' },
  { id: 'pearl', name: 'Pearl white', hex: '#e6e5df' },
  { id: 'sumi', name: 'Sumi black', hex: '#16181b' },
  { id: 'ai', name: 'Ai blue', hex: '#22446b' },
  { id: 'silver', name: 'Moon silver', hex: '#9aa1a8' },
  { id: 'matcha', name: 'Matcha green', hex: '#5b6a4a' },
  { id: 'yamabuki', name: 'Yamabuki yellow', hex: '#d49a17' },
  { id: 'sakura', name: 'Sakura pink', hex: '#d497a3' },
];

export const REPAINT = 3000;      // yen to repaint a car you own
export const TEST_DRIVE = 120;    // seconds behind the wheel before the salesman wants the keys back
export const STARTER = 'coupe';

export const MODELS = {
  kei: {
    id: 'kei', style: 'kei', name: 'Hinode Mame', jp: 'ひので まめ', cls: 'Kei car', price: 18000, paint: 'pearl',
    h: { top: 33, acc: 7.6, brake: 15, rev: 8, grip: 7.8, lock: 0.7 }, perk: {},
    perkText: 'Tiny and nimble. Turns on a ten-yen coin.',
    desc: '660 cc, yellow plates, a roof you can stand up under. Cheap to run and easy to park on any Aoshima lane.',
  },
  hatch: {
    id: 'hatch', style: 'hatch', name: 'Hinode Komachi', jp: 'ひので こまち', cls: 'Hatchback', price: 34000, paint: 'ai',
    h: { top: 39, acc: 9.8, brake: 17, rev: 9, grip: 8.3, lock: 0.66 }, perk: {},
    perkText: 'Light and quick off the lights. The sharpest handling on the lot.',
    desc: '1.3 litre, five doors, seats that fold flat. The city car everyone in Shinjuku seems to own.',
  },
  coupe: {
    id: 'coupe', style: 'coupe', name: 'Hinode Akane', jp: 'ひので あかね', cls: 'Coupe', price: 62000, paint: 'akane', starter: true,
    h: { top: 41, acc: 9.2, brake: 17, rev: 9, grip: 7.5, lock: 0.62 }, perk: {},
    perkText: 'Balanced. Rear-wheel drive, so the handbrake is fun.',
    desc: 'Long hood, fastback, wide hips. The car you started the route with.',
  },
  sedan: {
    id: 'sedan', style: 'sedan', name: 'Hinode Kaze', jp: 'ひので かぜ', cls: 'Saloon', price: 48000, paint: 'sumi',
    h: { top: 44, acc: 8.8, brake: 17.5, rev: 9, grip: 7.3, lock: 0.6 }, perk: { care: 0.15 },
    perkText: 'Soft ride: 15% fewer parcel bumps.',
    desc: 'Four doors and a proper boot. The same body the taxis use, without the roof sign.',
  },
  van: {
    id: 'van', style: 'van', name: 'Hinode Hakobu', jp: 'ひので はこぶ', cls: 'Delivery van', price: 56000, paint: 'pearl',
    h: { top: 35, acc: 6.8, brake: 14.5, rev: 8, grip: 6.7, lock: 0.58 }, perk: { care: 0.3, pay: 0.1 },
    perkText: 'Built for the job: +10% pay on every delivery, 30% fewer parcel bumps.',
    desc: 'One-box van with a sliding door and shelves in the back. Slow, but customers see a real courier.',
  },
  gt: {
    id: 'gt', style: 'gt', name: 'Hinode Raijin', jp: 'ひので 雷神', cls: 'GT sports', price: 140000, paint: 'yamabuki',
    h: { top: 58, acc: 13.5, brake: 22, rev: 10, grip: 8.9, lock: 0.6 }, perk: { care: -0.15 },
    perkText: 'Fastest car in the city. Stiff ride: 15% more parcel bumps.',
    desc: 'Twin-turbo six, wide arches, quad exhausts. The poster car on the showroom wall.',
  },
};

export const ORDER = ['kei', 'hatch', 'coupe', 'sedan', 'van', 'gt'];

export const paintHex = (id) => (PAINTS.find((p) => p.id === id) || PAINTS[0]).hex;

// Real numbers for the showroom card: top speed and 0-100 from the same handling model the car drives with.
export function carStats(m) {
  const h = m.h;
  let v = 0, t = 0;
  const target = 100 / 3.6;
  if (h.top > target) {
    while (v < target && t < 40) {
      const a = h.acc * Math.pow(Math.max(0, 1 - v / h.top), 0.6) - v * v * 0.0021 - 0.25;
      v += a * 0.01; t += 0.01;
    }
  } else t = 99;
  return { kmh: Math.round(h.top * 3.6), zero100: t, grip: h.grip, brake: h.brake };
}
