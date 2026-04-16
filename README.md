This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## デプロイ前チェックリスト（必須）

プッシュ前に以下を順に確認すること。

```bash
# 1. 作業パスの確認
pwd

# 2. リモートの向き先確認
git remote -v
# origin が意図したリポジトリ URL を指しているか

# 3. ブランチ確認
git branch -a
# 作業ブランチが正しいか

# 4. HEAD の状態確認
git status
git log --oneline -n 3
```

### ブランチ運用と PR 工程について

このリポジトリは現在 `main` ブランチのみ存在する。
`main` への直接 push 運用の場合、GitHub 上の PR プロセスは発生しない。
レビューが必要な変更は、作業前に feature ブランチを切ってから PR を作成すること。

```bash
# feature ブランチを切る例
git checkout -b feature/your-task-name
```

### Lint について

`eslint` が `devDependencies` に追加されていないため、`npm run lint` は現在失敗する。
ESLint の正式導入は別タスクで対応予定。

### データ更新時の注意

`data/weekly-races.json` の出走馬やオッズ等を手動・スクリプト等で修正した場合、**必ず以下の Sync コマンドを実行して静的キャッシュ (TS) に反映**させてからコミットしてください。

```bash
npm run sync:race-schedule
```

> **Note**: アプリのUIレイヤー (特に `/sim`) はパフォーマンスと安定性のため、JSON を毎回動的にFetchするのではなく、上記スクリプトで自動生成される `lib/generatedRaceSchedule.ts` を静的に Import しています。これを忘れると、元JSONを修正しても画面表示やシミュレーションの内部参照データが古いままでズレが生じます。
