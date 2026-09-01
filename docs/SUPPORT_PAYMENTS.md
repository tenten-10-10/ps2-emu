# Voluntary support payment plan

## Decision

The teaser is designed to open provider-hosted payment pages only after every
activation gate is complete. It does not collect card details, create payment
intents, embed a checkout iframe, or contain API keys. The current state is
`paymentsEnabled=false`, `recipientVerificationComplete=false`, and every value
in `links` and `ownerApprovedLinks` is empty; no payment can be initiated.

The owner selected **Ko-fi as the only first-release support provider** on
2026-09-01. PS2 Emu will not expose direct PayPal.Me, GitHub Sponsors, Stripe
Payment Links, Amazon Pay, Discord subscriptions, cryptocurrency, or an
embedded card form in version 0.1.0.

Ko-fi may route funds through a payment processor selected by the owner. Using
one public Ko-fi link keeps the site integration simple, but it does not remove
provider identity checks, payout setup, fees, refunds, accounting, or tax
duties.

## Required wording

Use wording equivalent to:

> PS2 Emu is free. If it is useful to you, you may voluntarily support
> ongoing maintenance. Support does not purchase the app, unlock features,
> receive priority support, create ownership rights, or qualify as a charitable
> donation.

Do not promise features, release dates, compatibility, tax deductions, voting
rights, credits, Discord roles, or other consideration in exchange for payment.

## Activation gate

Before enabling the Ko-fi URL:

- Confirm the destination account holder and payout currency.
- Keep the Ko-fi URL empty while `paymentsEnabled` is false. After the owner has
  verified the visible recipient and payout destination, set
  the exact same URL in `links` and `ownerApprovedLinks`, then set
  `recipientVerificationComplete` to true; the client requires all three gates.
- Complete the provider's identity and business verification.
- Publish the privacy, terms, refund/contact, and legally required commercial
  disclosure pages.
- Confirm the wording is accepted for the selected provider and Japanese
  business/tax circumstances.
- Make one small real payment, verify its receipt and payout destination, then
  refund it and confirm the refund path.
- Inspect the final site build to ensure no secret or non-HTTPS payment URL is
  present.

Account creation, identity verification, bank details, tax details, contractual
acceptance, and the real payment/refund test require the owner. They are not
automated by this repository.

## Primary sources

- [Ko-fi: what it is and how payments work](https://help.ko-fi.com/hc/en-us/articles/115004000994-What-is-Ko-fi)
- [Ko-fi fees](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee)
