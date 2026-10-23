// Shops, the konbini and eat-in counters in Shinjuku: what each one sells, prices in yen and what an item does.
// fx.pace = walk / run speed bonus, fx.care = less parcel damage from bumps, fx.min = how long it lasts (game minutes).
// kind: food / drink (carry or use now), gift (give it to someone), tool, meal (eaten at the counter), play.

export const BAG_MAX = 12;

export const ITEMS = {
  'onigiri-salmon': { g: '鮭', jp: '鮭おにぎり', name: 'Salmon onigiri', price: 160, kind: 'food', fx: { pace: 0.05, min: 60 }, desc: 'The good kind. The wrapper keeps the nori crisp.' },
  'onigiri-tuna': { g: 'ツ', jp: 'ツナマヨおにぎり', name: 'Tuna-mayo onigiri', price: 150, kind: 'food', fx: { pace: 0.05, min: 60 }, desc: 'Everyone has a favourite. This is most people\'s.' },
  melonpan: { g: 'パ', jp: 'メロンパン', name: 'Melon pan', price: 140, kind: 'food', gift: true, fx: { pace: 0.04, min: 45 }, desc: 'Crackly sugar top, soft inside. A good thing to bring someone.' },
  karaage: { g: '唐', jp: '唐揚げ棒', name: 'Karaage stick', price: 220, kind: 'food', fx: { care: 0.1, min: 90 }, desc: 'Hot from the counter case. Eat it before it goes soft.' },
  nikuman: { g: '肉', jp: '肉まん', name: 'Nikuman', price: 180, kind: 'food', fx: { pace: 0.04, care: 0.05, min: 60 }, desc: 'A steamed bun from the warmer by the register.' },
  bento: { g: '弁', jp: '幕の内弁当', name: 'Makunouchi bento', price: 580, kind: 'food', fx: { pace: 0.08, care: 0.25, min: 180 }, desc: 'Rice, salmon, tamagoyaki, pickles. A proper lunch.' },
  'can-coffee': { g: '珈', jp: '缶コーヒー', name: 'Hot canned coffee', price: 140, kind: 'drink', fx: { pace: 0.12, min: 90 }, desc: 'From the warm shelf. Sweet, strong, too hot to hold.' },
  'green-tea': { g: '茶', jp: '緑茶', name: 'Green tea', price: 150, kind: 'drink', fx: { care: 0.2, min: 90 }, desc: 'Cold, bitter, calming. Steadier hands for a while.' },
  genki: { g: '元', jp: '栄養ドリンク', name: 'Genki energy drink', price: 300, kind: 'drink', fx: { pace: 0.2, min: 60 }, desc: 'A tiny brown bottle that tastes like a battery.' },
  pudding: { g: 'プ', jp: 'プリン', name: 'Custard pudding', price: 250, kind: 'gift', gift: true, desc: 'Caramel on top. Nobody has ever refused one.' },
  daifuku: { g: '福', jp: '大福', name: 'Strawberry daifuku', price: 180, kind: 'gift', gift: true, desc: 'Mochi, red bean, one whole strawberry.' },
  ice: { g: '氷', jp: 'アイス', name: 'Ice lolly', price: 160, kind: 'gift', gift: true, desc: 'Soda flavour. It will not survive a long round.' },
  latte: { g: 'ラ', jp: 'カフェラテ', name: 'Cafe latte', price: 480, kind: 'drink', gift: true, fx: { pace: 0.15, min: 120 }, desc: 'Made properly, with a little leaf drawn in the foam.' },
  shortcake: { g: '苺', jp: 'ショートケーキ', name: 'Strawberry shortcake', price: 520, kind: 'gift', gift: true, desc: 'Boxed with a tiny ice pack and a plastic fork.' },
  'matcha-roll': { g: '抹', jp: '抹茶ロール', name: 'Matcha roll cake', price: 450, kind: 'gift', gift: true, desc: 'Green tea sponge, cream in the middle.' },
  'cool-patch': { g: '冷', jp: '冷却シート', name: 'Cooling patches', price: 680, kind: 'tool', fx: { care: 0.3, min: 240 }, desc: 'For tired shoulders. Your arms stop shaking on the stairs.' },
  'vit-jelly': { g: 'ゼ', jp: 'ゼリー飲料', name: 'Vitamin jelly', price: 200, kind: 'drink', fx: { pace: 0.06, care: 0.1, min: 120 }, desc: 'Ten-second breakfast, according to the packet.' },
  'hand-cream': { g: '手', jp: 'ハンドクリーム', name: 'Yuzu hand cream', price: 700, kind: 'gift', gift: true, desc: 'Smells of citrus and winter.' },
  'shoyu-ramen': { g: '醤', jp: '醤油ラーメン', name: 'Shoyu ramen', price: 850, kind: 'meal', eat: 20, fx: { pace: 0.1, care: 0.25, min: 240 }, desc: 'Clear soy broth, chashu, menma, half an egg.' },
  'tonkotsu-ramen': { g: '豚', jp: '豚骨ラーメン', name: 'Tonkotsu ramen', price: 950, kind: 'meal', eat: 25, fx: { pace: 0.12, care: 0.25, min: 240 }, desc: 'Milky pork broth, thin noodles, extra garlic if you dare.' },
  gyoza: { g: '餃', jp: '餃子', name: 'Gyoza', price: 380, kind: 'meal', eat: 10, fx: { pace: 0.04, care: 0.1, min: 120 }, desc: 'Six, crispy-bottomed, with vinegar and chilli oil.' },
  'yakiniku-set': { g: '焼', jp: '焼肉ランチ', name: 'Yakiniku lunch set', price: 1280, kind: 'meal', eat: 35, fx: { pace: 0.14, care: 0.3, min: 300 }, desc: 'You grill it yourself. Rice, soup and kimchi come with it.' },
  yakitori: { g: '串', jp: '焼き鳥盛り', name: 'Yakitori platter', price: 900, kind: 'meal', eat: 25, fx: { pace: 0.08, care: 0.2, min: 180 }, desc: 'Five skewers: thigh, skin, leek, meatball, heart.' },
  edamame: { g: '豆', jp: '枝豆', name: 'Edamame', price: 380, kind: 'meal', eat: 10, fx: { care: 0.1, min: 90 }, desc: 'Salted, warm, gone in two minutes.' },
  crane: { g: '景', jp: 'クレーンゲーム', name: 'Crane game', price: 200, kind: 'play', win: 0.3, prize: 'plush', desc: 'One go. The claw looks weak. It is weak.' },
  plush: { g: '熊', jp: 'ぬいぐるみ', name: 'Plush bear', price: 0, kind: 'gift', gift: true, prize: true, desc: 'Won from the crane. A little lopsided.' },
};

// Opening hours in game minutes [open, close).
export const SHOP_INFO = {
  konbini: { jp: '日の出マート', en: 'Hinode Mart', verb: 'Shop', tag: 'Konbini · open 24 hours', hours: [0, 1440], greet: 'いらっしゃいませ！ The clerk nods without looking up from the till.' },
  cafe: { jp: 'カフェ', en: 'Cafe', verb: 'Order', tag: 'Coffee and cake', hours: [8 * 60, 21 * 60], greet: 'Soft jazz, a coffee machine hissing, one free seat by the window.' },
  drug: { jp: 'ドラッグストア', en: 'Drugstore', verb: 'Shop', tag: 'Medicine, snacks, drinks', hours: [9 * 60, 22 * 60], greet: 'Bright aisles and a jingle that will be stuck in your head all day.' },
  ramen: { jp: 'ラーメン', en: 'Ramen shop', verb: 'Eat', tag: 'Counter seats · eat here', hours: [11 * 60, 23 * 60], greet: 'Buy a ticket, take a stool. The chef shouts a welcome over the steam.' },
  yakiniku: { jp: '焼肉', en: 'Yakiniku', verb: 'Eat', tag: 'Grill your own · eat here', hours: [11 * 60, 23 * 60], greet: 'The extractor fans roar. Every table has its own little grill.' },
  izakaya: { jp: '居酒屋', en: 'Izakaya', verb: 'Eat', tag: 'Small plates · eat here', hours: [17 * 60, 24 * 60], greet: 'Red lanterns, a noren curtain, a room full of laughing office workers.' },
  game: { jp: 'ゲームセンター', en: 'Game centre', verb: 'Play', tag: 'Crane games upstairs', hours: [10 * 60, 24 * 60], greet: 'A wall of noise and light. The crane machines are by the door.' },
};

export const STOCK = {
  konbini: ['onigiri-salmon', 'onigiri-tuna', 'melonpan', 'karaage', 'nikuman', 'bento', 'can-coffee', 'green-tea', 'genki', 'pudding', 'daifuku', 'ice'],
  cafe: ['latte', 'shortcake', 'matcha-roll'],
  drug: ['genki', 'vit-jelly', 'cool-patch', 'hand-cream'],
  ramen: ['shoyu-ramen', 'tonkotsu-ramen', 'gyoza'],
  yakiniku: ['yakiniku-set'],
  izakaya: ['yakitori', 'edamame'],
  game: ['crane'],
};

// Who loves what (a liked gift is worth more trust).
export const LIKES = {
  grandma: ['melonpan', 'daifuku', 'matcha-roll'],
  akiko: ['latte', 'shortcake', 'hand-cream'],
  ogawa: ['can-coffee'],
  mei: ['pudding', 'ice', 'plush'],
};

export const GIFT_LINES = {
  plain: [
    'Oh! For me? You really didn\'t have to. Thank you.',
    'That\'s kind of you. I\'ll have it with my tea later.',
    'Ha, you\'re spoiling me. Thank you, really.',
  ],
  liked: [
    'How did you know? That\'s my favourite.',
    'Oh, I love these. You\'ve made my whole day.',
  ],
  grandma: 'Melon pan from Hinode Mart... you remembered. Sit with me while I eat it.',
  akiko: 'You remembered how I take it. ...Thank you, sweetheart.',
};
