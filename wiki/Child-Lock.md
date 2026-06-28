# Child Lock

You can enable **Child lock** in **Settings → Child** and set a 6-digit PIN. When it is enabled, settings changes are locked until the PIN is entered.

This is useful for children when you want YouTube access limited to selected channels only. You still manage the setup yourself: add only the channels you want available, keep filters and followed channels configured correctly, and make sure the app is the YouTube surface the child actually uses.

## Child Lock vs. authentication

Child Lock and [Authentication](Authentication) are independent layers:

- **Child Lock** gates *changing settings* with a PIN. It is an app-wide setting owned by the [primary profile](Profiles#the-primary-profile) and works under any authentication method.
- **Authentication** gates *who can use the app at all*. When an authentication method is active, the per-profile sign-in replaces per-profile PINs, but the Child Lock settings PIN keeps working as described here.
