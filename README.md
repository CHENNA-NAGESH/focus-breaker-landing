# Focus Breaker Chrome Extension

Focus Breaker helps users reduce addiction to entertainment websites. The user chooses how many seconds they can use the listed websites, then how many seconds those websites should be blocked. After the block time finishes, the websites are automatically available again.

## Features

- Popup form opened from the Chrome extension puzzle icon.
- Two time fields in seconds:
  - Amount of time to use
  - Amount of time need to block
- Website list input with one website per line or comma-separated values.
- The use timer starts only after the user navigates to a listed website.
- Automatic website blocking after use time ends.
- Blocked pages show the remaining block time on screen.
- Automatic resume after block time ends.
- Manifest V3 design suitable for Chrome Web Store publishing.

## Test Locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this folder: `/Users/chennanagesh/Downloads/files/FOCUS_BREAKER`.
5. Click the extension puzzle icon and open Focus Breaker.
6. Enter short test values, for example:
   - Amount of time to use: `10`
   - Amount of time need to block: `20`
   - Websites: `youtube.com`
7. Open a listed website. The use timer starts only when you navigate there.
8. When use time ends, the blocked screen shows the remaining block time.
9. When block time finishes, the tab automatically returns to the original website.

## Publish To Chrome Web Store

1. Test the extension thoroughly in Chrome.
2. Zip this folder without the `.git` directory.
3. Create a developer account in the Chrome Web Store Developer Dashboard.
4. Upload the zip package.
5. Add store listing details, screenshots, privacy information, and justification for permissions.
6. Submit for review.

## Permission Notes

The extension uses:

- `storage` to save settings and timer state.
- `alarms` to move between use and block periods.
- `declarativeNetRequest` to clean up extension-managed blocking rules from existing installs.
- `notifications` to tell the user when blocking starts and ends.
- `tabs` to redirect already-open blocked websites when block time starts.
- `<all_urls>` host access so user-entered websites can be blocked.
