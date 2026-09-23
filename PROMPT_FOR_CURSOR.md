# Cursor — Initial Project Prompt

以下を、リポジトリ一式を配置したあと、Cursor の新しい Agent / Composer セッションで最初に送ってください。

---

あなたはこのリポジトリのリードエンジニアとして、OSSプロジェクト `sitecutover` の v0.1 を実装してください。

まずコードを書き始める前に、必ず以下のファイルをすべて読んでください。

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/PROJECT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/MVP_SPEC.md`
- `docs/ROADMAP.md`
- `docs/INITIAL_ISSUES.md`

## プロジェクトの目的

`sitecutover` は、Webサイトのリニューアル、CMS移行、サーバー移転、ドメイン変更、staging → production 公開などの際に、旧サイトと新サイトを比較して公開事故を検知するオープンソースCLIです。

一般的なSEO総合ツールを作ることが目的ではありません。

「移行前後で何が壊れたか」を、安全・再現可能・機械判定可能な形で検出することがコアです。

## 今回あなたにお願いする範囲

`docs/INITIAL_ISSUES.md` の Issue 1 から順番に進め、まず v0.1 MVP を完成させてください。

ただし、一気に巨大な実装を行わず、以下の単位で進めてください。

1. Issue 1 のbootstrap
2. 型・domain model
3. HTTP fetch / redirect trace
4. crawler
5. HTML parser
6. source / target pairing
7. individual checks
8. reporters
9. CLI integration
10. release readiness

各フェーズでテストが通る状態を維持してください。

## 技術方針

原則として以下を採用してください。

- Node.js 24 LTS 以上
- TypeScript
- ESM
- npm
- Vitest
- strict TypeScript

依存パッケージは必要最小限にしてください。

CLI引数処理、HTML解析、concurrency controlなど、成熟した軽量ライブラリを利用する合理性がある箇所では依存追加して構いませんが、追加前に「なぜ標準APIだけでなく依存が必要なのか」を判断してください。

## 重要な設計制約

### 1. deterministic

サイト監査結果を出すruntimeにLLM/APIを使用しないでください。

CursorやCodex等は開発には使用しますが、完成した `sitecutover` CLI 自体はAIサービスなしで動作する必要があります。

### 2. read-only

監査先Webサイトを変更する操作は禁止です。

- GET中心
- フォーム送信禁止
- POST/PUT/PATCH/DELETE禁止
- JavaScript実行はv0.1では不要

### 3. v0.1でPlaywrightを入れない

現時点ではHTTPレスポンスとHTML解析で必要な監査を実装してください。

ブラウザが必要な機能はロードマップに残します。

### 4. checkerとreporterを分離する

check処理から `console.log()` しないでください。

checkerはstructured findingを返し、console / JSON / Markdown reporterは同じAuditReportを受け取って表示してください。

### 5. ネットワークテストを外部サイト依存にしない

Vitestから任意の公開Webサイトを叩くテストは作らないでください。

redirect、404、canonical、robots、sitemap等を再現できるlocal fixture serverをテスト内に作ってください。

### 6. client情報を入れない

このOSSは実際のクライアントワークでも使用予定ですが、このpublic repositoryには実クライアントのドメイン、Basic認証、Cookie、API Key、コンテンツ等を入れないでください。

サンプルには `example.com` やlocal fixtureを使用してください。

## CLIの中心仕様

最低限、以下を成立させてください。

```bash
sitecutover compare \
  --from https://old.example.com \
  --to https://new.example.com
```

出力形式：

```bash
--format console
--format json
--format markdown
```

また、

```bash
--output report.md
--max-pages 250
--concurrency 5
--timeout 15000
--fail-on error
```

をサポートします。

exit codeは `docs/MVP_SPEC.md` に従ってください。

## v0.1 checks

`docs/MVP_SPEC.md` を正とし、以下を実装してください。

- SC001 target-status
- SC002 redirect-chain
- SC003 canonical
- SC004 indexing-directives
- SC005 title
- SC006 meta-description
- SC007 internal-link-status
- SC008 sitemap-coverage

重要なのはチェック数を増やすことではなく、これらを確実に動かすことです。

## コード品質

以下のnpm scriptsを用意してください。

```bash
npm run build
npm run typecheck
npm test
npm run lint
npm run format
```

可能であれば以下も用意してください。

```bash
npm run test:watch
```

GitHub Actionsで最低限、

- install
- typecheck
- test
- lint
- build

を実行してください。

## READMEについて

現在のREADMEは「planned v0.1」として記述されています。

実装が進んだらREADMEを実際の挙動に合わせて更新してください。

未実装機能を、実装済みのようにREADMEへ書かないでください。

## 作業の進め方

最初にコードを書く前に、以下を私に提示してください。

1. 読み取ったプロジェクト目的の要約
2. 採用する具体的なnpm dependenciesと採用理由
3. 最終的なディレクトリ構成案
4. Issue 1〜12 の依存関係
5. まず実装するIssue 1の作業内容
6. v0.1 MVPを壊さないために今回は実装しないもの

その説明後、追加の確認を待たずに Issue 1 の実装を開始してください。

Issue単位でコミット可能な粒度を意識し、各Issue完了時に

- 変更点
- tests
- 残課題
- 次に進むIssue

を簡潔に報告してください。

仕様に曖昧さがある場合は、まず `AGENTS.md` と `docs/MVP_SPEC.md` の目的に照らして、最も小さく安全でテスト可能な選択をしてください。

既存仕様を大きく変更する必要がある場合だけ、変更理由とトレードオフを提示してください。

それでは、まずリポジトリ内の指定ドキュメントを読み、実装計画を提示したうえで Issue 1 から開始してください。
