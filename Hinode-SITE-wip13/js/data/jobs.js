// Delivery content: package types, named residents, authored story jobs, and templates for daily jobs.
// Places are referenced as 'depot', 'lot:<id>' or 'post:<id>'. Lot ids are `${block i}${block j}${row}${k}`.

export const PKG = {
  parcel:  { label: 'Parcel',   jp: '小包',   slots: 1, bonus: 0,   xp: 0, color: '#c49a6c' },
  letters: { label: 'Letters',  jp: '手紙',   slots: 1, bonus: -40, xp: 0, color: '#f3ecdf' },
  food:    { label: 'Food',     jp: '食品',   slots: 1, bonus: 100, xp: 4, color: '#e8a33c' },
  fragile: { label: 'Fragile',  jp: '割れ物', slots: 1, bonus: 200, xp: 6, color: '#d9534f' },
  heavy:   { label: 'Heavy',    jp: '重量物', slots: 2, bonus: 160, xp: 6, color: '#6c7a89', speed: 0.8 },
};

export const RESIDENTS = {
  1201: { name: 'Fumiko Ishida', short: 'Ishida-san', jp: '石田' },
  1110: { name: 'Haruki Mori', short: 'Haruki', jp: '森' },
  3111: { name: 'Michiko Ōta', short: 'Ōta-san', jp: '太田' },
  '0101': { name: 'The Satō family', short: 'Satō-san', jp: '佐藤' },
  2302: { name: 'Rin Kaneko', short: 'Rin', jp: '金子' },
  '0310': { name: 'Setsuko Yoshino', short: 'Yoshino-san', jp: '吉野' },
  3201: { name: 'Nao Fujita', short: 'Nao', jp: '藤田' },
};

// Story jobs. `requires` = authored jobs that must be delivered first. `line` is said (or narrated) on delivery.
export const AUTHORED = [
  { id: 'first-round', title: 'First Round', item: 'Seed packets', kind: 'parcel', from: 'depot', to: 'lot:1201',
    reward: 600, xp: 45, trust: 3, limit: 60, requires: [],
    note: 'Ishida-san orders seeds for her garden every summer. Chiyo always took them over herself. The route is yours now.',
    line: "Oh! You're Chiyo's grandchild, aren't you? Same serious face. Thank you, dear. Come back when the morning glories are up." },
  { id: 'darkroom', title: 'Film for the Darkroom', item: 'Film and chemicals', kind: 'fragile', from: 'depot', to: 'lot:1110',
    reward: 900, xp: 55, trust: 3, limit: 50, requires: ['first-round'],
    note: "The box rattles. KEEP OUT OF THE SUN is written on it in three different pens.",
    line: "Finally. If any of this is fogged I'm blaming the sun, not you. ...Thanks. Really." },
  { id: 'post-run', title: 'Afternoon Post', item: 'Bundle of letters', kind: 'letters', from: 'lot:3111', to: 'post:P1',
    reward: 450, xp: 35, trust: 3, limit: 45, requires: ['first-round'],
    note: "Michiko Ōta has a stack of letters and a bad knee. The postbox on Minato-dōri is collected at five.",
    line: 'The letters drop in with a soft thump. One of them smells faintly of incense.' },
  { id: 'warm-bento', title: 'Still Warm', item: 'Homemade bento', kind: 'food', from: 'lot:1201', to: 'lot:1110',
    reward: 700, xp: 50, trust: 3, limit: 25, requires: ['darkroom'],
    note: "Ishida-san made too much tamagoyaki again. 'That boy in the apartments lives on instant noodles.'",
    line: "She did it again? ...Tell her the tamagoyaki was perfect. Actually, don't. She'll make more." },
  { id: 'teapot', title: 'Handle With Care', item: 'Ceramic teapot', kind: 'fragile', from: 'depot', to: 'lot:0101',
    reward: 1100, xp: 60, trust: 4, limit: 50, requires: ['darkroom'],
    note: "A Tokoname teapot wrapped in three layers of newspaper. Don't run into anything.",
    line: 'Not a single chip! My mother-in-law will have to find something else to complain about.' },
  { id: 'rice', title: 'Thirty Kilos', item: 'Rice sack (30 kg)', kind: 'heavy', from: 'depot', to: 'lot:0310',
    reward: 1000, xp: 55, trust: 3, limit: 70, requires: ['post-run'],
    note: "New-crop rice for the Yoshino house. It's heavy: you'll walk slower and won't have room for much else.",
    line: 'Ah, the new rice! By the step is fine. The festival committee eats at my house, you see. All of them.' },
  { id: 'pump', title: "A Pump for Chiyo's Bike", item: 'Bicycle pump', kind: 'parcel', from: 'lot:2302', to: 'depot',
    reward: 300, xp: 45, trust: 2, limit: 60, requires: ['post-run', 'teapot'], flag: 'bikePump',
    note: "Rin Kaneko says the old bicycle in the depot is 'a crime against bicycles'. She left a pump out for you.",
    line: "You lean the pump against Chiyo's old bicycle. Flat tyres, a rusty bell. Maybe tomorrow." },
  { id: 'cat-food', title: 'For the Alley Cats', item: 'Cat food', kind: 'parcel', from: 'depot', to: 'lot:3201',
    reward: 650, xp: 40, trust: 3, limit: 45, requires: ['warm-bento'],
    note: "Ordered by Nao Fujita, room 101. Delivery note: 'please don't ring twice, the landlord hears everything.'",
    line: "Shh. Thank you. They're not my cats. They're the street's cats. I just... feed the street." },
];

// Daily job templates by type.
export const ITEMS = {
  parcel: [
    { item: 'Paperback novels', kind: 'parcel', note: 'Four paperbacks, all by the same author. Someone is on a streak.' },
    { item: 'Running shoes', kind: 'parcel', note: 'Shoebox, size 26.5. The marathon flyers went up last week.' },
    { item: 'Knitting yarn', kind: 'parcel', note: 'Soft and light. The label says "autumn colours".' },
    { item: 'Kitchen scales', kind: 'parcel', note: 'Ordered after an argument about recipes, apparently.' },
    { item: 'Board game', kind: 'parcel', note: 'Something rattles inside. Hopefully on purpose.' },
    { item: 'Seed catalogue', kind: 'letters', note: 'Glossy and thick. Garden season is serious here.' },
    { item: 'Glass jars', kind: 'fragile', note: 'Twelve jars for umeboshi. Clinks if you breathe on it.' },
    { item: 'Picture frame', kind: 'fragile', note: 'Big, flat and wrapped in bubble film.' },
    { item: 'Ceramic rice bowls', kind: 'fragile', note: 'A set of five. Somebody broke one and had to replace the lot.' },
    { item: 'Shizuoka melon', kind: 'food', note: 'Chilled, in a wooden box. Worth more than your shoes.' },
    { item: 'Frozen gyōza', kind: 'food', note: 'Cold pack inside. It will not stay cold forever.' },
    { item: 'Box of daifuku', kind: 'food', note: 'From a sweet shop two towns over. Best eaten today.' },
    { item: 'Bottled water crate', kind: 'heavy', note: 'Twenty-four bottles. Typhoon season prep.' },
    { item: 'Garden soil', kind: 'heavy', note: 'Two big bags. Someone has plans for their balcony.' },
  ],
  return: [
    { item: 'Wrong-size jacket', kind: 'parcel', note: 'Going back to the shop. The sleeves were "a crime".' },
    { item: 'Borrowed baking tins', kind: 'parcel', note: 'To be returned to the depot for the community kitchen.' },
    { item: 'Broken desk fan', kind: 'heavy', note: 'Warranty repair. It still smells like summer.' },
    { item: 'Outgoing mail', kind: 'letters', note: 'A stack for the evening van.' },
  ],
  neighbour: [
    { item: 'Homemade pickles', kind: 'food', note: "A jar of nukazuke for the neighbours. 'Before they go sour,' says the note." },
    { item: 'Spare house key', kind: 'letters', note: 'Locked out again. Small envelope, very important.' },
    { item: 'Borrowed ladder', kind: 'heavy', note: "Going back where it came from, three months late." },
    { item: 'Recipe book', kind: 'parcel', note: 'Full of sticky notes in two different handwritings.' },
    { item: "Child's raincoat", kind: 'parcel', note: 'Left behind after a sleepover.' },
    { item: 'Potted hydrangea', kind: 'fragile', note: "A cutting from the garden. Don't drop the pot." },
  ],
  // Shinjuku: depot -> shop (business supplies)
  city: [
    { item: 'Case of sake', kind: 'heavy', note: 'Six isshobin bottles packed in straw. The izakaya ran dry last night.' },
    { item: 'Fresh noodles', kind: 'food', note: 'Made this morning. They go limp if you dawdle.' },
    { item: 'Karaoke microphone', kind: 'fragile', note: 'A replacement wireless mic. Somebody sang far too hard.' },
    { item: 'Receipt paper rolls', kind: 'parcel', note: 'A whole box. Shinjuku prints a lot of receipts.' },
    { item: 'Neon transformer', kind: 'fragile', note: 'A spare for a flickering sign. Heavier than it looks.' },
    { item: 'Coffee beans', kind: 'food', note: 'Dark roast. The cafe will smell you coming.' },
    { item: 'Crane-game plushies', kind: 'parcel', note: 'Forty fluffy prizes, squashed into one box.' },
    { item: 'Printer toner', kind: 'parcel', note: 'Urgent. A whole office floor is waiting to print.' },
    { item: 'Block ice', kind: 'heavy', note: 'For the bar. Melting as we speak.' },
  ],
  // Shinjuku: food shop -> house in town
  takeout: [
    { item: 'Ramen to go', kind: 'food', note: 'Broth sealed, noodles packed separately. They swell if you take the long way.' },
    { item: 'Yakitori set', kind: 'food', note: 'Twenty skewers, half tare, half salt. Still sizzling a little.' },
    { item: 'Gyudon bowls', kind: 'food', note: 'Two large, one with extra onion.' },
    { item: 'Late-night snacks', kind: 'parcel', note: 'Onigiri, a magazine and a phone charger. Someone in town is having a long night.' },
    { item: 'Taiyaki box', kind: 'food', note: 'Red bean and custard. The paper bag is already warm.' },
    { item: 'Karaage platter', kind: 'heavy', note: 'For a birthday. Big, warm and smells amazing.' },
  ],
  // Shinjuku: shop -> shop
  cityHop: [
    { item: 'Change float', kind: 'letters', note: 'A sealed envelope of coins. The place down the street ran out of change.' },
    { item: 'Folding chairs', kind: 'heavy', note: 'Borrowed for a busy Friday, going back now.' },
    { item: 'Lost umbrella', kind: 'parcel', note: 'Left at the counter during the last downpour.' },
    { item: 'Cocktail glasses', kind: 'fragile', note: 'A crate of glasses on loan. Do not run.' },
    { item: 'Flyer bundle', kind: 'letters', note: "Posters for tonight's live show." },
  ],
  post: [
    { item: 'Postcards', kind: 'letters', note: 'From the summer trip. Delivered by hand to the postbox, which is a little funny.' },
    { item: 'Bills to pay', kind: 'letters', note: "Due today. 'Please, before the collection.'" },
    { item: 'A thick envelope', kind: 'letters', note: 'Addressed to a university admissions office.' },
  ],
};

export const SENDERS = ['Aozora Online', 'Kitakaze Books', 'Hokkaidō Farm Direct', 'A sister in Sendai', 'Marunaka Home Store', 'Shizuoka Tea Co.', 'Tsubame Hardware', 'Mail order (unnamed)'];

// Recipient reactions for daily jobs, by package kind. Chosen per job so the same job always says the same thing.
export const LINES = {
  parcel: ["Ah, that was quick. Thank you!", "Finally! I've been checking the tracking all morning.", "You're new at Hinode? Tell Chiyo-san we said hello.",
    "Oh, is it today already? Thank you.", "Perfect timing, I was just heading out.", "Thanks! Mind the cat on your way out."],
  letters: ["Thank you. Paper still feels better than email, doesn't it?", "Oh good, I was waiting for this."],
  food: ["Still cold! Perfect, thank you.", "Oh, that smells wonderful. Thank you!", "You ran, didn't you? Thank you."],
  fragile: ["Nothing rattling? Wonderful. Thank you.", "You carried it like an egg. I appreciate that."],
  heavy: ["Oof. Just leave it there. You must be strong!", "Here, take a barley tea for the road."],
  depot: ["You add it to the outgoing pile behind the counter.", "You tag it for the evening van and set it on the shelf."],
  postbox: ["It drops in with a soft thump.", "In it goes. The collection is at five."],
};

// ---- Shinjuku shops as delivery places ----
export const SHOP_LABEL = {
  izakaya: { en: 'Izakaya', jp: '居酒屋' }, ramen: { en: 'Ramen shop', jp: 'ラーメン' }, karaoke: { en: 'Karaoke', jp: 'カラオケ' },
  drug: { en: 'Drugstore', jp: '薬局' }, bar: { en: 'Bar', jp: 'バー' }, game: { en: 'Game centre', jp: 'ゲームセンター' },
  office: { en: 'Office', jp: '事務所' }, cafe: { en: 'Cafe', jp: '喫茶店' }, yakiniku: { en: 'Yakiniku grill', jp: '焼肉' },
  konbini: { en: 'Hinode Mart', jp: '日の出マート' }, pachinko: { en: 'Pachinko parlour', jp: 'パチンコ' },
  yokocho: { en: 'Yokocho stall', jp: '横丁' }, shop: { en: 'Shop', jp: '店' },
};
export const PLAIN_SHOPS = ['konbini', 'pachinko', 'office', 'drug', 'game', 'karaoke'];
export const FOOD_SHOPS = ['ramen', 'izakaya', 'yakiniku', 'cafe', 'yokocho', 'konbini', 'bar'];
