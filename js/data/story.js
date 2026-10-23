// HINODE story mode: "The Sunrise Round" (日の出の配達).
// Grandma Chiyo rode the Aoshima route for forty-one years. Her daughter Akiko, your mum, left for Tokyo
// twenty years ago after a fight on the station platform and never came back. Chiyo wrote her a letter every
// New Year and never posted one. You're covering the route for the summer while Chiyo is in hospital.
//
// Scene lines: ['speaker', 'text'] or { who, line, choose: [{ label, then: [lines] }] }. 'n' = narration.
// Step types: talk (scene with a resident), phone (rings by itself), job (an authored delivery), finale,
// buy (an item in your bag; take: true packs it), gift (give a resident something), test (a dealer test drive),
// money (cash on hand), car (own one of `models`). `or` marks a step done when another step is.
// Talk / phone / finale steps wait for every earlier step in their chapter unless they list `needs`.

export const SPEAKERS = {
  n: { jp: '', name: '', role: '' },
  grandma: { jp: '日向 千代', name: 'Grandma Chiyo', role: 'Your grandmother' },
  akiko: { jp: '日向 明子', name: 'Mum', role: 'Akiko · your mother' },
};

// Story deliveries. They join the authored jobs; `gate` = a story flag that must be set before they show up.
export const STORY_JOBS = [
  { id: 'old-film', title: "Grandma's Last Roll", item: 'Undeveloped film', kind: 'fragile', from: 'depot', to: 'lot:1110',
    reward: 800, xp: 50, trust: 3, limit: 50, requires: ['darkroom'], gate: 'ch2',
    note: 'Fuji 400, expired in 2006, from the biscuit tin. Haruki develops film by hand in his bathroom. Keep it out of the sun.',
    line: 'Expired twenty years ago? ...Leave it with me. Old film is like old people. Patient, and full of surprises.' },
  { id: 'prints', title: 'Prints, Still Wet', item: 'Envelope of photographs', kind: 'letters', from: 'lot:1110', to: 'depot',
    reward: 500, xp: 45, trust: 3, limit: 45, requires: ['old-film'], gate: 'ch2',
    note: "Haruki says the roll came out. He won't say what's on it. 'It's not my place,' he said, and closed the door.",
    line: "You lay the prints out on the counter. A girl on a bicycle at the harbour, the sun coming up behind her. On the back, in Grandma's hand: 'Akiko, 15. Our first sunrise round.'" },
  { id: 'bike-box', title: 'The Cracked Box', item: 'Wooden delivery box', kind: 'heavy', from: 'depot', to: 'npc:murakami',
    reward: 600, xp: 50, trust: 3, limit: 60, requires: ['pump'], gate: 'ch3',
    note: "The wooden box on Grandma's bicycle is split down one side. Murakami-san in the shogi alley built it, a long time ago.",
    line: "Hm. I know this box. I know every nail in it. Put it down. Gently. It's older than you." },
  { id: 'box-back', title: 'The Box Comes Home', item: 'Mended delivery box', kind: 'heavy', from: 'npc:murakami', to: 'depot',
    reward: 700, xp: 55, trust: 3, limit: 60, requires: ['bike-box'], gate: 'boxMended',
    note: 'Murakami-san worked through the night. The box is sanded and oiled. Bring it back to the depot.',
    line: "You fit the box back on Grandma's bicycle. The new wood is pale against the old. Inside, he left the little scratches exactly where they were." },
  { id: 'last-letter', title: 'The Twentieth Letter', item: 'One envelope, unsealed', kind: 'letters', from: 'lot:1201', to: 'depot',
    reward: 300, xp: 40, trust: 3, limit: 40, requires: ['first-round'], gate: 'letters',
    note: "Ishida-san has something of Grandma's. She'll hand it over at her door.",
    line: "Ishida-san pressed it into your hands: 'Chiyo gave me this in April. She said, if I ever forget her name, make sure she gets this.'" },
  { id: 'to-akiko', title: 'Twenty New Years', item: 'Twenty letters, red string', kind: 'letters', from: 'depot', to: 'story:akiko',
    reward: 2000, xp: 90, trust: 5, limit: 120, requires: ['last-letter'], gate: 'ch4',
    note: "Mum works at a café in Shinjuku. Twenty letters, twenty years late. Take the car if you need it, but take them yourself.",
    line: "She sees the red string before she sees you. She doesn't take the bundle right away. Her hands are shaking." },
  { id: 'care-pack', title: 'Room 304', item: "Grandma's care package", kind: 'fragile', from: 'depot', to: 'story:akiko',
    reward: 900, xp: 60, trust: 3, limit: 120, requires: [], gate: 'step:m-cream',
    note: "Ogawa added Grandma's reading glasses and her little radio. Mum visits the hospital after her shift. She'll take it up.",
    line: "Mum looks in the bag. Melon pan, the yuzu cream, the radio with tape on the dial. 'She still has this radio,' she says, to nobody." },
  { id: 'akiko-camera', title: 'The Camera on the Shelf', item: "Mum's old film camera", kind: 'fragile', from: 'lot:1110', to: 'story:akiko',
    reward: 1200, xp: 70, trust: 4, limit: 120, requires: [], gate: 'ledgerRead',
    note: "Haruki has kept Mum's camera for twenty years. 'Chiyo brought it round the week Akiko left,' he said. 'She couldn't look at it. She couldn't throw it away.'",
    line: 'Mum turns the camera over. Winds it on. The shutter still clicks. She laughs, a short surprised sound, like finding a coin in an old coat.' },
  { id: 'mei-prints', title: 'Contest Prints', item: "Mei's photo club prints", kind: 'fragile', from: 'npc:mei', to: 'story:akiko',
    reward: 800, xp: 60, trust: 3, limit: 120, requires: [], gate: 'meiAsked',
    note: "Twelve prints in a school envelope. Mei wrote 'please be honest' on it, then crossed out 'honest' and wrote 'kind'.",
    line: "Mum spreads Mei's prints across a café table and goes very still. Then she takes out a pencil." },
  { id: 'mei-notes', title: 'Notes on the Back', item: 'Prints with pencil notes', kind: 'fragile', from: 'story:akiko', to: 'npc:mei',
    reward: 800, xp: 60, trust: 3, limit: 120, requires: ['mei-prints'], gate: 'meiNotes',
    note: "Mum wrote on the back of every print. Small, neat pencil. Almost Grandma's handwriting.",
    line: 'Mei reads the back of the first print, then the second, then sits down on the kerb and reads all twelve.' },
  { id: 'sandbags', title: 'Sandbags', item: 'Six sandbags', kind: 'heavy', from: 'depot', to: 'npc:murakami',
    reward: 900, xp: 60, trust: 4, limit: 50, requires: [], gate: 'stormDuty',
    note: "Officer Endō says Murakami-san's workshop floods first. He won't leave it. Sandbags in front of the door, before the drains go.",
    line: "Murakami-san stacks them himself, one by one, rain running off his cap. 'Your grandmother did this for me in '98,' he says. 'Same door.'" },
  { id: 'storm-kit', title: 'Storm Kit', item: 'Torch, radio, water, rice crackers', kind: 'parcel', from: 'depot', to: 'npc:hayashi',
    reward: 900, xp: 60, trust: 4, limit: 50, requires: [], gate: 'stormDuty',
    note: "Hayashi-sensei lives alone and won't ask for help. Officer Endō says don't ask. Just hand it over.",
    line: "'I have candles,' Hayashi-sensei says, and takes the torch anyway. 'Come in out of the rain for one minute. I have something of your mother's.'" },
  { id: 'essay', title: 'What I Want to Be', item: "Mum's school essay, age nine", kind: 'letters', from: 'npc:hayashi', to: 'story:akiko',
    reward: 1000, xp: 70, trust: 4, limit: 120, requires: [], gate: 'essayGiven',
    note: "Hayashi-sensei kept one essay from every class she ever taught. Mum's is in pencil, with a drawing of a bicycle.",
    line: 'Mum reads it standing up, in her apron, in the doorway of the café. She reads it again. Then she unties the apron.' },
  { id: 'mum-home', title: 'Bring Mum Home', item: 'Mum, and one suitcase', kind: 'fragile', from: 'story:akiko', to: 'depot',
    reward: 500, xp: 120, trust: 6, limit: 120, requires: [], gate: 'pickup',
    note: "She's waiting outside the café, sitting on one suitcase. Take the car. Drive gently.",
    line: "Ogawa is at the shutter before the engine stops. Neither of them says anything for a long time." },
  { id: 'glories', title: 'Morning Glories', item: 'Potted morning glories', kind: 'fragile', from: 'lot:1201', to: 'depot',
    reward: 600, xp: 50, trust: 3, limit: 45, requires: [], gate: 'ch5',
    note: "Ishida-san grew these from Akiko's first seeds, every summer for twenty years. Don't you dare drop them.",
    line: 'You set the pot by the shutter, where the sun hits first. Three flowers are open. Blue, like the sky at five in the morning.' },
  { id: 'tyres', title: 'New Tyres', item: 'Two bicycle tyres', kind: 'parcel', from: 'lot:2302', to: 'depot',
    reward: 400, xp: 45, trust: 3, limit: 50, requires: [], gate: 'ch5', flag: 'bikeFixed',
    note: "Rin Kaneko ordered proper tyres for Grandma's bicycle. 'Not a crime against bicycles anymore,' she says.",
    line: 'Mum fits the tyres while you hold the bike. Then she rings the bell, once. Ogawa pretends he has something in his eye.' },
  { id: 'lanterns', title: 'Lanterns for Sunday', item: 'Paper lanterns', kind: 'parcel', from: 'lot:0310', to: 'depot',
    reward: 500, xp: 45, trust: 3, limit: 50, requires: [], gate: 'ch5',
    note: "Yoshino-san is lending the festival lanterns. 'For Chiyo-san. The whole committee insisted.'",
    line: "You hang the lanterns across the depot shutter. Somebody, probably Sora, has written WELCOME HOME CHIYO on one of them in very large letters." },
];

// Existing authored deliveries, paced into chapters.
export const JOB_GATES = { 'warm-bento': 'ch2', teapot: 'ch2', rice: 'ch3', pump: 'ch3', 'cat-food': 'ch3' };

export const CHAPTERS = [
  { id: 'ch1', n: 1, kanji: '第一章', title: 'The Route Is Yours', jpTitle: '道を継ぐ',
    intro: "Grandma Chiyo rode this route for forty-one years. Then, one wet morning in May, she didn't come home from it. Now it's yours, for the summer.",
    steps: [
      { id: 'c1-intro', type: 'talk', npc: 'ogawa', scene: 'c1-intro', text: 'Talk to Ogawa at the depot' },
      { id: 'c1-first', type: 'job', job: 'first-round', text: "Take Ishida-san her seed packets" },
      { id: 'c1-call', type: 'phone', scene: 'c1-call', text: 'Grandma is calling from the hospital' },
      { id: 'c1-dark', type: 'job', job: 'darkroom', text: "Deliver Haruki's darkroom film" },
      { id: 'c1-post', type: 'job', job: 'post-run', text: "Post Ōta-san's letters before five" },
      { id: 'c1-tin', type: 'talk', npc: 'ogawa', scene: 'c1-tin', text: "See Ogawa about Grandma's tin" },
    ] },
  { id: 'ch2', n: 2, kanji: '第二章', title: 'What She Kept', jpTitle: 'しまっておいたもの',
    intro: 'A roll of film nobody developed. A bell from a bicycle nobody rides. Grandma kept things the way she kept the route: carefully, and without explaining.',
    steps: [
      { id: 'c2-film', type: 'job', job: 'old-film', text: "Take Grandma's old film to Haruki" },
      { id: 'c2-bento', type: 'job', job: 'warm-bento', text: "Carry Ishida-san's bento while it's warm" },
      { id: 'c2-teapot', type: 'job', job: 'teapot', text: "Deliver the Satōs' teapot in one piece" },
      { id: 'c2-prints', type: 'job', job: 'prints', text: 'Bring the developed prints back to the depot' },
      { id: 'c2-hayashi', type: 'talk', npc: 'hayashi', scene: 'c2-hayashi', needs: ['c2-prints'], text: 'Show the photo to Hayashi-sensei' },
      { id: 'c2-mom', type: 'phone', scene: 'c2-mom', text: 'Call Mum' },
    ] },
  { id: 'ch3', n: 3, kanji: '第三章', title: 'Flat Tyres', jpTitle: 'パンク',
    intro: "Grandma's bicycle has leaned against the depot wall since May. Flat tyres, a rusty bell, a cracked wooden box. Somebody should fix it before she comes home.",
    steps: [
      { id: 'c3-rice', type: 'job', job: 'rice', text: 'Haul the new rice to Yoshino-san' },
      { id: 'c3-pump', type: 'job', job: 'pump', text: "Fetch Rin's pump for Grandma's bicycle" },
      { id: 'c3-box', type: 'job', job: 'bike-box', text: "Take the cracked bike box to Murakami-san" },
      { id: 'c3-murakami', type: 'talk', npc: 'murakami', scene: 'c3-murakami', needs: ['c3-box'], text: 'Talk to Murakami-san about the box' },
      { id: 'c3-back', type: 'job', job: 'box-back', text: 'Bring the mended box back to the depot' },
      { id: 'c3-mom', type: 'phone', scene: 'c3-mom', text: 'Mum is calling' },
    ] },
  { id: 'ch4', n: 4, kanji: '第四章', title: 'Return to Sender', jpTitle: '差出人へ',
    intro: 'Twenty New Years. Twenty letters with stamps on them, never posted. A postwoman who delivered every letter in Aoshima for forty-one years, except her own.',
    steps: [
      { id: 'c4-letters', type: 'talk', npc: 'ogawa', scene: 'c4-letters', text: 'Ask Ogawa about the letters in the tin' },
      { id: 'c4-last', type: 'job', job: 'last-letter', text: 'Collect the twentieth letter from Ishida-san' },
      { id: 'c4-grandma', type: 'phone', scene: 'c4-grandma', text: 'Grandma is calling' },
      { id: 'c4-deliver', type: 'job', job: 'to-akiko', text: "Take Grandma's letters to Mum in Shinjuku" },
      { id: 'c4-akiko', type: 'talk', npc: 'akiko-city', scene: 'c4-akiko', text: 'Talk to Mum' },
    ] },
  { id: 'melon', n: 5, kanji: '第五章', title: 'Melon Pan', jpTitle: 'メロンパン',
    intro: "Mum read the letters. Mum didn't get on the train. But every evening after her shift she rides out to Aoshima General, sits by Grandma's bed for an hour, and rides back without walking past the house.",
    steps: [
      { id: 'm-call', type: 'phone', scene: 'm-call', text: 'Grandma is calling' },
      { id: 'm-melon', type: 'buy', item: 'melonpan', take: true, where: 'Hinode Mart konbini, Shinjuku · open 24 hours', ok: 'Melon pan packed for Grandma', text: 'Buy a melon pan at the konbini' },
      { id: 'm-cream', type: 'buy', item: 'hand-cream', take: true, where: 'Drugstore, Shinjuku · 09:00–22:00', ok: 'Yuzu hand cream packed for Grandma', text: 'Buy yuzu hand cream at the drugstore' },
      { id: 'm-pack', type: 'job', job: 'care-pack', text: "Take Grandma's care package to Mum" },
      { id: 'm-akiko', type: 'talk', npc: 'akiko-city', scene: 'm-akiko', text: 'Talk to Mum' },
    ] },
  { id: 'ledger', n: 6, kanji: '第六章', title: 'The Ledger', jpTitle: '台帳',
    intro: 'Ogawa has kept the depot ledger since 1987. Every round, every rider, every slip. There is one page he never opens.',
    steps: [
      { id: 'l-ledger', type: 'talk', npc: 'ogawa', scene: 'l-ledger', text: 'Ask Ogawa about the old ledger' },
      { id: 'l-camera', type: 'job', job: 'akiko-camera', text: "Take Mum's camera from Haruki to Mum" },
      { id: 'l-akiko', type: 'talk', npc: 'akiko-city', scene: 'l-akiko', text: 'Talk to Mum' },
      { id: 'l-gift', type: 'gift', npc: 'ogawa', hint: 'Mum says strawberry daifuku', ok: 'Ogawa took the daifuku', text: 'Bring Ogawa something sweet' },
      { id: 'l-ogawa', type: 'talk', npc: 'ogawa', scene: 'l-ogawa', text: 'Sit with Ogawa' },
    ] },
  { id: 'doors', n: 7, kanji: '第七章', title: 'Four Doors', jpTitle: '四つのドア',
    intro: 'Grandma is getting better. The doctor says she can come home soon, on two conditions: no bicycle, and nothing she has to climb down into.',
    steps: [
      { id: 'd-call', type: 'phone', scene: 'd-call', text: 'Grandma is calling' },
      { id: 'd-ogawa', type: 'talk', npc: 'ogawa', scene: 'd-ogawa', text: 'Ask Ogawa about a car for Grandma' },
      { id: 'd-test', type: 'test', or: 'd-car', ok: 'Test drive booked', text: 'Take a test drive at Hinode Motors' },
      { id: 'd-save', type: 'money', amount: 18000, or: 'd-car', ok: 'Enough for a family car', text: 'Save ¥18,000 for a family car' },
      { id: 'd-car', type: 'car', models: ['kei', 'hatch', 'sedan', 'van'], hint: 'a kei car, hatchback, saloon or van', text: 'Buy a car Grandma can ride in' },
      { id: 'd-mum', type: 'phone', scene: 'd-mum', text: 'Mum is calling' },
    ] },
  { id: 'mei', n: 8, kanji: '第八章', title: 'Photo Club', jpTitle: '写真部',
    intro: 'There is a photo on the wall of the Aoshima High photo club: the harbour at sunrise, first prize, 2004. Mei has walked past it every day for two years. Yesterday she read the name on the label.',
    steps: [
      { id: 'k-mei', type: 'talk', npc: 'mei', scene: 'k-mei', text: 'Talk to Mei after school' },
      { id: 'k-prints', type: 'job', job: 'mei-prints', text: "Take Mei's prints to Mum" },
      { id: 'k-akiko', type: 'talk', npc: 'akiko-city', scene: 'k-akiko', text: "Talk to Mum about Mei's photos" },
      { id: 'k-notes', type: 'job', job: 'mei-notes', text: "Bring Mum's notes back to Mei" },
      { id: 'k-mei2', type: 'talk', npc: 'mei', scene: 'k-mei2', text: 'Talk to Mei' },
      { id: 'k-gift', type: 'gift', npc: 'mei', hint: 'She loves custard pudding', ok: 'Mei is celebrating', text: 'Bring Mei something to celebrate' },
    ] },
  { id: 'typhoon', n: 9, kanji: '第九章', title: 'Typhoon Night', jpTitle: '台風の夜', weather: 'storm', weatherUntil: 't-hayashi',
    intro: 'Typhoon No. 14 has turned up the coast. The trains have stopped, the harbour road is closed, and the old folks on the round are on their own.',
    steps: [
      { id: 't-warn', type: 'phone', scene: 't-warn', text: 'Mum is calling' },
      { id: 't-endo', type: 'talk', npc: 'endo', scene: 't-endo', text: 'Find Officer Endō' },
      { id: 't-sand', type: 'job', job: 'sandbags', text: "Take sandbags to Murakami-san's workshop" },
      { id: 't-kit', type: 'job', job: 'storm-kit', text: 'Take a storm kit to Hayashi-sensei' },
      { id: 't-hayashi', type: 'talk', npc: 'hayashi', scene: 't-hayashi', needs: ['t-kit'], text: 'Go inside with Hayashi-sensei' },
      { id: 't-essay', type: 'job', job: 'essay', text: "Take Mum's school essay to Shinjuku" },
      { id: 't-mum', type: 'talk', npc: 'akiko-city', scene: 't-mum', text: 'Talk to Mum' },
    ] },
  { id: 'platform', n: 10, kanji: '第十章', title: 'The First Train', jpTitle: '始発',
    intro: 'Mum has quit the café. She has packed one suitcase. She has bought a ticket to Aoshima eleven times in twenty years.',
    steps: [
      { id: 'p-call', type: 'phone', scene: 'p-call', text: 'Mum is calling' },
      { id: 'p-bring', type: 'job', job: 'mum-home', text: 'Bring Mum home' },
      { id: 'p-home', type: 'talk', npc: 'akiko', scene: 'p-home', text: 'Talk to Mum at the depot' },
      { id: 'p-grandma', type: 'phone', scene: 'p-grandma', text: 'Grandma is calling' },
    ] },
  { id: 'makeup', n: 11, kanji: '第十一章', title: 'Two Forks', jpTitle: '二本のフォーク',
    intro: "Mum has been home for three days. She and Ogawa have said nine words to each other, and two of them were 'excuse me'.",
    steps: [
      { id: 'u-ogawa', type: 'talk', npc: 'ogawa', scene: 'u-ogawa', text: 'Talk to Ogawa' },
      { id: 'u-cake', type: 'buy', item: 'shortcake', where: 'Café, Shinjuku · 08:00–21:00', ok: 'Shortcake in your bag', text: 'Buy a strawberry shortcake at the café' },
      { id: 'u-gift', type: 'gift', npc: 'akiko', item: 'shortcake', hint: 'Give her the shortcake', ok: 'Mum took the shortcake', text: 'Give Mum the shortcake' },
      { id: 'u-akiko', type: 'talk', npc: 'akiko', scene: 'u-akiko', text: 'Talk to Mum' },
      { id: 'u-ogawa2', type: 'talk', npc: 'ogawa', scene: 'u-ogawa2', text: 'Check on Ogawa' },
    ] },
  { id: 'ch5', n: 12, kanji: '第十二章', title: 'Sunrise', jpTitle: '日の出',
    intro: "Mum is home. Grandma is coming home. The bicycle is almost ready. There's one more round to ride.",
    steps: [
      { id: 'c5-arrive', type: 'talk', npc: 'akiko', scene: 'c5-arrive', text: 'Find Mum at the depot' },
      { id: 'c5-glories', type: 'job', job: 'glories', text: "Bring Ishida-san's morning glories" },
      { id: 'c5-tyres', type: 'job', job: 'tyres', text: 'Pick up the new tyres from Rin' },
      { id: 'c5-lanterns', type: 'job', job: 'lanterns', text: 'Collect the lanterns from Yoshino-san' },
      { id: 'c5-home', type: 'talk', npc: 'grandma', scene: 'c5-home', text: 'Welcome Grandma home' },
      { id: 'c5-sunrise', type: 'finale', text: 'Finish your round. At dawn: the sunrise round' },
    ] },
];

export const SCENES = {
  'c1-intro': {
    note: 'Ogawa handed me Grandma\'s route. She rode it for forty-one years, until her fall in May.',
    lines: [
      ['ogawa', "So you're Chiyo's grandchild. You've got her frown. That's a compliment, by the way."],
      ['ogawa', 'Forty-one years she rode this route. Rain, snow, the typhoon in \'04. She knew every dog, every gate, every person who wanted their parcel left behind the bicycle.'],
      ['ogawa', 'Then she missed a turn on Minato-dōri in May. The doctors say her hip will heal. Her memory... they say we\'ll see.'],
      { who: 'ogawa', line: '...', choose: [
        { label: 'Is she going to be okay?', then: [['ogawa', "She's Chiyo. She asked the nurse for the delivery schedule before she asked for water."]] },
        { label: 'Why was she still riding at her age?', then: [['ogawa', "I asked her that once. She said, 'Who else would bring Ishida-san her seeds?' Then she rode off. That was her whole answer."]] },
      ] },
      { who: 'ogawa', line: "Your mother didn't come with you.", choose: [
        { label: 'She said she had work.', then: [['ogawa', 'Mm. Twenty years of work, then.']] },
        { label: "She doesn't talk about Aoshima.", then: [['ogawa', "No. I don't suppose she does."]] },
      ] },
      ['ogawa', "Well. The first slip on the board is Ishida-san's seeds. Chiyo took them over herself every summer. Start there."],
    ],
  },
  'c1-call': {
    phone: 'in', caller: 'grandma', place: 'Aoshima General Hospital',
    note: 'Grandma called from the hospital. For a moment she thought Mum was here with me.',
    lines: [
      ['grandma', "Hello? Is this the depot? ...Oh! It's you! Ogawa-kun said you started today."],
      ['grandma', 'Did Ishida-san get her seeds? She plants the morning glories on the first warm Sunday. Every year. She thinks I don\'t notice she does it for me.'],
      { who: 'grandma', line: 'Well? Did she?', choose: [
        { label: 'She did. She said I have your serious face.', then: [['grandma', 'Ha! Poor thing. Smile at people, dear. They tip better.']] },
        { label: 'How are you feeling, Grandma?', then: [['grandma', 'Like a bicycle with a bent wheel. Still a bicycle, though.']] },
      ] },
      ['grandma', 'The food in here is terrible. Tell Yui-chan I said so. She\'ll send something.'],
      ['grandma', "And Akiko? Is Akiko there with... no. No, of course she isn't. Silly me. I keep..."],
      ['grandma', "Go on. The post goes at five. Don't let Ōta-san's letters miss it."],
    ],
  },
  'c1-tin': {
    note: 'Grandma left me a biscuit tin: an old roll of film, a bicycle bell, and a bundle of letters tied with red string.',
    lines: [
      ['ogawa', 'A full round. Chiyo would pretend not to be impressed.'],
      ['ogawa', "She left this with me in April. Before the fall. Said, 'When the kid does a full round, give them this.' Like she knew."],
      ['n', 'A biscuit tin, dented, the lid taped shut. Inside: a roll of film, a bicycle bell, and a bundle of envelopes tied with red string.'],
      ['ogawa', 'The film\'s from that old camera of hers. Haruki in the apartments still develops by hand. Take it to him.'],
      ['ogawa', "The envelopes... leave those for now. She'll tell you about them herself. Or she won't. That's her business."],
    ],
  },
  'c2-hayashi': {
    note: 'Hayashi-sensei taught Mum. Mum left for art school in Tokyo after a fight with Grandma on the station platform. Neither of them ever took it back.',
    lines: [
      ['hayashi', "You look like you're carrying something heavier than a parcel today."],
      ['n', 'You show her the photograph.'],
      ['hayashi', "Oh. Oh, my. That's Akiko. She sat in the second row by the window, and she never once looked at the blackboard. Always at the sky."],
      ['hayashi', "She ran the photography club. Took a camera everywhere. Chiyo's camera, actually. Chiyo lent it to her and never got it back."],
      { who: 'hayashi', line: '...', choose: [
        { label: 'Why did Mum leave?', then: [['hayashi', 'She got into an art school in Tokyo. Chiyo wanted her to stay and take over the route. They said things on the station platform that neither of them could take back.']] },
        { label: 'Did Grandma ever talk about her?', then: [['hayashi', 'Never. Not once in twenty years. But every New Year she bought one extra stamp. I always wondered who it was for.']] },
      ] },
      ['hayashi', "They were both right, you know. That's the trouble with families. Being right is the loneliest thing in the world."],
      ['hayashi', 'Call your mother, dear. Not for Chiyo. For you.'],
    ],
  },
  'c2-mom': {
    phone: 'out', caller: 'akiko', place: 'Shinjuku',
    note: 'I called Mum about the photo. She used to ride the morning round with Grandma before school. She told me not to dig.',
    lines: [
      ['n', 'You call Mum. It rings for a long time.'],
      { who: 'akiko', line: "...Hi. Is everything okay? Is it Mum? Did something happen?", choose: [
        { label: "She's fine. I found a photo of you.", then: [['akiko', 'A photo. Of me.']] },
        { label: "Haruki developed Grandma's old film.", then: [['akiko', 'Haruki Mori? Little Haruki? He used to follow me around the photo club like a duckling.']] },
      ] },
      ['akiko', 'Which photo?'],
      ['n', 'You describe it: the harbour, the bicycle, the sun coming up behind her.'],
      ['akiko', "...We used to do the morning round together before school. She let me ring the bell at every corner. I forgot about that. I made myself forget about that."],
      ['akiko', "I have to go. I have a shift. Just... do the job, okay? Don't dig."],
      ['n', 'She hangs up. You stare at the phone for a while.'],
    ],
  },
  'c3-murakami': {
    flag: 'boxMended',
    note: 'Murakami-san built the bike box in 1987. Mum rode in it as a toddler. Every Sunday, Grandma asked him if anyone had heard from Tokyo.',
    lines: [
      ['murakami', '1987. Chiyo-san came to my workshop with a drawing on the back of a delivery slip. She paid me in mikan. A whole crate.'],
      ['murakami', 'See these scratches on the inside? Little hands. Your mother rode in this box until she was four. Chiyo did the whole route with her in it, waving at everybody like a princess.'],
      { who: 'murakami', line: '...', choose: [
        { label: 'Can you fix it?', then: [['murakami', 'Can I fix it. Hmph. I built half the gates on this street. The good half.']] },
        { label: 'Mum never told me that.', then: [["murakami", "Children don't remember being carried. That's the point of being carried."]] },
      ] },
      ['murakami', 'Your grandmother came here every Sunday for twenty years. To play shogi, she said. She never played. She just asked if I\'d heard anything from Tokyo.'],
      ['murakami', "I hadn't. Nobody had. Come back for the box after your next round. Now let an old man work."],
    ],
  },
  'c3-mom': {
    phone: 'in', caller: 'akiko', place: 'Shinjuku',
    note: 'Mum called me for the first time. She said Grandma never threw anything away, except her. Then she said that wasn\'t fair.',
    lines: [
      ['akiko', "Hey. It's me. ...Ogawa sent me a picture. Of the bike."],
      ['akiko', "It's still there. The box and everything. I thought she'd have thrown it out the day I left. I would have, if I were her."],
      { who: 'akiko', line: '...', choose: [
        { label: 'Murakami-san fixed the box.', then: [['akiko', "Murakami-san is still alive? He used to let me win at shogi and pretend he didn't."]] },
        { label: 'She kept everything, Mum.', then: [['akiko', "...Yeah. That sounds like her. She never threw anything away. Except me."], ['akiko', "Sorry. That's not fair. I don't know what's fair anymore."]] },
      ] },
      { who: 'akiko', line: 'How is she? Really?', choose: [
        { label: 'She forgets things. She asked if you were here.', then: [['akiko', 'She asked about me.'], ['n', 'A long breath on the other end of the line.']] },
        { label: "She's tough. Like you.", then: [['akiko', "Don't. Don't say I'm like her. ...Okay. Maybe a little."]] },
      ] },
      ['akiko', "I'm going to hang up before I say something stupid. Look after her bike, okay?"],
    ],
  },
  'c4-letters': {
    flag: 'letters',
    note: "Grandma wrote Mum a letter every New Year for twenty years and never posted one. 'This way I don't have to know.' Nineteen are in the tin.",
    lines: [
      ['ogawa', 'Sit down. No, really. Sit.'],
      ['ogawa', "The envelopes in the tin. You've carried them around for a week and you haven't opened them. Good. They're not addressed to you."],
      ['n', "He unties the red string. Every envelope says the same thing, in the same careful hand: To Akiko. Each one has a stamp. Each one has a different year."],
      ['ogawa', 'One every New Year, starting the winter she left. She wrote them at this counter after we closed. Then she put them in the tin instead of the postbox.'],
      ['ogawa', "I asked her why, once. She said, 'If I send it and she doesn't answer, then I'll know. This way I don't have to know.'"],
      { who: 'ogawa', line: '...', choose: [
        { label: "I'm taking them to Mum.", then: [['ogawa', "I know. That's why I'm telling you."]] },
        { label: 'Should I read them?', then: [['ogawa', "You could. But you're a courier now. Couriers don't open the mail."]] },
      ] },
      ['ogawa', "There should be twenty. I count nineteen. Ishida-san goes quiet every time Chiyo's name comes up. Start with her."],
    ],
  },
  'c4-grandma': {
    phone: 'in', caller: 'grandma', place: 'Aoshima General Hospital',
    note: 'Grandma called and thought I was Mum at fifteen. She asked me to tell Mum the morning glories are up. Mum planted the first ones when she was six.',
    lines: [
      ['grandma', 'Akiko? Akiko, is that you?'],
      { who: 'grandma', line: "You took the bicycle again, didn't you. It's getting dark. Come home before the streetlights and I won't tell your father.", choose: [
        { label: "It's me, Grandma. Your grandchild.", then: [['grandma', "...Oh. Oh, of course. Of course it is. I'm sorry, dear. The days get mixed up in here, like letters in the rain."], ['grandma', 'You sound so much like her. Did anyone ever tell you that?']] },
        { label: "Okay, Mum. I'm coming home.", then: [['n', 'Silence on the line. Then, very softly:'], ['grandma', "Good girl... no. No, you're not her, are you. But thank you. Thank you for letting me hear it."]] },
      ] },
      ['grandma', 'If you see Akiko, tell her the morning glories are up. She planted the first ones. She was six. She\'d want to know.'],
    ],
  },
  'c4-akiko': {
    note: "I gave Mum the letters in Shinjuku. Twenty letters, all saying 'Come home when you're ready.' She isn't ready. Not yet.",
    lines: [
      ['akiko', 'Twenty. She wrote me twenty letters.'],
      ['n', "She opens the first one, from the winter she left. She reads it twice. Then she laughs, and then she isn't laughing."],
      ['akiko', "'Akiko. The house is very quiet. I keep setting out two bowls. Your camera is on the shelf. I'm not angry. I was never angry. I was scared. Come home when you're ready. Love, Mum.'"],
      ['akiko', "Every one says it. 'Come home when you're ready.' Twenty times. And I spent twenty years waiting for her to say it."],
      { who: 'akiko', line: '...', choose: [
        { label: "She's still waiting.", then: [['akiko', 'I know. I know she is.']] },
        { label: "You don't have to forgive her. Just come.", then: [['akiko', "Forgive her? I'm the one who got on the train."]] },
        { label: 'The morning glories are up.', then: [['akiko', '...She told you that? I planted the first ones. I was six. She let me use her good trowel.']] },
      ] },
      ['akiko', 'My shift ends at ten. The first train to Aoshima leaves at five.'],
      ['akiko', "I've bought that ticket eleven times. Eleven. I always end up back here, tying this apron."],
      ['akiko', "Not yet. I'm sorry. Not yet. Don't tell her you found me. Let me find a way to do this properly."],
    ],
  },
  'c5-arrive': {
    note: "Mum is home, really home. Grandma comes home on Sunday. We're getting the depot ready.",
    lines: [
      ['akiko', "Don't look at me like that. Ogawa and I are allowed to be friends. He made me tea. He still won't let anyone else touch his kettle."],
      ['akiko', "The street's smaller than I remember. Or I'm bigger. Hayashi-sensei cried at me for ten minutes outside the bakery."],
      ['akiko', 'The hospital says Mum can come home on Sunday. Ogawa wants to welcome her at the depot. Properly.'],
      { who: 'akiko', line: '...', choose: [
        { label: 'What do we need?', then: [['akiko', 'Morning glories from Ishida-san. Lanterns from Yoshino-san, she runs the festival. And the bike. Rin says the new tyres are in.']] },
        { label: 'Are you nervous?', then: [['akiko', "Terrified. Twenty years of things to say, and I can't think of one. Help me keep my hands busy: Ishida-san's flowers, Yoshino-san's lanterns, Rin's tyres."]] },
      ] },
      ['akiko', "You know the route better than I do now. That's a strange thing to say out loud."],
    ],
  },
  'c5-home': {
    note: "Grandma came home. 'You're late,' she told Mum. 'Twenty years late.' Then: 'I never forgot you. Not for one morning.' Tomorrow, the sunrise round.",
    lines: [
      ['n', 'Mum drives to the hospital in your car at noon, both hands on the wheel. Grandma tells her the whole way back that she is driving too slowly.'],
      ['n', 'Grandma sits by the shutter under the lanterns. She looks smaller than her voice on the phone. She looks at the flowers, at the bicycle. Then she looks at Mum.'],
      ['grandma', "...You're late."],
      ['akiko', 'I know.'],
      ['grandma', 'Twenty years late.'],
      ['akiko', "I know, Mum. I'm sorry. I'm so sorry."],
      ['grandma', "I set out two bowls this morning. The nurse said, Chiyo-san, who is the other bowl for? I said, my daughter. She's coming home today."],
      ['grandma', "I forget a lot of things now. What day it is. Whether I've eaten. I never forgot you. Not for one morning."],
      ['n', 'Mum is crying. Grandma is crying. Ogawa is suddenly very busy with his kettle.'],
      { who: 'grandma', line: 'And you. You did my route.', choose: [
        { label: 'Every slip on the board.', then: [['grandma', 'I know. Ishida-san called. And Ōta-san. And Hayashi-sensei, twice. You have my frown and your mother\'s stubbornness. Heaven help this town.']] },
        { label: 'I had help.', then: [['grandma', "Everyone does, dear. That's what a route is. It's not the road. It's the people at the end of it."]] },
      ] },
      ['grandma', 'Tomorrow, before the sun comes up. The three of us. One more sunrise round. Akiko rings the bell.'],
      ['akiko', "I'll ring the bell."],
    ],
  },
  // ── Chapter 5 · Melon Pan
  'm-call': {
    phone: 'in', caller: 'grandma', place: 'Aoshima General Hospital',
    note: 'Mum visits Grandma every evening now. She sits for an hour and peels her an apple and says nothing. Grandma wants melon pan and her yuzu hand cream, sent through Mum.',
    lines: [
      ['grandma', "Hello? Is this the delivery service? I'd like to complain about the food in this hospital."],
      ['grandma', "...It's me, dear. I'm teasing. I'm having a good day. I know exactly who you are today."],
      ['grandma', "Your mother came. Yesterday, and the day before. She sits in the chair by the window and peels me an apple, and she doesn't say a word. Then she says 'goodnight, Mum' and catches the last train."],
      { who: 'grandma', line: 'Twenty years, and she peels an apple exactly the way I taught her. Away from the thumb.', choose: [
        { label: 'Does she talk to you?', then: [['grandma', "Not yet. That's all right. I didn't talk for twenty years either. I wrote letters and kept them in a tin. We're a family of cowards, dear. Very polite cowards."]] },
        { label: 'Do you talk to her?', then: [['grandma', 'I talk about the weather. For an hour. I have become an expert on clouds. Coward\'s work.']] },
      ] },
      ['grandma', 'Now. Two things. The food here tastes of paper. Bring me a melon pan from the konbini. The kind with the crunchy top.'],
      ['grandma', "And the yuzu hand cream from the drugstore. Akiko bought it for me with her pocket money when she was nine. Give them to her at the café, not to me. She'll bring them up. It'll give her something to do with her hands."],
    ],
  },
  'm-akiko': {
    note: "Mum took the care package up to the hospital. 'She still uses the yuzu one,' she said. Grandma sent it through her on purpose, so she'd have something to say.",
    lines: [
      ['akiko', 'Melon pan. Yuzu hand cream. And... she sent the radio. With the tape on the dial.'],
      ['akiko', "She listened to the shipping forecast on this every night. 'Northeasterly, three, rain later.' I used to fall asleep to it."],
      { who: 'akiko', line: "She asked you to give it to me, instead of taking it to her yourself. Didn't she.", choose: [
        { label: 'She wanted you to have a reason.', then: [['akiko', "...She always did that. When we'd had a fight she'd send me to the shop for soy sauce. So I'd have to come back."]] },
        { label: 'She says you peel apples like her.', then: [['akiko', 'Away from the thumb. She used to slap my hand if I did it the other way. I can still feel it.']] },
      ] },
      ['akiko', 'I sit there every night with twenty years of things to say, and I talk about nothing. She talks about clouds. I talk about nothing.'],
      ['akiko', "Tonight I'll put the cream on her hands. Maybe that's a start. Thank you. Go on, you've got a round."],
    ],
  },
  // ── Chapter 6 · The Ledger
  'l-ledger': {
    flag: 'ledgerRead',
    note: "Ogawa showed me the depot ledger. The summer Mum was ten, there's a second name on Grandma's round in wobbly pencil: 'A. HINATA. HELPER.' He says Haruki has Mum's old camera.",
    lines: [
      ['ogawa', "You keep looking at the shelf. Go on, then. That's the ledger. Every round since 1987. Every rider. Every slip."],
      ['n', "Ogawa turns the pages without looking, like he knows them by touch. He stops. Under Grandma's name, in pencil, in big wobbly capitals: 'A. HINATA. HELPER. 2 ROUNDS.'"],
      ['ogawa', "She was ten. She wrote herself in. Chiyo let her. Every summer after that there are two names on the morning round."],
      { who: 'ogawa', line: "...Then there aren't.", choose: [
        { label: 'What happened on the platform?', then: [['ogawa', "That's theirs to tell. I'll say this much. I drove her to the station. Chiyo never forgave me. I never forgave me either."]] },
        { label: 'You knew Mum well.', then: [['ogawa', 'I taught her to fix a chain. She taught me to use a self-timer. We were the only two people in this town who thought she should go to Tokyo. Turns out I was half right.']] },
      ] },
      ['ogawa', "Her camera. The old silver one. Chiyo couldn't keep it in the house and couldn't throw it out, so she gave it to Haruki. He's kept it oiled for twenty years."],
      ['ogawa', "Take it to her. Don't say it's from me."],
    ],
  },
  'l-akiko': {
    note: "Mum told me about the platform. Ogawa drove her to the station; Grandma came running in her slippers, in the rain. Mum thinks Ogawa must hate her for leaving him to look after Grandma alone.",
    lines: [
      ['n', "Mum holds the camera in both hands, the way you'd hold a bird."],
      ['akiko', 'He kept the strap. I made this strap out of an old bicycle inner tube. It still smells of rubber.'],
      ['akiko', 'You want to know about the platform. Everybody wants to know about the platform.'],
      ['akiko', 'I had a place at a photography school in Tokyo. Mum said no. Ogawa drove me to the station at four in the morning anyway. And Mum came running down the platform in her slippers, in the rain, shouting.'],
      { who: 'akiko', line: "She said if I got on that train, I shouldn't bother coming back. So I got on the train.", choose: [
        { label: 'She was scared. She says so in every letter.', then: [['akiko', 'I know that now. I was nineteen. At nineteen, scared and angry look exactly the same.']] },
        { label: 'And Ogawa?', then: [['akiko', 'Ogawa stayed. He looked after her and the round for twenty years, and I sent nothing. Not even a postcard. He must hate me.']] },
      ] },
      ['akiko', "He loves strawberry daifuku. He pretends he doesn't. He used to steal them off Mum's plate."],
      ['akiko', "Take him one. Don't say it's from me. ...I'm a coward too, apparently. It runs in the family."],
    ],
  },
  'l-ogawa': {
    note: "Ogawa knew who the sweet was from straight away. He thinks Mum never forgave him for driving her. She thinks he blames her for leaving. They're both wrong.",
    lines: [
      ['ogawa', '...You brought me something.'],
      ['ogawa', 'Nobody in this town knows what I like. Chiyo knows. And one other person.'],
      { who: 'ogawa', line: 'She told you.', choose: [
        { label: 'She said not to say.', then: [['ogawa', "Ha. That means yes. That girl never could lie. Her ears go red. Same as Chiyo's."]] },
        { label: 'I just guessed.', then: [['ogawa', "You're a worse liar than she is. That's an achievement."]] },
      ] },
      ['ogawa', 'I drove her to the station. I thought she would never forgive me for not stopping, and Chiyo would never forgive me for going. I got the second one right.'],
      ['ogawa', "Twenty years. I could have called her. One phone call. I kept her number on the wall by the kettle. It's still there."],
      ['ogawa', 'Hm. Get back to work.'],
    ],
  },
  // ── Chapter 7 · Four Doors
  'd-call': {
    phone: 'in', caller: 'grandma', place: 'Aoshima General Hospital',
    note: "Grandma can come home in a couple of weeks. No bicycle for a year, and nothing she has to fold herself into. She is not getting into 'that red rocket' of mine.",
    lines: [
      ['grandma', 'Good news and bad news, dear. The good news: the doctor says I can come home. Not yet. Soon. A couple of weeks.'],
      ['grandma', "The bad news: no bicycle. For a whole year. And nothing I have to fold myself into. My hip, he says. As if I don't know where my own hip is."],
      { who: 'grandma', line: 'And I am not getting into that rocket of yours. Ogawa sent me a photo. It looks like a lipstick.', choose: [
        { label: "It's a very good car, Grandma.", then: [['grandma', "So is a rocket. I'm not getting into one of those either."]] },
        { label: "I'll find you something with doors.", then: [['grandma', 'Four of them, please. And a seat at a height where a lady can sit down with some dignity.']] },
      ] },
      ['grandma', "Talk to Ogawa. He's been keeping something for this. He thinks I don't know."],
    ],
  },
  'd-ogawa': {
    money: 10000, moneyNote: "Grandma's envelope: 'For the van'",
    note: "Ogawa gave me Grandma's envelope: ¥10,000 in tips she put aside over forty years, 'for the van'. Hinode Motors is under the tracks in Shinjuku. Test drives are free.",
    lines: [
      ['ogawa', 'So. She told you about the hip.'],
      ['n', "He opens the drawer under the till and takes out a brown envelope, soft from handling. On the front, in Grandma's handwriting: 'For the van. Do NOT spend on the roof.'"],
      ['ogawa', 'Tips. Forty years of them. Every coin anybody ever pressed into her hand at the door went in here, and then she lent most of it to the neighbours.'],
      ['ogawa', "Ten thousand left. It's not a car. But it's a start, and it's hers, and she'd want it spent on getting her home."],
      { who: 'ogawa', line: "Hinode Motors, under the tracks in Shinjuku. Tell them Ogawa sent you. They'll ignore that, but tell them.", choose: [
        { label: 'What kind of car?', then: [['ogawa', 'Four doors. A high seat. Room in the back for a folded wheelchair, just in case. A little kei car would do. The van would do better, if you can save for it. Drive a few first.']] },
        { label: "I'll keep the envelope.", then: [['ogawa', "Ha. Spend the money. Keep the envelope. That's what she'd do."]] },
      ] },
      ['ogawa', 'Save up, try a few, and bring home something she can climb into without swearing. She will swear anyway. But less.'],
    ],
  },
  'd-mum': {
    phone: 'in', caller: 'akiko', place: 'Shinjuku',
    note: "Mum heard about the car. She asked if the boot is big enough for a suitcase. 'Asking for a friend.'",
    lines: [
      ['akiko', "Ogawa sent me a picture of you holding a car key. He hasn't sent me a picture of anything in twenty years and now it's every day."],
      ['akiko', 'Is it safe? Do you check your mirrors? Mum never checked her mirrors. She rode that bike like the road owed her money.'],
      { who: 'akiko', line: '...How big is the boot?', choose: [
        { label: 'Big enough for a suitcase.', then: [["akiko", "...Good. That's good. I was asking for a friend."]] },
        { label: 'Why?', then: [['akiko', 'No reason. Hypothetically. If somebody had a suitcase. Somebody who is not me.']] },
      ] },
      ['akiko', 'Drive carefully. I mean it.'],
    ],
  },
  // ── Chapter 8 · Photo Club
  'k-mei': {
    flag: 'meiAsked',
    note: "Mei found Mum's sunrise photo on the wall of the Aoshima High photo club: first prize, 2004. Her own contest is on Friday and she thinks her photos are 'fine'. She wants Mum to look at them.",
    lines: [
      ['mei', 'You! Delivery person! Wait! Is your mum Hinata Akiko?'],
      ['mei', "There's a photo in our club room. The harbour at sunrise, with the crane. First prize, prefecture contest, 2004. Everyone walks past it. I read the label yesterday. 'Hinata Akiko, second year.'"],
      ['mei', 'Haruki-san at the darkroom says she was the best photographer the school ever had. He says she was terrifying.'],
      { who: 'mei', line: "The contest is Friday. My photos are... fine. They're fine. Fine is the worst word.", choose: [
        { label: 'Want her to look at them?', then: [['mei', 'Would she? Would she really? Oh no. Oh no, now I have to choose which ones.']] },
        { label: "She hasn't picked up a camera in years.", then: [['mei', 'Haruki-san says she phoned him last night and ordered six rolls of film and forgot to say hello.'], ['mei', 'So... maybe she would look? Just look?']] },
      ] },
      ['mei', "I'll put them in an envelope. Come and get them. Please don't let them get wet."],
    ],
  },
  'k-akiko': {
    flag: 'meiNotes',
    note: "Mum spent her whole break on Mei's prints and wrote on the back of every one. She says Mei isn't fine. She's good, and frightened, and at seventeen those feel the same.",
    lines: [
      ['akiko', 'This one. The bicycle in the puddle. She almost got it. She was scared of it, so she stepped back. You can always tell when someone steps back.'],
      ['akiko', "And this one, the old man feeding the cat. That's Murakami-san, isn't it. She got him. She got exactly him."],
      { who: 'akiko', line: "She thinks they're 'fine'?", choose: [
        { label: 'Her word.', then: [["akiko", "They're not fine. They're good, and she's frightened. At seventeen those feel exactly the same. Trust me."]] },
        { label: 'She says you won that contest.', then: [['akiko', 'With a photo of the harbour Mum woke me at four to take. I complained the whole way down the hill. Do not tell Mei that part.']] },
      ] },
      ['n', "Mum writes on the back of every print in small, neat pencil. Her handwriting looks almost exactly like Grandma's."],
      ['akiko', 'Take them back to her. Tell her: get closer. Always one step closer than you want to.'],
    ],
  },
  'k-mei2': {
    note: "Mei reshot the bicycle in the puddle, one step closer, and made the contest final. The exhibition is at the town hall in autumn. She wants Mum to come.",
    lines: [
      ['mei', "'Get closer.' She wrote it on every single one! Even the good ones! Especially the good ones!"],
      ['mei', "I reshot the puddle. I lay down in it. My mum is going to kill me. It's the best photo I've ever taken."],
      ['mei', "I'm in the final. The exhibition's at the town hall in the autumn."],
      { who: 'mei', line: 'Do you think she would come? To Aoshima? To see it?', choose: [
        { label: "I'll ask her.", then: [['mei', "Don't ask. Just tell her the date. That's what Haruki-san says. 'With Hinata women, you don't ask. You tell them the date.'"]] },
        { label: "She's thinking about it.", then: [['mei', 'Then she is coming. My grandma says thinking about it is just coming home slowly.']] },
      ] },
    ],
  },
  // ── Chapter 9 · Typhoon Night
  't-warn': {
    phone: 'in', caller: 'akiko', place: 'Shinjuku',
    note: "Typhoon No. 14 has turned up the coast. Mum asked me to check on the old folks: Murakami-san's workshop floods first, and Hayashi-sensei lives alone.",
    lines: [
      ['akiko', "Are you inside? Have you seen the news? Typhoon Fourteen. It's turned. It's coming straight up the coast."],
      ['akiko', "Listen. Murakami-san's workshop floods first, it always has, and he won't leave it. And Hayashi-sensei lives on her own and she'll never ask for help. She'll sit in the dark with a candle marking homework from 1990."],
      { who: 'akiko', line: 'Mum used to go round all of them. Every typhoon. With a torch and rice crackers.', choose: [
        { label: "I'll go round.", then: [['akiko', "Thank you. Find Officer Endō, he'll know who needs what. Stay off the harbour road. I mean it."]] },
        { label: 'You could come and help.', then: [["akiko", "The trains have stopped. ...And I'm not ready. I'm sorry. Find Officer Endō. Please be careful."]] },
      ] },
    ],
  },
  't-endo': {
    flag: 'stormDuty',
    note: "Officer Endō gave me two storm jobs: sandbags for Murakami-san's workshop door, and a storm kit for Hayashi-sensei. Both are at the depot.",
    lines: [
      ['endo', "Hinata's grandkid! Good. I've got sixty houses, one bicycle, and the wind took my hat an hour ago."],
      ['endo', "Two things I can't get to. Sandbags for Murakami-san's workshop door, before the drains go. And a storm kit for Hayashi-sensei: torch, radio, water, rice crackers. Both waiting at the depot."],
      { who: 'endo', line: 'Your grandmother used to do the storm round with me, you know. Out in this in a raincoat and a helmet, shouting at me to keep up.', choose: [
        { label: "I'll take both.", then: [['endo', 'Good. Drive slowly, the roads are rivers tonight.']] },
        { label: 'Was she really?', then: [['endo', "Typhoon of '98, she carried Murakami-san's lathe up the stairs with him. I was twenty-three. I thought she was the scariest person alive. I still do."]] },
      ] },
    ],
  },
  't-hayashi': {
    flag: 'essayGiven',
    note: "Hayashi-sensei kept one essay from every class she taught. She gave me Mum's, from when she was nine: 'What I Want to Be'. She wants to take the sunrise home to her mum.",
    lines: [
      ['n', "Hayashi-sensei's house is dark except for one candle and the torch you brought. The rain is loud on the roof. She has a cardboard box on her knees."],
      ['hayashi', 'Forty years of teaching. I kept one essay from every class. Just one. The one that made me want to come back on Monday.'],
      ['hayashi', "1996. Grade three. 'What I Want to Be When I Grow Up.' Thirty-one children wanted to be footballers and one wanted to be a cake."],
      ['n', 'She hands you a sheet of squared paper, soft at the folds. Pencil. A drawing of a bicycle with a box on the back, and the sun coming up behind it.'],
      ['hayashi', "'I want to take photographs of the sunrise, so that when my mum comes home tired from the round, she can see the part she missed because she was working.'"],
      { who: 'hayashi', line: 'I always meant to give it back. Then she was gone, and it felt like it belonged to the town.', choose: [
        { label: "I'll take it to her.", then: [['hayashi', "Yes. I think that's what it has been waiting for. Take it when the rain stops. Don't you dare let it get wet."]] },
        { label: 'She did take those photographs.', then: [['hayashi', "She did. The one in the school. Chiyo keeps a copy in her purse. She showed me at the hospital. She's very proud, and she'd rather die than say so."]] },
      ] },
      ['n', 'Outside, the wind is dropping. The rain is just rain now.'],
    ],
  },
  't-mum': {
    note: "Mum read her essay in the café doorway, then untied her apron and quit. 'I've been tired for twenty years,' she said, 'and I missed the part where the sun comes up.'",
    lines: [
      ['n', 'Mum reads it in the café doorway, in her apron, with water dripping off the awning. She reads it again.'],
      ['akiko', "'So that when my mum comes home tired from the round, she can see the part she missed.'"],
      ['akiko', 'I forgot I wrote this. I forgot I wanted that. I thought I wanted to get away. I wanted to bring her the sunrise.'],
      { who: 'akiko', line: '...', choose: [
        { label: 'You still can.', then: [['akiko', '...Yeah. Yeah, I think I still can.']] },
        { label: 'She keeps your photo in her purse.', then: [['akiko', "She does not. She... Does she? Hayashi-sensei told you that? ...Oh, Mum."]] },
      ] },
      ['n', 'She unties her apron, folds it very neatly, and puts it on the counter.'],
      ['akiko', "I just quit my job. I've been tired for twenty years and I missed the part where the sun comes up. Give me a day to pack. I'll call you."],
    ],
  },
  // ── Chapter 10 · The First Train
  'p-call': {
    phone: 'in', caller: 'akiko', place: 'Outside the café, Shinjuku', flag: 'pickup',
    note: "Mum walked to the station with her suitcase and couldn't get on the train. She's waiting outside the café. She asked me to come and get her in the car.",
    lines: [
      ['akiko', "Hi. It's me. Don't be cross."],
      ['akiko', 'I walked to the station. I had the ticket in my hand. I stood on the platform and watched three trains go. Then I walked back to the café with my suitcase, like an idiot.'],
      { who: 'akiko', line: "It's the platform. It's the same kind of platform. I keep hearing her shouting.", choose: [
        { label: "I'll come and get you.", then: [["akiko", "...Would you? In the car? I know it's far. I know it's silly."]] },
        { label: "It's not silly.", then: [['akiko', 'You are very kind. You get that from her, not me. Could you come and get me? In the car?']] },
      ] },
      ['akiko', "I'm outside the café. I'll be the one sitting on a suitcase pretending not to cry. Drive carefully."],
    ],
  },
  'p-home': {
    note: "I brought Mum home. Ogawa met us at the shutter and said 'Kettle's on.' That was the whole conversation. She's sleeping in Grandma's old office above the depot until Sunday.",
    lines: [
      ['n', "Mum doesn't say anything the whole drive. At the top of the hill, where you can see the harbour and the crane, she asks you to stop for a minute. She doesn't get out. She just looks."],
      ['akiko', "It's smaller. Everything's smaller. The crane's the same."],
      ['n', 'At the depot, Ogawa is standing at the shutter before the engine stops. They look at each other for a long time.'],
      ['ogawa', "Kettle's on."],
      ['akiko', '...Thank you.'],
      ['n', 'He goes back inside. That is the whole conversation.'],
      { who: 'akiko', line: "Twenty years, and that's all he says. Kettle's on.", choose: [
        { label: 'He kept your number by the kettle.', then: [['akiko', '...He what?'], ['n', 'She looks at the shutter for a long time.']] },
        { label: 'Give him time.', then: [["akiko", "He's given me twenty years. I suppose I can give him a week."]] },
      ] },
      ['akiko', "I can't go to the house. Not before Mum. I'll sleep upstairs, in her old office. Go on, finish your round. I'll be here. I'm actually here."],
    ],
  },
  'p-grandma': {
    phone: 'in', caller: 'grandma', place: 'Aoshima General Hospital',
    note: "Grandma knows Mum is home. She wouldn't talk to her on the phone. 'I want to see her face. I've waited twenty years. I can wait till Sunday.'",
    lines: [
      ['grandma', 'Ogawa phoned me. He was crying, the old fool. He said it was hay fever. In this weather.'],
      ['grandma', 'Is she there? Is she really there?'],
      { who: 'grandma', line: '...', choose: [
        { label: 'She is. Do you want to talk to her?', then: [["grandma", "No. No, don't put her on. Not on the telephone. I want to see her face. I've waited twenty years. I can wait till Sunday."]] },
        { label: 'She brought one suitcase.', then: [["grandma", "One suitcase. She left with one suitcase. The same one, I'll bet. She never throws anything away either. We're terrible."]] },
      ] },
      ['grandma', "Tell her... no. Don't tell her anything. Tell her to eat something. She never eats when she's nervous."],
    ],
  },
  // ── Chapter 11 · Two Forks
  'u-ogawa': {
    money: 1000, moneyNote: 'Ogawa: "for the cake"',
    note: "Mum and Ogawa have said nine words in three days. Ogawa asked me to buy her a strawberry shortcake from the café: Grandma bought her one every birthday. 'Don't say it's from me.'",
    lines: [
      ['ogawa', "Nine words. In three days. I counted. 'Morning.' 'Morning.' 'Excuse me.' 'Sorry.' 'Tea?' 'Thanks.'"],
      ['ogawa', "That's six. I'm being generous with the other three."],
      { who: 'ogawa', line: "Twenty years and I don't know how to say good morning to her properly.", choose: [
        { label: 'She thinks you hate her.', then: [['ogawa', 'Hate her? I... Is that what... Hm. Hm.'], ['n', 'He polishes a cup that is already clean, for quite a long time.']] },
        { label: 'Just say it.', then: [["ogawa", "Easy for you. You're young. Your face hasn't set yet."]] },
      ] },
      ['ogawa', 'Strawberry shortcake. From the café in Shinjuku. Chiyo bought her one every birthday. Every single one, until she left. They ate it on the depot steps with two forks.'],
      ['n', 'He hands you a thousand-yen note, takes it back, then hands it to you again.'],
      ['ogawa', "Get one. Give it to her. Don't say it's from me."],
    ],
  },
  'u-akiko': {
    note: 'Mum knew the shortcake was from Ogawa before she opened the box. She took it downstairs with two forks.',
    lines: [
      ['akiko', 'Strawberry shortcake.'],
      ['akiko', 'Mum bought me one every birthday. Every year. Two forks, on the depot steps, before the afternoon round.'],
      { who: 'akiko', line: "This isn't from you, is it.", choose: [
        { label: 'He said not to say.', then: [['akiko', 'That means yes. His ears go red when he lies. Did his ears go red?'], ['n', 'You nod. She laughs, properly, for the first time since she got here.']] },
        { label: "It's from me.", then: [["akiko", "Your ears have gone red. You've been spending too much time with Ogawa."]] },
      ] },
      ['akiko', 'He thinks I blame him for driving me. I thought he blamed me for leaving her. Twenty years of two idiots being sorry in different buildings.'],
      ['akiko', "I'm going downstairs. I'm taking two forks."],
    ],
  },
  'u-ogawa2': {
    note: "Mum and Ogawa ate the whole shortcake on the depot steps and talked for two hours. He says she still tells terrible jokes. He's been smiling all morning and denying it.",
    lines: [
      ['ogawa', 'Two hours. On the steps. We ate the whole thing. My doctor would have something to say.'],
      ['ogawa', "She said I still make terrible tea. I said she still tells terrible jokes. Then neither of us said anything for a while, and that was all right too."],
      { who: 'ogawa', line: "...Thank you. For carrying things between stubborn people. You've done a lot of that this summer.", choose: [
        { label: "It's the job.", then: [["ogawa", "It is. It's exactly the job. Chiyo always said so. The parcel's just the excuse."]] },
        { label: "You're smiling.", then: [["ogawa", "I am not. It's hay fever."]] },
      ] },
      ['ogawa', "Sunday, then. Let's get this place ready for her. Properly."],
    ],
  },
};

// The finale: five shots at dawn with subtitles, then the title and the credits.
export const FINALE = {
  title: 'The Sunrise Round', jp: '日の出の配達',
  shots: [
    { cap: 'Aoshima · 04:50', subs: [['n', 'Aoshima, ten to five. The streetlights are still on.'], ['n', 'Three people and one bicycle leave the depot.']] },
    { cap: 'The depot · 05:05', subs: [['grandma', "Left at the bakery. Ishida-san first. She'll pretend she's asleep."], ['akiko', "She's standing at her window, Mum. She's waving."]] },
    { cap: 'Asahi-dōri · 05:20', subs: [['n', 'Mum rings the bell at every corner. Nobody complains.'], ['grandma', 'When you were small, you rang it so much the Tanakas wrote to the post office.'], ['akiko', 'I remember. I remember all of it.']] },
    { cap: 'Minato-dōri · 05:35', subs: [['grandma', "This is where I took the photo. You were fifteen. You said, 'Mum, one day I'll photograph the whole world.'"], ['akiko', 'I did. None of them were as good as this one.']] },
    { cap: 'Sunrise · 05:50', subs: [['n', 'The sun comes up over Aoshima.'], ['grandma', 'Hinode. Your grandfather named the round after it. The first light belongs to whoever is already working.'], ['n', 'Tomorrow the route is yours again. This morning, it belongs to all three of you.']] },
  ],
  credits: [
    ['h', '日の出配送 · HINODE'],
    ['s', 'The Sunrise Round'],
    ['gap'],
    ['r', 'Created by', 'cam · SynchronizingFrames'],
    ['gap'],
    ['t', 'The family'],
    ['r', 'Grandma', 'Hinata Chiyo'],
    ['r', 'Mum', 'Hinata Akiko'],
    ['r', 'The courier', 'You'],
    ['gap'],
    ['t', 'Aoshima'],
    ['cast'],
    ['r', 'The darkroom', 'Haruki Mori'],
    ['r', 'The morning glories', 'Fumiko Ishida'],
    ['r', 'The letters', 'Michiko Ōta'],
    ['r', 'The bicycles', 'Rin Kaneko'],
    ['r', 'The festival committee', 'Setsuko Yoshino'],
    ['gap'],
    ['p', 'Built entirely in code: procedural models, shaders, weather and light. No downloaded assets.'],
    ['p', 'Aoshima, its people and its shops are fictional.'],
    ['gap'],
    ['h', 'Thank you for riding.'],
    ['k', '終'],
  ],
};
