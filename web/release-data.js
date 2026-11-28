import {BATTLE,JOB_BATTLE,CIRCLE,FOUR,NUMBER_CLASH,TIER,GAME_IDS} from './games.js';
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
  {version:VERSION,title:'「名前の知らないあのゲーム」シリーズのバランスを調整',changes:[
    {description:'真では、僧侶の回復の消費を2、戦士の全体攻撃を各1ダメージに変更しました。武闘家のエネルギー上限は2になり、全体攻撃は使えなくなりました。',gameIds:[JOB_BATTLE]},
    {description:'通常版のボス戦で、ボスの初期・最大HPを基本HPの3倍にし、単体攻撃を2ダメージに強化しました。全体攻撃の消費は1になりました。',gameIds:[BATTLE]},
    {description:'両ゲームで、被弾上限を有効な攻撃・反撃の件数に統一しました。ダメージの大きい攻撃から優先されます。',gameIds:[BATTLE,JOB_BATTLE]},
  ]},
  {version:'6.0.0',title:'『せーので四目』を追加',changes:[
    {description:'2〜4人で列を同時に選び、ターンごとに変わる順番でコマを落とします。タテ・ヨコ・ナナメに先に4つつなげた人の勝ちです。',gameIds:[FOUR]},
    {description:'6×6〜9×9の盤面に対応し、対戦履歴で最終盤面と勝利したコマの並びを確認できます。',gameIds:[FOUR]},
  ]},
  {version:'5.1.0',title:'プレイヤーアイコンと表示UIを刷新',changes:[
    {description:'10種類のイラストから、入室前にプレイヤーアイコンを選べるようにしました。',gameIds:[]},
    {description:'新規入室時の名前は最大8文字になりました。',gameIds:[]},
    {description:'プレイヤー名とホスト・親などの属性を、画面の広さに合わせて読みやすく表示します。',gameIds:GAME_IDS.filter(id=>id!==FOUR)},
    {description:'全ゲームのプレイヤー表示を統一し、行動済みのチェックはアイコンの右下に表示します。',gameIds:GAME_IDS.filter(id=>id!==FOUR)},
  ]},
  {version:'5.0.0',title:'『ナンバークラッシュ』を追加',changes:[
    {description:'2〜6人で、手札から数字カードを同時に出す心理戦を遊べます。手札は9枚・12枚・15枚から選べます。',gameIds:[NUMBER_CLASH]},
    {description:'同じ数字を出すと、設定した点数だけ失点します。対象の最大値・最小値が重なると得点カードを持ち越すルールも、ON・OFFを切り替えられます。',gameIds:[NUMBER_CLASH]},
    {description:'時間制限付きの同時ターン制で進みます。残りの得点カードはボタンの長押しで確認できます。',gameIds:[NUMBER_CLASH]},
  ]},
  {version:'4.1.1',title:'ホーム画面用のアプリアイコン・名称を追加',changes:[
    {description:'スマートフォンやタブレットのホーム画面に追加すると「いつパ」と表示されます。ホーム画面とブラウザーのタブに、黄色いひつじのアイコンを使います。',gameIds:[]},
  ]},
  {version:'4.0.1',title:'「真・名前の知らないあのゲーム」に表記を統一',changes:[
    {description:'ゲーム一覧やルールなどで表示するゲーム名の表記を統一しました。',gameIds:[JOB_BATTLE]},
  ]},
  {version:'4.0.0',title:'「真・名前の知らないあのゲーム」を追加',changes:[
    {description:'10種類の職業が登場し、攻撃や回復、反撃など職業ごとの能力で対戦が変化します。',gameIds:[JOB_BATTLE]},
    {description:'対戦ごとにランダムな3候補から職業を1つ選びます。',gameIds:[JOB_BATTLE]},
    {description:'バトルロイヤルとチーム戦に対応しています。',gameIds:[JOB_BATTLE]},
  ]},
  {version:'3.0.0',title:'『名前の知らないあのゲーム』を追加',changes:[
    {description:'溜める・ガード・単体攻撃・全体攻撃を使って、最後まで生き残ることを目指します。',gameIds:[BATTLE]},
    {description:'2〜10人のバトルロイヤル、同人数のチーム戦、1対3のボス戦で遊べます。',gameIds:[BATTLE]},
    {description:'全員が同時に行動を選び、サーバーがターンごとに攻撃・防御・相殺をまとめて判定します。',gameIds:[BATTLE]},
  ]},
  {version:'2.0.3',title:'ロビー・プレイヤー参加管理の改善',changes:[
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

