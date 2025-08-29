export type MatchUpdate = {
    matchId: string;
    version: number;           
    timestamp: number;         
    score: {
      batting: string;
      runs: number;
      wickets: number;
      overs: number;           
      ballsDelivered: number;
    };
    commentary: string;
};
  
const state: Record<string, MatchUpdate> = {};
  
function initMatch(matchId = "INDvAUS") {
    if (state[matchId]) return;
    state[matchId] = {
      matchId,
      version: 1,
      timestamp: Date.now(),
      score: {
        batting: "IND",
        runs: 0,
        wickets: 0,
        overs: 0,
        ballsDelivered: 0
      },
      commentary: "Match started"
    };
}
  
export function getMatch(matchId = "INDvAUS"): MatchUpdate {
    initMatch(matchId);
    return state[matchId];
}
  
export function mutateMatch(matchId = "INDvAUS"): MatchUpdate {
    const s = getMatch(matchId);
    const deltaRuns = [0, 1, 2, 3, 4, 6][Math.floor(Math.random() * 6)];
    let { runs, wickets, overs, ballsDelivered } = s.score;
    ballsDelivered += 1;
    if (ballsDelivered === 6) {
        overs = Math.ceil(overs);
        ballsDelivered = 0;
    } else {
        overs += 0.1;
    } 
    // every ~20% chance of wicket
    let wicketTaken=0
    if (Math.random() < 0.4 && wickets < 10) 
        wickets++, wicketTaken=1;
    else
        runs += deltaRuns;
  
    s.version += 1;
    s.timestamp = Date.now();
    s.score = { ...s.score, runs, wickets, overs, ballsDelivered };
    s.commentary = wickets >= 10
      ? "Innings over"
      : wicketTaken ? "Wicket!" : 
        deltaRuns === 0
            ? "Dot ball"
            : `Scored ${deltaRuns}!`;
  
    state[matchId] = s;
    return s;
}
  
export function startSimulator(matchId = "INDvAUS", onUpdate?: (u: MatchUpdate) => void): void {
    initMatch(matchId);
    const tick = () => {
      const wait = 3000 + Math.floor(Math.random() * 4000);
      setTimeout(() => {
        const u = mutateMatch(matchId);
        onUpdate?.(u);
        console.log('\t Updated score at ', (new Date()).toLocaleTimeString())
        if (u.score.wickets < 10) tick();
      }, wait);
    };
    tick();
}
  