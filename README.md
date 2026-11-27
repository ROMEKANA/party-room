# いつでもパーティールーム

「みんなでtier表」「Circle & Cross」「名前の知らないあのゲーム」「真・名前の知らないあのゲーム」「ナンバークラッシュ」を一つのルームで遊ぶ Sites アプリです。最大10人で入室でき、スマートフォン縦画面で遊べます。

## 利用方針

本アプリは、開発者本人および家族・友人との非営利の個人的な利用を目的としています。一般向けの販売、配布、収益化は予定していません。

## 動かす

Node.js 24 で `npm run dev` を実行します。既定のURLは `http://localhost:4173` です。開発用のルームと履歴はローカルSQLite（既定 `.dev/room.sqlite`）に保存します。`npm test` は Worker をビルドして、ゲームルールと複数の独立したHTTP接続を検証します。

- [アプリの仕様](docs/SPECIFICATION.md)
- [アーキテクチャとゲーム追加手順](docs/ARCHITECTURE.md)
- [テスト方針と回帰項目](docs/TEST_POLICY.md)
- [バージョン・公開方針](docs/RELEASE_POLICY.md)
- [開発時の指示](AGENTS.md)
