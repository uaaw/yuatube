# yuatube

YouTube、ニコニコ動画、TikTok、X、Bluesky などを一つのサイトで見るためのもの。

作者: eris/uaaw

## 動作環境

Node.js 20.x

## セットアップ

src ディレクトリに移動して依存パッケージをインストールする。

    cd src
    npm install

## 起動

通常起動

    node server.js

開発時（ファイル変更を自動検知）

    node --watch server.js

デフォルトのポートは 3000。PORT 環境変数で変更できる。


## 環境変数

PORT
  リッスンするポート番号。デフォルトは 3000。

COOKIE_SECRET
  クッキーの署名に使うシークレット文字列。本番環境では必ず設定すること。
  設定しない場合は tensai_cookie_secret が使われる。


## 認証

/home にアクセスして合言葉を入力するとサイト内に入れる。
合言葉は SHA-256 でハッシュ化して server.js の SECRET_HASH に書いてある。

合言葉を変更したい場合は以下で新しいハッシュを生成して SECRET_HASH を書き換える。

    echo -n "新しい合言葉" | sha256sum

認証後は署名付きクッキーが7日間有効。


## ルート構成

/home
  ログインページ。合言葉を送信するとクッキーが発行されて /gen にリダイレクトされる。
  合言葉が違う場合は Google 検索にリダイレクトされる。

/gen
  YouTube フロントエンド。認証が必要。
  youtubei.js (Innertube) 経由で YouTube のデータを取得する。

/sonota
  外部サービス閲覧ページ群。認証不要。
  - TikTok: 動画URLから動画を取得して再生
  - X (Twitter): ツイートを API 経由で表示
  - ニコニコ動画: 動画再生 + 検索
  - Bluesky: 投稿表示 + 検索

/tensais
  音楽プレイヤー。

/game
  ゲーム系ページ。

/tools
  ツール系ページ。


## YouTube の再生モード

/gen の設定パネルで切り替えできる。クッキーに保存される。

normal
  通常の YouTube 埋め込み。

nocookie
  youtube-nocookie.com を使った埋め込み。トラッキングを減らせる。

invidious
  Invidious サーバーを使った再生。
  起動時にハードコードされたサーバーリストから最速のものを自動選択する。
  選択結果は 10 分間キャッシュされる。


## デプロイ

PORT と COOKIE_SECRET を設定した上で node server.js を実行するだけ。
プロセスマネージャー (PM2 など) と組み合わせて使うと常時起動できる。

PM2 の場合

    npm install -g pm2
    pm2 start server.js --name tensai-hub
    pm2 save
    pm2 startup