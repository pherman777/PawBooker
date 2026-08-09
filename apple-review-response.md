# Reply to App Review — Guideline 5.6 (Developer Code of Conduct)

> Paste the section below into the "Reply to App Review" box in App Store Connect.
> Before submitting: create a groomer demo account and replace the two
> [DEMO_GROOMER_*] placeholders, and also enter those same credentials in
> App Store Connect → App Information → App Review Information → Sign-In Information.

---

Hello, and thank you for reviewing PawBooker.

We want to address the concern directly: nothing in the app is intentionally hidden. PawBooker contains no functionality that is revealed conditionally, toggled remotely, or that behaves differently during App Review. Every feature is present and active in the build you tested.

PawBooker serves two kinds of users:

1. **Pet owners (customers)** — browse local grooming businesses, book appointments, pay, and message their groomer.
2. **Grooming businesses (groomers)** — manage their salon: services and pricing, hours, incoming bookings, and payouts.

Which experience a user sees depends only on whether their account is registered as a grooming business. We believe the review was performed with a pet-owner account, so the business-facing screens were not encountered. In the build previously submitted, there was no direct in-app way to register as a grooming business, which is why those screens were not reachable during your review. We understand how that appeared under Guideline 5.6, and we have corrected it.

**What changed in this build:**

Registering as a grooming business is now fully self-service, directly in the app. A **"List your business"** option appears both on the sign-in screen ("Are you a groomer? List your business") and in the Profile tab. Any user can create a business account and immediately reach every business feature — services, hours, bookings, and payout setup. There are no hidden steps, invitation requirements, remote configuration, or conditional logic of any kind.

**To make your review easy, here is a business (groomer) demo account so you can see the business side immediately:**

- Email: [DEMO_GROOMER_EMAIL]
- Password: [DEMO_GROOMER_PASSWORD]

You can also create a business account yourself from the sign-in screen or the Profile tab, and a standard pet-owner account through normal sign-up.

We're glad to provide any additional information or a walkthrough of either experience. Thank you for your time.
