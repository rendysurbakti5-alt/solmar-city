// A small seeded random number generator (mulberry32): the same seed always builds the same
// city and stages the same screenshot scenes, which is what makes the game reproducible.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A helper bundle over one seeded stream: ranges, picks and chances the builders share. */
export function createRng(seed) {
  const random = createRandom(seed);
  return {
    random,
    /** Float in [min, max). */
    range(min, max) {
      return min + random() * (max - min);
    },
    /** Integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(random() * (max - min + 1));
    },
    /** One element of a non-empty array. */
    pick(items) {
      return items[Math.floor(random() * items.length)];
    },
    /** True with the given probability. */
    chance(probability) {
      return random() < probability;
    },
  };
}
