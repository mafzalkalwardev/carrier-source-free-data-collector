# Contributing

Thanks for your interest in improving **CarrierSource Free Data Collector**.

## Before you start

1. Confirm your intended use complies with [CarrierSource Terms of Service](https://www.carriersource.io/) and that you have appropriate written authorization for any automated collection.
2. Do not submit changes that intercept APIs, bypass access controls, CAPTCHAs, paywalls, or collect phone numbers / emails / personal contacts.

## Development setup

```bash
npm install
npm run icons
npm test
npm run build
```

Load `dist/` as an unpacked Chrome extension from `chrome://extensions`.

## Pull request guidelines

- Keep PRs focused and describe *why* the change is needed.
- Add or update Vitest fixtures when changing DOM extraction.
- Avoid inventing CarrierSource URL formats or undocumented query parameters.
- Prefer semantic DOM selectors over fragile hashed CSS class names.
- Update `docs/DOM-FIELD-MAP.md` when newly confirmed fields are verified live.

## Code style

- TypeScript strict mode
- React + Tailwind for UI
- Manifest V3 only

## Reporting bugs

Include:

- Chrome version
- Extension version (`manifest.json`)
- Whether authorization checkboxes were enabled
- Approximate page URL pattern (no session tokens)
- Screenshot of the results DOM if extraction failed
