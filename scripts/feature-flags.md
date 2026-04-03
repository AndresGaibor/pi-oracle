Feature flags for pi-oracle

USE_PLAYWRIGHT
- Purpose: enable or disable the Playwright adapter implementation at runtime.
- Values: set to any truthy value to enable (e.g. USE_PLAYWRIGHT=1)
- Default: unset (adapter runs as a stub and rejects most calls)

How to enable (bash):

export USE_PLAYWRIGHT=1
node your-script.js

Rationale
- Feature flag keeps the adapter interface stable while the implementation is integrated incrementally.
- Tests and other components can import the adapter and get deterministic behavior when the flag is not set.
