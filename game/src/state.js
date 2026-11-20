// Match state: one plain object the simulation owns. Rendering only reads
// it, it never writes back, so a round can be reasoned about from this file
// alone. Phase names are the only strings main.js and the HUD agree on.
export const PHASE = {
  BUY: 'buy',
  LIVE: 'live',
  PLANTED: 'planted',
  OVER: 'over',
  MATCH: 'match',
};

export function createState() {
  return {
    phase: PHASE.BUY,
    round: 1,
    winsToTake: 5,
    roundTime: 100,
    timeLeft: 100,
    buyTime: 12,
    score: { vanguard: 0, cinder: 0 },
    money: 800,
    kills: 0,
    deaths: 0,
    bomb: {
      state: 'idle',
      site: null,
      plantLeft: 0,
      defuseLeft: 0,
      timer: 30,
      x: 0,
      z: 0,
    },
    message: '',
    messageAt: 0,
    elapsed: 0,
    winner: null,
    matchWinner: null,
  };
}

// The money rules, kept in one place so the buy menu, the HUD and the
// round-end payout can never disagree with each other.
export const ECONOMY = {
  start: 800,
  kill: 300,
  roundWin: 325,
  roundLoss: 200,
  plant: 300,
  defuse: 300,
};
