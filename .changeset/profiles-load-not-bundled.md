---
"@glion/profiles": minor
"@glion/annotate-profile-context": patch
"@glion/annotate-profile-fields-code-systems": patch
"@glion/lint-profile-segment-order": patch
---

**Breaking:** a store's `load`, `profiles.eventMaps.load`, and `loadSegments` resolve `undefined` for a version or profile the package does not bundle, where they rejected. They reject only when a bundled profile fails to load.

`@glion/annotate-profile-context` and `@glion/lint-profile-segment-order` skip a profile the version does not bundle, as before, and no longer swallow a profile that fails to load: the plugin rejects with that error. `@glion/annotate-profile-fields-code-systems` tells an unbundled code system from a failed load by the `undefined` it resolves, not by the error's message.
