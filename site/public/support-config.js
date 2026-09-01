// Public configuration only. Never put API keys, access tokens or secrets here.
// Keep paymentsEnabled false until identity/KYC, tax, refund, privacy and
// commerce-disclosure reviews are complete. Only hosted HTTPS links from the
// allowlisted Ko-fi profile in assets/main.js can ever be opened.
window.PS2_SUPPORT_CONFIG = Object.freeze({
  paymentsEnabled: false,
  recipientVerificationComplete: false,
  links: Object.freeze({
    kofi: "",
  }),
  // Enter the same exact URL here only after the owner verifies the visible
  // recipient and payout destination. The client refuses a link that is not
  // identically bound in both maps.
  ownerApprovedLinks: Object.freeze({
    kofi: "",
  }),
});
