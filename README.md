# AbraStat

AbraStat is a student-friendly statistics web app built with Next.js, Firebase, Plotly, and Zustand. It is designed to feel like a modern, approachable alternative to tools like StatCrunch: students can import data, edit it in a spreadsheet-style grid, generate interactive graphs, compute summary statistics, and save datasets to a shared library.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Firebase Auth and Firestore
- Plotly.js
- jStat
- PapaParse and SheetJS
- Zustand

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `.env.local` with your Firebase web app settings:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Notes:

- The `NEXT_PUBLIC_FIREBASE_*` variables come from your Firebase web app configuration.
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` come from a Firebase service account and are required for server-side Puzzle Week routes.
- If you paste the private key into Vercel or `.env.local`, keep the newline escapes in place, for example:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- The same two server-side variables must also be configured in your Vercel project for production.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

## Current status

- `npm run build` passes.
- `npm run lint` still has outstanding issues to clean up before production deployment.
- Local-only files like `.env.local`, `.next`, and `node_modules` are ignored.
