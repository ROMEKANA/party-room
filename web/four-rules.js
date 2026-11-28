import {NUMBER_CHOICES,NUMBER_DEFAULTS} from './number-clash-rules.js';

export const FOUR_CHOICES = {
  size:[6,7,8,9],
  seconds:NUMBER_CHOICES.seconds,
  readyMs:NUMBER_CHOICES.readyMs,
  dropMs:[300,400,500,600,700,800,900,1000],
};

export const FOUR_DEFAULTS = {
  size:7, seconds:NUMBER_DEFAULTS.seconds, readyMs:NUMBER_DEFAULTS.readyMs, dropMs:500,
};

export const FOUR_COLORS = {
  blue:{label:'青',color:'#175bcc',ink:'#fff'},
  red:{label:'赤',color:'#d12d47',ink:'#fff'},
  green:{label:'緑',color:'#11804d',ink:'#fff'},
  yellow:{label:'黄',color:'#ffcf32',ink:'#242006'},
};
