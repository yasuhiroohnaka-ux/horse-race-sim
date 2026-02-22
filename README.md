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
`next build`（Vercel ビルド含む）での ESLint 実行は `next.config.ts` の `ignoreDuringBuilds` 設定で回避している。
ESLint の正式導入は別タスクで対応予定。
