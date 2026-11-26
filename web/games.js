export const TIER = 'tier';
export const CIRCLE = 'circle-cross';
export const BATTLE = 'unknown-battle';
export const GAMES = {
  [TIER]: {title:'みんなでtier表', min:2, max:10},
  [CIRCLE]: {title:'Circle & Cross', min:2, max:6},
  [BATTLE]: {title:'名前の知らないあのゲーム', min:2, max:10, modeMax:{boss:4}},
};
export const GAME_IDS = Object.keys(GAMES);
export const HISTORY_MINUTES = [30,60,120,180,300,1440];
export const DEFAULT_HISTORY_MINUTES = 120;
