# Security

Home Twin runs inside your Home Assistant. Its integration stores the plan and the plan photo in HA's own storage, serves the editor and the card to signed-in users, and, for the paid AI build, forwards the editor's requests to our service and keeps the account's session for the home. A hole in any of this would touch a person's home, so reports are taken seriously.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately in one of two ways:

- **GitHub:** the [Security tab → Report a vulnerability](https://github.com/Alex-2t/home-twin/security/advisories/new). This keeps the report between you and the maintainer until a fix is out.
- **E-mail:** support@sync.md, with "security" in the subject.

Say what you found, how to reproduce it, and which version of Home Twin and Home Assistant you saw it on. You will hear back within a few days. When the fix is released, the report is credited to you in the release notes unless you prefer otherwise.

## What is supported

Only the latest release gets fixes: Home Twin is in beta and every release is meant to be installed over the previous one. Problems in Home Assistant itself belong to [Home Assistant's security policy](https://www.home-assistant.io/security/).

## What is in scope

- The integration (`custom_components/home_twin`): the websocket commands, the photo and frontend addresses, the AI build proxy and the keys it hands out.
- The editor, the panel and the dashboard card (`editor/`): what a signed-in non-administrator can see or do, data a plan file or a server answer can make the browser do.
- The AI build service at twin.sync.md, as reached through the integration or the site.

Denial-of-service against our service, and findings that need a user to already be a Home Assistant administrator, are out of scope.
