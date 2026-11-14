import {el} from './board.js';

const releases = [
  {
    version:'1.1.0',
    title:'アップデート履歴を追加',
    changes:[
      'バージョン表記やログイン画面の右上から、これまでの変更点を確認できるようになりました。',
    ],
  },
  {
    version:'1.0.0',
    title:'対戦履歴と得点を追加',
    changes:[
      '直近30分の対戦結果から、Tier表、正誤、記入者、得点を見返せるようになりました。',
      'モード1で得点をオンにすると、正解したカードの記入者とGoodを押した人に点が入り、最後に表示されます。',
      'ライフを「残り／初期値」で表示し、カードは各ランクの左から配置順に並ぶようになりました。',
    ],
  },
  {
    version:'0.1.0',
    title:'表示と遊びやすさを改善',
    changes:[
      'ロゴとモード名を整理し、カードの正解ランクを読みやすくしました。',
      'カードの入力中にボタンを押している間、Tier表を確認できるようになりました。',
      'お題の選び方や設定画面を整理し、対応ブラウザーでプレイ中の自動消灯を抑えるようにしました。',
    ],
  },
  {
    version:'0.0.0',
    title:'ゲームをリリース',
    changes:[
      '友だちと同じルームに入り、カードを出し合って遊べるオンラインゲームを公開しました。',
      'みんなでtier表、tier並び当て、tierお題当ての3モードで遊べます。',
    ],
  },
];

export function releaseHistory(root) {
  const list = el('div','release-list');
  list.tabIndex = 0;
  list.setAttribute('role','region');
  list.setAttribute('aria-label','バージョンごとの変更点');
  for (const {version,title,changes} of releases) {
    const entry = el('article','release-entry');
    const heading = el('h3','release-heading');
    heading.append(el('span','release-version','v'+version),el('span','',title));
    const details = el('ul','release-changes');
    details.append(...changes.map(change=>el('li','',change)));
    entry.append(heading,details);
    list.append(entry);
  }
  root.append(list);
}
