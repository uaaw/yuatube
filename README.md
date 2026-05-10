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

詳しくは `.env.example` を参照。


PORT
  リッスンするポート番号。デフォルトは 3000。

COOKIE_SECRET
  クッキーの署名に使うシークレット文字列。本番環境では必ず設定すること。
  設定しない場合は tensai_cookie_secret が使われる。

BSKY_IDENTIFIER
  Bluesky の検索機能に使うアカウントの handle または email。
  例: yourhandle.bsky.social

BSKY_PASSWORD
  上記アカウントのアプリパスワード。
  Bluesky の設定 → プライバシーとセキュリティ → アプリパスワード で発行できる。
  メインパスワードではなくアプリパスワードを使うことを推奨。
  未設定の場合、Bluesky 検索は利用できない。


## 認証

/homeにアクセスして合言葉を入力するとサイト内に入れる。
合言葉は SHA-256 でハッシュ化してserver.jsのSECRET_HASH に書いてある。

合言葉を変更したい場合は以下で新しいハッシュを生成してSECRET_HASHを書き換える。

    echo -n "新しい合言葉" | sha256sum

認証後は署名付きクッキーが7日間有効。


## ルート構成

/home
  ログインページ。合言葉を送信するとクッキーが発行されて /gen にリダイレクトされる。
  合言葉が違う場合は Google 検索にリダイレクトされる。

/gen
  YouTube フロントエンド。認証が必要。
  youtubei.js (Innertube) 経由で YouTube のデータを取得する。

/gen/proxy
  Invidious 動画のサーバー側プロキシ配信。

/sonota
  外部サービス閲覧ページ群。認証不要。
  - TikTok: 動画URLから動画を取得して再生
  - X (Twitter): ツイートを API 経由で表示
  - ニコニコ動画: 動画再生 + 検索
  - Bluesky: 投稿表示 + 検索

/music
  音楽プレイヤー。

/game
  ゲーム系ページ。

/tools
  ツール系ページ。


## お気に入りプレイリスト

/gen/cl/fav でお気に入りに入れた動画を、プレイリストとして順に再生できる。
プレイリスト再生中はサイドバーに前へ / 次へボタンと動画一覧が表示される。
通常 / nocookie / invidious いずれのモードでも使える。


## YouTube の再生モード

/gen の設定パネルで切り替えできる。クッキーに保存される。

normal
  通常の YouTube 埋め込み。

nocookie
  youtube-nocookie.com を使った埋め込み。トラッキングを減らせる。

invidious
  Invidious サーバーを使った再生。
  サーバー側プロキシで自サーバーから配信し、読み込みを高速化する。
  API 結果は 5 分間メモリキャッシュされる。
  ブラウザが最速サーバーを自動測定し、次回アクセス時に優先的に使う。


## デプロイ

PORT と COOKIE_SECRET を設定した上で node server.js を実行するだけ。
プロセスマネージャー (PM2 など) と組み合わせて使うと常時起動できる。

PM2 の場合

    npm install -g pm2
    pm2 start server.js --name tensai-hub
    pm2 save
    pm2 startup