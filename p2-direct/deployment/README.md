# Android App Links

Publish `assetlinks.json` unchanged as `/.well-known/assetlinks.json` at **https://cyberkjh36.github.io** (domain root, not under `/neutinamu-song-search/`). The file contains only the public release certificate fingerprint. It does not contain a key or room credentials.

The account's root GitHub Pages repository must serve this file over HTTPS without redirects. A project repository's `.well-known` file alone does not satisfy Android domain verification. Preserve any existing Digital Asset Links entries. GitHub Pages/Jekyll may need `.nojekyll` or an include rule for `.well-known`.

The manifest restricts supported URLs to `/neutinamu-song-search/p2-room.html`. The Activity also rejects unknown rooms, extra query parameters, other hosts and paths. Existing custom-scheme links remain supported.

Check the live root response and Android verification on a test device before describing the original printed HTTPS QR as opening the app directly. Browser fallback retains the explicit app-open button; do not add timer redirects to bypass browser user-gesture requirements. Android permission dialogs and P2's Wi-Fi Direct approval still apply.
