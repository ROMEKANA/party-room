export const PLAYER_AVATARS = Object.freeze({
  cat:'三毛猫',
  rabbit:'うさぎ',
  wolf:'オオカミ',
  flower:'花',
  candy:'飴',
  lemon:'レモン',
  ghost:'おばけ',
  reaper:'死神',
  boy:'男の子',
  girl:'女の子',
});

// The old color slots are independent of the picker order.
const legacyAvatars = ['cat','rabbit','flower','lemon','ghost','boy','wolf','reaper','candy','girl'];
export const isAvatarId = value => typeof value === 'string' && Object.hasOwn(PLAYER_AVATARS,value);
export const resolveAvatarId = (id,color) => isAvatarId(id) ? id : legacyAvatars[color] ?? 'cat';

export const MAX_PLAYER_NAME = 8;
export const PLAYER_NAME_ERROR = `名前を1〜${MAX_PLAYER_NAME}文字で入力してください。`;
export const normalizePlayerName = name => typeof name === 'string' ? name.trim().normalize('NFC') : '';
export const validPlayerName = (name,existing = false) =>
  Boolean(name && [...name].length <= (existing ? 20 : MAX_PLAYER_NAME) && !/[\p{Cc}]/u.test(name));
