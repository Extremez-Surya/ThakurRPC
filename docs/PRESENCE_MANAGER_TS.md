# TypeScript Presence Manager

This module provides a production-oriented `PresenceManager` with:

- presence diffing so updates are only sent when values change
- automatic reconnect with exponential backoff
- validation for activity fields, buttons, URLs, and timestamps
- support for a primary activity plus multiple streaming activities at the same time
- a transport abstraction so you can bind it to an official Discord SDK / Rich Presence client

## Files

- `src/presence/types.ts`
- `src/presence/PresenceManager.ts`
- `src/presence/index.ts`

## Example

```ts
import { PresenceManager } from "./src/presence/index.js";

const manager = new PresenceManager(transport, {
  applicationId: "1466796395112566876",
  status: "dnd",
});

await manager.connect();

await manager.setStreamingStatuses([
  {
    name: "Alan",
    details: "discord.gg/relationship",
    state: "Live now",
    url: "https://twitch.tv/example1",
  },
  {
    name: "Alan",
    details: "Watch party",
    state: "Back to back streams",
    url: "https://twitch.tv/example2",
  },
]);
```

## Notes

- Discord Game SDK style transports typically expose one rich presence at a time.
- To show multiple streaming cards simultaneously, the transport must accept a presence payload with an `activities` array.
- The manager keeps multiple streaming statuses in memory and publishes them together, without rotation.
