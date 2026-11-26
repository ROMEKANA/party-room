export const JOB_BATTLE_FIXED = {hp:3,maxHp:3,energy:3};
export const JOB_CANDIDATE_COUNT = 3;

export const JOBS = {
  warrior:{name:'戦士',icon:'⚔️',damageMultiplier:2,description:'単体攻撃と全体攻撃のダメージが2倍になります。'},
  heavy:{name:'重戦士',icon:'🪖',hpBonus:2,description:'初期HPと最大HPが2増えます。'},
  cleric:{name:'僧侶',icon:'✨',action:'heal',healing:1,description:'自分か生存中の味方のHPを1回復します。バトルロイヤルでは自分のみです。最大HPを超えず、復活や防御はできません。'},
  swordsman:{name:'剣士',icon:'🗡️',hpBonus:-1,action:'counter',counterDamage:1,description:'初期HPと最大HPが1減ります。そのターンの単体攻撃を無効にし、各攻撃者へ1ダメージ。全体攻撃は防げず、ガード系の連続制限を共有します。'},
  mage:{name:'魔法使い',icon:'🔮',sweepCost:2,description:'全体攻撃の消費エネルギーが3から2になります。'},
  fighter:{name:'武闘家',icon:'👊',charge:2,description:'溜めるとエネルギーを2獲得します。'},
  assassin:{name:'暗殺者',icon:'🥷',action:'pierce',pierceDamage:1,description:'敵1人に1ダメージ。通常のガードを貫通します。かばう・相殺・反撃は有効です。'},
  knight:{name:'騎士',icon:'🛡️',guardEnergy:1,description:'ガードで攻撃を1件以上防ぐと、エネルギーを1獲得します。'},
  thief:{name:'盗賊',icon:'💰',steal:1,description:'単体攻撃が命中すると、敵のエネルギーを1奪います。'},
  witch:{name:'呪術師',icon:'🪄',action:'curse',description:'敵1人の次のターンの通常ガードを禁止します。反撃など他の行動は選べます。'},
};

export const JOB_ACTIONS = {
  heal:{name:'回復',icon:'✨',cost:1,target:'friendly'},
  counter:{name:'反撃',icon:'🗡️',cost:1,defense:true},
  pierce:{name:'貫通攻撃',icon:'🥷',cost:2,target:'enemy'},
  curse:{name:'呪い',icon:'🪄',cost:1,target:'enemy'},
};
