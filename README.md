# いつでもパーティールーム

「みんなでtier表」と「Circle & Cross」を一つのルームで遊ぶ Sites アプリです。最大10人で入室でき、スマートフォン縦画面で遊べます。

## 動かす

Node.js 24 で `npm run dev` を実行します。開発用のルームと履歴はローカルSQLiteに保存します。`npm test` は Worker をビルドして、ゲームルールと複数の独立したHTTP接続を検証します。

- [アプリの仕様](docs/SPECIFICATION.md)
- [アーキテクチャとゲーム追加手順](docs/ARCHITECTURE.md)
- [バージョン・公開方針](docs/RELEASE_POLICY.md)
- [開発時の指示](AGENTS.md)
