# FIRE FED

A comprehensive Federal Employee Retirement Planning application designed to help federal employees plan their financial independence and retirement strategy.

## Features

- One profile, one model: a year-by-year lifetime timeline (`/plan`) covering
  salary, FERS contributions, every FERS retirement path, the Special
  Retirement Supplement, Social Security claiming, TSP access rules and
  penalties, federal and state tax, FEHB and Medicare, spending, and withdrawals
- Projected sustainable separation age with a separation-age slider and
  one-year-earlier/later cards
- Bridge strategies: 72(t) schedules and Roth conversion ladders (Pro)
- Household and dual-fed modeling (Pro)
- Monte Carlo durability and named stress tests over the same model (Pro)
- GS career and High-3 simulator (Pro)
- Scenario delta comparison and a Federal Retirement Projection Report (Pro)
- "How was this calculated" on every number, with sources, rule year, and
  last-verified date; an assumptions page; privacy by design (ages, not birth
  dates)
- Legacy calculators: FERS Pension, TSP Forecast, Summary

See `ROADMAP.md` for the build checklist, `DEVELOPMENT_DOCUMENTATION.md` for
the model architecture, `docs/ANNUAL-UPDATE.md` for yearly figure updates, `docs/METHODOLOGY-REVIEW.md` for how each rule is stated and sourced, and
`docs/DIFFERENTIAL-TESTING.md` for the validation against OPM's published
figures.

## Technology Stack

Built with React, Vite, and Tailwind CSS for a modern, responsive user experience.

## Getting Started

```bash
npm install
npm run dev
```
