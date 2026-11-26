import {CIRCLE,TIER} from './games.js';
import {VERSION} from './version.js';

const legacyReleases = [
  {
    version:'1.3.1',
    title:'ランダムお題を397件追加',
  },
  {
    version:'1.3.0',
    title:'正答率モードの再挑戦とTier表の操作改善',
    changes:[
      'みんなでtier表ではTierを選ぶとすぐに提案でき、手番開始時に「あなたの番です」を表示する設定を追加しました。',
      'tier並び当ての初期設定を正答率モードに変更しました。目標に届かない場合は、設定した回数まで再挑戦できます。',
      'tier並び当てと全員一致モードでは、Tierへの配置や移動をすぐに反映します。',
      '全員一致モードでは確定後も自分のTier表が残り、カードの表示を切り替えられます。',
      'iOSでTier表の確認ボタンを長押ししたときに、文字が選択される問題を修正しました。',
    ],
  },
  {
    version:'1.2.1',
    title:'ゲーム中に入り直せるように修正',
    changes:[
      '同じ名前で別の端末やタブから入ると、投稿済みのカードやTier表の配置・確定状況を引き継げます。',
      '引き継ぎが成立すると、元の端末やタブの接続は終了します。',
    ],
  },
  {
    version:'1.2.0',
    title:'全員一致モードを追加',
    changes:[
      'tier並び当て、tierお題当て、全員一致モードでカード名の重複を防ぎます。',
      'tier並び当てと全員一致モードで、すべてのTierへの配置が必須になりました。',
      'カード配置処理とオンライン進捗表示を改善しました。',
      '全員一致判定、プレイヤー別の結果比較、履歴保存に対応しました。',
    ],
  },
  {
    version:'1.1.2',
    title:'親へのカード記入者表示を切り替え',
    changes:[
      'tier並び当てとtierお題当てで、親がカードをタップしたときに記入者を見られるか設定できます。初期設定はどちらもOFFです。',
    ],
  },
  {
    version:'1.1.1',
    title:'tier並び当てにライフ表示を追加',
  },
  {
    version:'1.1.0',
    title:'アップデート情報を追加',
    changes:[
      'バージョン表記やログイン画面の右上から、これまでの変更点を確認できるようになりました。',
    ],
  },
  {
    version:'1.0.0',
    title:'対戦履歴と得点を追加',
    changes:[
      '直近30分の対戦結果から、Tier表、正誤、記入者、得点を見返せるようになりました。',
      '「みんなでtier表」で得点をオンにすると、正解したカードの記入者とGoodを押した人に点が入り、最後に表示されます。',
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

const releases = [
  {version:VERSION,title:'ロビー・プレイヤー参加管理の改善',changes:[
    {description:'全員退出後は、次に入室した人がロビーから始められるようになりました。',gameIds:[]},
    {description:'ゲーム選択後も入室でき、開始前に参加枠が空くと観戦者が順番に参加できます。',gameIds:[]},
    {description:'対戦中に入室すると観戦でき、対戦終了後に次の参加枠が割り当てられます。',gameIds:[]},
  ]},
  {version:'2.0.2',title:'ロビーからルールを確認',changes:[
    {description:'ロビーのメニューから、ゲーム一覧と同じカード表示で遊び方を選べるようになりました。',gameIds:[TIER,CIRCLE]},
    {description:'ホストがゲームとロビーを切り替えても、ゲストが開いているルールや対戦履歴はそのまま表示されます。',gameIds:[TIER,CIRCLE]},
  ]},
  {version:'2.0.1',title:'お題担当と親の選び方を改善',changes:[
    {description:'tier並び当てとtierお題当てでは、お題担当の右隣が次の親になります。親を指名し直すと、2人がプレイヤー順の先頭に並びます。',gameIds:[TIER]},
    {description:'お題担当と親を指定している場合、プレイヤー順をシャッフルしても2人の役割が保たれます。',gameIds:[TIER]},
    {description:'みんなでtier表と全員一致モードのお題担当の表示を「ランダム」に変更しました。',gameIds:[TIER]},
  ]},
  {version:'2.0.0',title:'いつでもパーティールームへの刷新・Circle & Cross追加',changes:[
    {description:'共通ロビー、設定の保存、対戦履歴の保存期間、アプリの更新検知に対応しました。',gameIds:[]},
    {description:'プレイヤー順を共通化しました。ホストは開始前に並び順をシャッフルできます。',gameIds:[TIER,CIRCLE]},
    {description:'Circle & Crossを共通ルームで遊べるようにしました。',gameIds:[CIRCLE]},
  ]},
  ...legacyReleases.map(entry=>({...entry,changes:(entry.changes ?? []).map(description=>({description,gameIds:[TIER]}))})),
];

export function releaseEntries(game) {
  return releases.flatMap(entry=>{
    const changes = game ? entry.changes.filter(change=>change.gameIds.includes(game)) : entry.changes;
    if (game && !changes.length && !(game===TIER && entry!==releases[0] && !entry.changes.length)) return [];
    return [{...entry,changes}];
  });
}

