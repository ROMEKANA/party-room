import {DEFAULT_TURN_SECONDS,RESULT_DISPLAY_MS_CHOICES,TURN_SECONDS_CHOICES} from './time-settings.js';

export const NUMBER_CHOICES = {
  handSize:[9,12,15], penalty:[0,1,2,3], carryExtreme:[true,false],
  seconds:TURN_SECONDS_CHOICES, revealMs:RESULT_DISPLAY_MS_CHOICES, judgmentMs:RESULT_DISPLAY_MS_CHOICES,
};

export const NUMBER_DEFAULTS = {
  handSize:9, penalty:1, carryExtreme:true,
  seconds:DEFAULT_TURN_SECONDS,
  revealMs:1000, judgmentMs:2000,
};

export const NUMBER_BASIC_FIELDS = {
  handSize:'手札枚数', penalty:'重複ペナルティ', carryExtreme:'最大値・最小値重複時の持ち越し',
};

export function numberSettingsSummary({handSize,penalty,carryExtreme}) {
  return {handSize,penalty,carryExtreme};
}

export const handCards = size => Array.from({length:size},(_,index)=>index+1);

export function pointCards(size) {
  const negativeCount = size / 3;
  return Array.from({length:size},(_,index)=>index-negativeCount+Number(index>=negativeCount));
}
