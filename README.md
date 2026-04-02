# SchoolChime

PCで学校のチャイムを鳴らすデスクトップアプリ。

## 機能

- 時間割に合わせて自動でチャイムが鳴る
- 時刻・ラベルを自由に編集（クリックで直接編集）
- チャイムごとに異なる音源を設定可能
- 音源ライブラリ（MP3/WAVを追加・管理）
- 音量調節
- システムトレイ常駐（閉じてもバックグラウンドで動作）
- 黒板風UI

## インストール

[Releases](https://github.com/rippyrippy/school-chime/releases) から `SchoolChime_x.x.x_x64-setup.exe` をダウンロードして実行。

## 開発

```bash
npm install
npm run tauri dev
```

### ビルド

```bash
npm run tauri build
```

## 技術スタック

- [Tauri v2](https://v2.tauri.app/) (Rust)
- React + TypeScript
- Vite
- Web Audio API

## クレジット

- デフォルトチャイム音: [OtoLogic](https://otologic.jp) (CC BY 4.0)

## ライセンス

MIT
