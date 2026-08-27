# PawBooker

A production pet-grooming marketplace: customers book appointments with independent groomers, and groomers run their entire business — scheduling, payments, inventory, client communication — from the app. Live on iOS, Android, and web at [paw-booker.com](https://paw-booker.com).

This repo is the full monorepo behind it: a React Native/Expo customer + groomer app, a Next.js web dashboard, and a Supabase backend with 25+ edge functions handling payments, notifications, and an AI business assistant.

## What it does

- **Customers** browse local groomers, book single or multi-pet appointments, chat with their groomer, pay in-app (or tip after), and manage their pets' profiles and grooming history.
- **Groomers** manage their own schedule and pricing, get paid out via Stripe Connect, track supply inventory, run win-back campaigns for lapsed customers, and use an AI assistant (built on Claude) for day-to-day business questions.
- The platform is a **facilitator, not an employer** — groomers set their own prices and hours; PawBooker provides the booking, payment, and communication infrastructure.

## Architecture

```
app/            Expo Router native + web app (customer & groomer experience)
dashboard/      Next.js web app (groomer dashboard, marketing site, customer web booking)
supabase/
  functions/    Deno edge functions — Stripe payments/payouts, transactional email,
                push notifications, the AI business assistant, scheduled jobs
  migrations/   Postgres schema (60+ migrations) with row-level security policies
services/       Shared API/client layer (Supabase, Stripe, Mapbox, push)
components/     Shared React Native UI components
```

**Stack:** React Native (Expo Router, Expo SDK 57) · Next.js · TypeScript throughout · Supabase (Postgres, Auth, Edge Functions) · Stripe (payments + Connect for groomer payouts) · Anthropic Claude (business assistant) · Mapbox (address search/geocoding)

## Notable engineering pieces

- **Bulk / multi-pet bookings** modeled as one booking with per-pet line items blocking a single time span, with availability computed per-groomer and unioned across a business's staff.
- **Stripe Connect** onboarding and payouts so groomers get paid directly, with webhook-verified charge/tip/subscription flows.
- **Row-level security** as the actual access-control boundary — the client-side Supabase key is public by design; every table is locked down in Postgres.
- **AI business assistant** (Claude) for groomers, with tool-calling into the app's own booking/customer data, and a separate customer-lapse detection job.
- Native app and web dashboard share a design system and, where practical, business logic — while keeping platform-specific UX (native camera/calendar/push integrations vs. a full web booking flow at `/book`).

## Status

Shipped and in active use: native apps on the App Store and Google Play, web dashboard and customer booking live at paw-booker.com.
