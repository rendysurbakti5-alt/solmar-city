// The story of Solmar City, as data: six missions for Santi Reyes, a wheelman back in his
// home town with empty pockets, working for Paloma Duarte of Club Palma. Each mission is a
// list of steps the game runs in order — get a car, reach a place, steal a named car, carry
// a passenger, lose the police — with the talk that brackets them. Places are named for the
// city's own landmarks; the game resolves them against the map it built.

export const HERO = 'Santi';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'Santi Reyes. Three years gone and you walk into my club on foot?'],
      ['Santi', 'Bus dropped me at the coast road, Paloma. I am that broke.'],
      ['Paloma', 'Then earn. Find yourself a car — any car, I am not proud — and bring it here.'],
      ['Paloma', 'A wheelman without wheels is just a man. Do not be just a man.'],
    ],
    steps: [
      { type: 'getcar', label: 'Get into a car (F near a car)' },
      { type: 'goto', at: 'club', r: 90, label: 'Drive to Club Palma' },
    ],
    reward: 150,
    outro: [
      ['Paloma', 'She runs. Good. You still have the hands, Santi.'],
      ['Paloma', 'Small money today. Bigger money when you prove the head matches.'],
    ],
  },
  {
    id: 'cold-cooler',
    title: 'Cold Cooler',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'A cooler waits at the end of the marina pier. Fish, ice, and one thing that is not fish.'],
      ['Santi', 'Let me guess. I do not open it.'],
      ['Paloma', 'You learn fast. Take it to the Motel Palma, room side, Palm Heights. Quick and quiet.'],
    ],
    steps: [
      { type: 'pickup', at: 'pier', r: 70, label: 'Pick up the cooler at the marina pier' },
      { type: 'goto', at: 'motel', r: 95, label: 'Deliver the cooler to Motel Palma', inCar: true },
    ],
    reward: 250,
    outro: [
      ['Paloma', 'The motel manager sends his thanks and asks no questions. Perfect customer.'],
      ['Paloma', 'You drive like the city still loves you. It might.'],
    ],
  },
  {
    id: 'aurora',
    title: 'Aurora',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'An Aurora GT sits in the port lot, east side. Orange. Loud. A collector in the north wants it.'],
      ['Santi', 'And the owner wants to keep it, I suppose.'],
      ['Paloma', 'The owner is a cheat who owes me a year of rent. Tito at the garage will take it off your hands.'],
      ['Paloma', 'It will be noticed, Santi. Drive like you mean it.'],
    ],
    steps: [
      { type: 'steal', tag: 'aurora', label: 'Steal the orange Aurora GT from the port lot' },
      { type: 'goto', at: 'garage', r: 100, label: "Deliver the Aurora GT to Tito's Garage", needTag: 'aurora' },
    ],
    reward: 600,
    outro: [
      ['Tito', 'Ay. Look at her. The cheat kept her polished, I will give him that.'],
      ['Paloma', 'The collector pays tonight. Your cut is already in your pocket, wheelman.'],
    ],
  },
  {
    id: 'the-accountant',
    title: 'The Accountant',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'Marco, my accountant, is at the Old Town plaza with a head wound and a loud mouth.'],
      ['Paloma', 'Half the port is looking for him. The police will be too, once he starts shouting.'],
      ['Santi', 'Babysitting. Wonderful.'],
      ['Paloma', 'Get him to Solmar General. Then disappear until the sirens forget you.'],
    ],
    steps: [
      { type: 'pickup', at: 'plaza', r: 70, label: 'Pick up Marco at the Old Town plaza', passenger: 'Marco' },
      { type: 'goto', at: 'hospital', r: 100, label: 'Take Marco to Solmar General', inCar: true, wantedOnStart: 3 },
      { type: 'escape', label: 'Lose the police' },
    ],
    reward: 800,
    outro: [
      ['Marco', 'Tell Paloma the books are balanced! Tell her Marco bleeds but the books are BALANCED!'],
      ['Paloma', 'He lives. The books live. You are becoming expensive, Santi — and worth it.'],
    ],
  },
  {
    id: 'night-freight',
    title: 'Night Freight',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'A Burro van at the port is loaded with "frozen fish" for my warehouse in Palm Heights.'],
      ['Santi', 'More fish that is not fish.'],
      ['Paloma', 'The night watchman looks away for four minutes. The police, sadly, do not. Be quick.'],
    ],
    steps: [
      { type: 'steal', tag: 'freight', label: 'Take the loaded Burro van at the port' },
      { type: 'goto', at: 'warehouse', r: 105, label: 'Deliver the van to Palma Freight', needTag: 'freight', time: 240 },
    ],
    reward: 1000,
    outro: [
      ['Paloma', 'Frozen solid, every box. You could run this city\'s whole night, Santi.'],
      ['Paloma', 'One last job. The big one. Come and hear it.'],
    ],
  },
  {
    id: 'the-long-goodbye',
    title: 'The Long Goodbye',
    giver: 'Paloma',
    intro: [
      ['Paloma', 'The cheat from the port talked. Every badge in Solmar will be on the coast road tonight.'],
      ['Paloma', 'My plane waits at the airstrip, north-east. Get me there, and the club is yours.'],
      ['Santi', 'You are really leaving?'],
      ['Paloma', 'I am retiring undefeated. Drive, Santi. One last time — drive.'],
    ],
    steps: [
      { type: 'pickup', at: 'club', r: 80, label: 'Pick up Paloma at Club Palma', passenger: 'Paloma' },
      { type: 'goto', at: 'airstrip', r: 120, label: 'Get Paloma to Solmar Air airstrip', inCar: true, wantedOnStart: 4, time: 300 },
    ],
    reward: 2500,
    outro: [
      ['Paloma', 'Club Palma, the cooler route, all of it — yours now. Do not let Tito run it into the ground.'],
      ['Santi', 'Solmar City. My city. All right... let us see what trouble is left.'],
    ],
  },
];

/** Free-roam work between missions: what Tito pays for any car delivered to his garage. */
export const CHOP_SHOP_TEXT = "Tito's Garage buys any car, no questions";

/** The talk a finished story leaves the player with. */
export const STORY_DONE_TEXT = 'Story complete — Solmar City is yours. Tito still buys cars at the garage.';
