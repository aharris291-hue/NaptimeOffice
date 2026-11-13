# Naptime Office

The business side of home daycare, done by naptime: attendance, parent payments and year-end tax statements in one phone-friendly app.

## What's here so far

- **Homepage** (`src/app/page.tsx`)
- **Free tools page** (`src/app/tools/page.tsx`)
- **Free year-end childcare statement generator** (`src/app/tools/year-end-statement`). It builds a PDF entirely in the visitor's browser, so tax IDs never reach a server.

## Running it on a computer (for developers)

```bash
npm install
npm run dev      # then open http://localhost:3000
npm run build    # production build check
```

## Changing the brand or web address

Edit `src/lib/site.ts`. The colors live at the top of `src/app/globals.css`.
