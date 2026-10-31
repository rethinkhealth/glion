# @glion/cli

## 0.32.0

### Patch Changes

- [#1159](https://github.com/rethinkhealth/glion/pull/1159) [`d697238`](https://github.com/rethinkhealth/glion/commit/d697238293eb59554cbe79695c1af882fc4fb9db) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** an empty line is read as a segment with an empty Segment ID, no fields, and the terminator that ended it, so a message is written back with its empty lines. Before, an empty line was dropped without a trace ([#1158](https://github.com/rethinkhealth/glion/issues/1158)). `@glion/lint-segment-header-length` reports each one at `error`, `@glion/lint-required-message-header` reports one before `MSH`, and `@glion/lint-profile-segment-order` reports each one the event schema has no place for: an `Hxx` segment of the event schema can take it. The message header is read after the empty lines before it: an empty line before `MSH` no longer stops MSH-1 and MSH-2 being read, which lost MSH-2 on output. An empty line after the last segment is a segment, so `@glion/lint-profile-segment-order` reports a segment missing at the end of the message next to that line, at its start or its end, rather than at the end of the message.

  `glion send` sends each empty line of a message file as an empty segment, a carriage return alone, and counts it among the segments it reports.

- [#1148](https://github.com/rethinkhealth/glion/pull/1148) [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** `MllpClient.send()` writes the message with `toHl7v2`, each segment followed by its `terminator`, and changes nothing about it: a message read with `\n` or `\r\n` line breaks is sent with them. Apply `@glion/transform-segment-terminator` before sending to end every segment with `\r`.

  `glion send` reads a message with `@glion/parser` and `@glion/transform-segment-terminator`, so each segment is sent ending with `\r`, whatever line breaks the file holds.

- [#1138](https://github.com/rethinkhealth/glion/pull/1138) [`dcefdc9`](https://github.com/rethinkhealth/glion/commit/dcefdc9ff2af60dc18898f655405c42aae04cfd9) Thanks [@meleksomai](https://github.com/meleksomai)! - A message is sent with the segment terminator after its last segment, as HL7v2 Chapter 2 requires: the MLLP payload is `MSH|^~\&|…\rPID|1\r`, then the `<FS><CR>` trailer.
- Updated dependencies [[`d697238`](https://github.com/rethinkhealth/glion/commit/d697238293eb59554cbe79695c1af882fc4fb9db), [`dcefdc9`](https://github.com/rethinkhealth/glion/commit/dcefdc9ff2af60dc18898f655405c42aae04cfd9), [`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00), [`dcefdc9`](https://github.com/rethinkhealth/glion/commit/dcefdc9ff2af60dc18898f655405c42aae04cfd9), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00)]:
  - @glion/parser@0.32.0
  - @glion/ast@0.32.0
  - @glion/to-hl7v2@0.32.0
  - @glion/mllp-client@0.32.0
  - @glion/transform-segment-terminator@0.32.0
  - @glion/mllp@0.32.0
  - @glion/util-query@0.32.0
  - @glion/ack@0.32.0

## 0.31.0

### Minor Changes

- [#1118](https://github.com/rethinkhealth/glion/pull/1118) [`a64b83a`](https://github.com/rethinkhealth/glion/commit/a64b83a4fc465d4eb705493bf39ec2a26dc30e15) Thanks [@meleksomai](https://github.com/meleksomai)! - `glion.config.ts` takes `maxConnections`, passed to `@glion/mllp`'s `serve()`: `glion start` and `glion dev` close a connection past it before reading any message from it. It must be a whole number of at least 1; unset, the server accepts any number of connections, as before.

### Patch Changes

- Updated dependencies [[`279026b`](https://github.com/rethinkhealth/glion/commit/279026bf82208f46e46aa4fde26e582c2f43af12)]:
  - @glion/mllp@0.31.0
  - @glion/ack@0.31.0
  - @glion/ast@0.31.0
  - @glion/mllp-client@0.31.0
  - @glion/parser@0.31.0
  - @glion/to-hl7v2@0.31.0
  - @glion/util-query@0.31.0

## 0.30.0

### Minor Changes

- [#909](https://github.com/rethinkhealth/glion/pull/909) [`c087d18`](https://github.com/rethinkhealth/glion/commit/c087d18208df74fb5b9cf174edba828ee8545e66) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: `glion.config.ts` no longer takes `keepAlive` or `keepAliveInitialDelay`. A config that sets either fails validation as an unknown key. `glion start` and `glion dev` listen as before: keep-alive probes after 60 s idle, and Nagle's algorithm off.

### Patch Changes

- [#1062](https://github.com/rethinkhealth/glion/pull/1062) [`97513a4`](https://github.com/rethinkhealth/glion/commit/97513a48c1c918c9e21774a0825418f64f02782d) Thanks [@meleksomai](https://github.com/meleksomai)! - `glion send` opens its connection itself, now that `@glion/mllp-client`'s `nodeSocket` takes a dial function. It sends the host as the TLS server name (SNI) unless the host is an IP address, and turns Nagle's algorithm off, as before. It no longer sets TCP keepalive, which a single send under its own timeout does not use.
- Updated dependencies [[`97513a4`](https://github.com/rethinkhealth/glion/commit/97513a48c1c918c9e21774a0825418f64f02782d), [`fd4c862`](https://github.com/rethinkhealth/glion/commit/fd4c862de96c8faf8a45c89c879ac2e98fbe7d4c), [`c087d18`](https://github.com/rethinkhealth/glion/commit/c087d18208df74fb5b9cf174edba828ee8545e66), [`8b09ba9`](https://github.com/rethinkhealth/glion/commit/8b09ba9fe76167f23b99f28f22e2c6fd5d246da1), [`d769436`](https://github.com/rethinkhealth/glion/commit/d7694361597b574af2203052f80c029a55484cb1), [`28b61ea`](https://github.com/rethinkhealth/glion/commit/28b61ea1b40ebfb3ed5e025684f200736479852e)]:
  - @glion/mllp-client@0.30.0
  - @glion/mllp@0.30.0
  - @glion/parser@0.30.0
  - @glion/to-hl7v2@0.30.0
  - @glion/util-query@0.30.0
  - @glion/ack@0.30.0
  - @glion/ast@0.30.0

## 0.29.0

### Minor Changes

- [#1035](https://github.com/rethinkhealth/glion/pull/1035) [`3d7663d`](https://github.com/rethinkhealth/glion/commit/3d7663dae18862ed8c6fbf658f33840e59857d25) Thanks [@meleksomai](https://github.com/meleksomai)! - Let the command that binds decide which address to bind, instead of the config schema guessing from a mode.

  `makeGlionConfigSchema` took a `mode` of `"dev"` or `"start"` for one purpose: to default `hostname` to `127.0.0.1` or `0.0.0.0`. That made every caller of `loadConfig` declare a server posture, including `glion send`, a client with no posture to declare — it passed `"dev"` because that produced loopback. The schema now leaves `hostname` as the config wrote it, `ResolvedConfig.hostname` is `string | undefined`, and `glion dev` and `glion start` each apply their own default when they build the child's manifest. `LoadConfigOptions.mode` is gone.

- [#1040](https://github.com/rethinkhealth/glion/pull/1040) [`80fdc1e`](https://github.com/rethinkhealth/glion/commit/80fdc1e9a660ba729d45a93bbfa21d7eb1a95761) Thanks [@meleksomai](https://github.com/meleksomai)! - Report every failure as a fact, with what to do about it and the underlying error in their own channels.

  - Messages state what is wrong in the user's terms: their config file, their app file, their flags. No message describes glion's own control flow ("so a target can't be derived"), names a path under `.glion/` that glion wrote for itself, or splices another system's error text into the sentence
  - Report a failure loading the app against the file the user wrote, not the compiled copy beside it; the compiled path moves to the error's `context`
  - Carry what to do in `hint` and the underlying error in `cause`: the `fatal` event gains both fields, `glion dev` and `glion send` print each under the message — every line of a hint that names several things to fix — and `glion send`'s JSON line gains `hint`
  - Name the endpoint a pre-wire failure was aimed at on the diagnostic line, as the JSON line already did
  - Report the limit a dropped line exceeded alongside the bytes dropped, instead of presenting the dropped count as the limit
  - Say "the app" rather than "the child" in supervisor warnings, which describe the process model rather than what happened
  - Raise the child runner's missing-manifest guard as a plain bug report instead of a `config-not-found` the operator cannot act on
  - Report a cache directory that cannot be created as itself (`cache-dir-failed`), naming the directory, instead of letting the raw filesystem error through

- [#1036](https://github.com/rethinkhealth/glion/pull/1036) [`cad92ed`](https://github.com/rethinkhealth/glion/commit/cad92eda091ca2efc51a403179098833899b15b2) Thanks [@meleksomai](https://github.com/meleksomai)! - Run a project that has no `glion.config.ts` on the defaults, as the help text and README already described.

  - Discover the app at `./glion.app.ts` or `./src/glion.app.ts` when there is no config file, and run it with the schema's defaults: port `2575`, bound where each command binds by default — `127.0.0.1` under `glion dev`, `0.0.0.0` under `glion start`
  - Write no `.glion/` cache directory for a send from a project that has no config, since there is nothing to compile
  - Keep `config-not-found` for the one case that is still a failure: `--config` naming a file that is not there, previously reported as a compile error

- [#1034](https://github.com/rethinkhealth/glion/pull/1034) [`cd4fff8`](https://github.com/rethinkhealth/glion/commit/cd4fff8bd8b7e1e0fb72351a3c797bfe6b2c2d12) Thanks [@meleksomai](https://github.com/meleksomai)! - Remove `glion send --local`. The target is the one the invocation names.

  `--local` was a second route to the same thing `--host`/`--port` already express, and it was the only reason the send command read a server's configuration: it took `hostname` and `port` from `glion.config.ts`, mapped a wildcard bind address to loopback, and refused a project whose port is `0` because an OS-assigned port is not in the config. All of that is gone. `glion send` is a client that sends to the system you point it at, and takes no part in what address a server of this project binds.

  `glion send` now takes its whole target from the invocation: `--host` names the receiver and `--port` defaults to `2575`, the port MLLP standardizes on. A port outside `1`–`65535` is refused before the dial. The `--config` flag is gone from the subcommand, and the handler no longer takes a working directory: with `--local` removed, `glion send` reads no file but the message, so it needs neither a config file nor a project to run in.

- [#1039](https://github.com/rethinkhealth/glion/pull/1039) [`2192dc8`](https://github.com/rethinkhealth/glion/commit/2192dc8efa852c30cdca03b9cb58bfaf9816bff7) Thanks [@meleksomai](https://github.com/meleksomai)! - Send over TLS with `glion send` ([#657](https://github.com/rethinkhealth/glion/issues/657)).

  - Add `--tls`, `--ca`, `--cert`, `--key`, and `--insecure`. Naming any certificate file asks for TLS, so `--tls` is only needed when the invocation names none
  - Verify the receiver against the authority `--ca` names, or against its own certificate when it signed itself, as a development server does; `--tls` alone verifies against the runtime's trusted authorities
  - `--insecure` dials over TLS without verifying the receiver's certificate
  - Report a certificate file that cannot be read as the `invalid` outcome, before dialing, naming the target the send was aimed at
  - Mark a TLS connection with `TLS` on the `== connected` line, and `TLS unverified` when verification was turned off, so the line never claims a certificate was checked when it was not

### Patch Changes

- [#1038](https://github.com/rethinkhealth/glion/pull/1038) [`0d033c6`](https://github.com/rethinkhealth/glion/commit/0d033c669c7815e73ad05f25f9063ffe9f8c1cd1) Thanks [@meleksomai](https://github.com/meleksomai)! - Report the connection's facts in `glion send`'s terminal view: a `== connected` line with the time the dial took. It goes to stderr and is absent under `--json`.

- [#1033](https://github.com/rethinkhealth/glion/pull/1033) [`afaf429`](https://github.com/rethinkhealth/glion/commit/afaf4294a01b339751fb4643928657cdb294e326) Thanks [@meleksomai](https://github.com/meleksomai)! - Fix `glion send` to report a message the client could not prepare as the `invalid` outcome, as the 0.18.0 notes described ([#723](https://github.com/rethinkhealth/glion/issues/723)).

  - Report a message with no MSH-10 control ID, or with a reserved MLLP byte, as `kind: "invalid"` with `code: "INVALID_MESSAGE"` and the reason on `cause` (previously `kind: "transport"`)
  - Print the code and the reason on the human diagnostic line
  - Identify the refused message by its control ID: `requestControlId` in JSON, `MSH-10 <id>` on the diagnostic line
  - Report MSA-2 and MSA-3 of an acknowledgment as the client read them off the wire, rather than assuming MSA-2 echoes the request

- [#1061](https://github.com/rethinkhealth/glion/pull/1061) [`a531fe7`](https://github.com/rethinkhealth/glion/commit/a531fe77d6bd3d084413a8176da69888e634a1ac) Thanks [@meleksomai](https://github.com/meleksomai)! - Read every HL7v2 Table 0008 acknowledgment code from a reply, with the field separator its MSH-1 declares. `glion dev` showed `?` for a reply whose MSA-1 is `CA`, `CE` or `CR`, or whose field separator is not `|`; it now shows the code, accepts in green and NAKs in red. The `ack` field of the `msg` event that `glion start` writes is now any of the six codes, or `null` ([#1059](https://github.com/rethinkhealth/glion/issues/1059)).

- [#1053](https://github.com/rethinkhealth/glion/pull/1053) [`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56) Thanks [@meleksomai](https://github.com/meleksomai)! - Fix `encodeEscapes` writing an escape sequence that holds a delimiter, which made a message whose delimiters include an escape code grow on every parse and serialize round trip ([#1051](https://github.com/rethinkhealth/glion/issues/1051)).

  - Write a character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, as `\Xdd\`, with a hexadecimal digit `A`–`F` in lowercase when its uppercase form is a delimiter
  - Add `EscapeSequenceError`, thrown by `encodeEscapes`, `toHl7v2`, and `hl7v2EncodeEscapes` for a character that no escape sequence can write with the message's delimiters, and export it from `@glion/to-hl7v2`
  - Report `glion send` of such a message as an `invalid` outcome instead of exiting with an unexpected error
  - Report a withdrawn or backward-compatible field without `actual` when the message's delimiters cannot write it, instead of rejecting the lint run

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56), [`e2fb937`](https://github.com/rethinkhealth/glion/commit/e2fb9376aaba5e132a20091cfac91bc8b4f88ba9)]:
  - @glion/to-hl7v2@0.29.0
  - @glion/parser@0.29.0
  - @glion/util-query@0.29.0
  - @glion/ack@0.29.0
  - @glion/mllp-client@0.29.0
  - @glion/mllp@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Minor Changes

- [#1001](https://github.com/rethinkhealth/glion/pull/1001) [`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: decode HL7v2 escape sequences while parsing and encode them while serializing, so a subcomponent `value` is always the content and a parsed message writes back as the same text.

  - `hl7v2Parser` decodes `\F\`, `\S\`, `\R\`, `\T\`, `\E\`, `\.br\`, and `\Xdd\` in every value as it tokenizes, leaving MSH-2 as it is; pass `decodeEscapes: false` to keep the wire form in the tree
  - A formatting command (`\H\`, `\N\`, `\.sp 2\`, …), a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`) stay in the value as written and are written back as they are; `hl7v2DecodeEscapes` no longer removes `\H\` and `\N\`
  - `hl7v2ToHl7v2` and `toHl7v2` write delimiters, the escape character, the segment delimiter, and other control characters in a value as escape sequences, leaving MSH-1 and MSH-2 as they are; pass `encodeEscapes: false` to write values as they are
  - `parseHL7v2` from `@glion/hl7v2` no longer runs `hl7v2DecodeEscapes`; its output is unchanged
  - Add `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` to `@glion/utils`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` are for trees handled with those options off; a parsed tree must not be decoded again
  - `hl7v2EncodeEscapes` now writes a control character other than the segment delimiter as `\Xdd\`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` leave a subcomponent without a value as it is
  - `MllpClient` and `glion send` send a message whose value holds a control character, written as `\Xdd\`, instead of rejecting it with `INVALID_MESSAGE`
  - The bytes of a `\Xdd…\` are decoded as UTF-8; a sequence whose bytes are not UTF-8, or that has an odd number of digits, stays as written

### Patch Changes

- Updated dependencies [[`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad)]:
  - @glion/parser@0.28.0
  - @glion/to-hl7v2@0.28.0
  - @glion/mllp-client@0.28.0
  - @glion/mllp@0.28.0
  - @glion/util-query@0.28.0
  - @glion/ack@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @glion/mllp@0.27.1
  - @glion/ack@0.27.1
  - @glion/ast@0.27.1
  - @glion/mllp-client@0.27.1
  - @glion/parser@0.27.1
  - @glion/to-hl7v2@0.27.1
  - @glion/util-query@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [[`d702f6a`](https://github.com/rethinkhealth/glion/commit/d702f6a31ff95af55b3850e18d1d3f13f3accce7), [`799a57c`](https://github.com/rethinkhealth/glion/commit/799a57c8dd6bab65c3c655cef2515be4c0eb45d0), [`3dfa36e`](https://github.com/rethinkhealth/glion/commit/3dfa36e5ba03ad7bfe4ce037cc1bd12c53d42a1d), [`ac05055`](https://github.com/rethinkhealth/glion/commit/ac05055ab3348054d3c98429e53e7c105a82c02f), [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728), [`34d8e21`](https://github.com/rethinkhealth/glion/commit/34d8e217a9655cee2fdf42202ed58168c3ed72ed)]:
  - @glion/util-query@0.27.0
  - @glion/mllp@0.27.0
  - @glion/mllp-client@0.27.0
  - @glion/to-hl7v2@0.27.0
  - @glion/ack@0.27.0
  - @glion/ast@0.27.0
  - @glion/parser@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.26.0
  - @glion/ast@0.26.0
  - @glion/mllp@0.26.0
  - @glion/mllp-client@0.26.0
  - @glion/parser@0.26.0
  - @glion/to-hl7v2@0.26.0
  - @glion/util-query@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies []:
  - @glion/mllp@0.25.0
  - @glion/ack@0.25.0
  - @glion/ast@0.25.0
  - @glion/mllp-client@0.25.0
  - @glion/parser@0.25.0
  - @glion/to-hl7v2@0.25.0
  - @glion/util-query@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies []:
  - @glion/mllp@0.24.0
  - @glion/parser@0.24.0
  - @glion/to-hl7v2@0.24.0
  - @glion/util-query@0.24.0
  - @glion/mllp-client@0.24.0
  - @glion/ack@0.24.0
  - @glion/ast@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @glion/mllp@0.23.0
  - @glion/ack@0.23.0
  - @glion/ast@0.23.0
  - @glion/mllp-client@0.23.0
  - @glion/parser@0.23.0
  - @glion/to-hl7v2@0.23.0
  - @glion/util-query@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/util-query@0.22.0
  - @glion/ack@0.22.0
  - @glion/mllp@0.22.0
  - @glion/mllp-client@0.22.0
  - @glion/parser@0.22.0
  - @glion/to-hl7v2@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`e38396e`](https://github.com/rethinkhealth/glion/commit/e38396e9962e203986aa27fc205c3f5bf992d153)]:
  - @glion/util-query@0.21.0
  - @glion/mllp@0.21.0
  - @glion/mllp-client@0.21.0
  - @glion/to-hl7v2@0.21.0
  - @glion/ack@0.21.0
  - @glion/ast@0.21.0
  - @glion/parser@0.21.0

## 0.20.0

### Patch Changes

- [#826](https://github.com/rethinkhealth/glion/pull/826) [`af5a279`](https://github.com/rethinkhealth/glion/commit/af5a2799c45bcd033d666f58ced29042c6a1c7a4) Thanks [@meleksomai](https://github.com/meleksomai)! - Update `rolldown` to 1.0.0-rc.17, the version the rest of the workspace builds with.
- Updated dependencies [[`62963fe`](https://github.com/rethinkhealth/glion/commit/62963fe254e90d903795d30b418eb7b8d93d8d87), [`e3dad65`](https://github.com/rethinkhealth/glion/commit/e3dad65d4650ef175aeb87cd1c81d61ef7f10019), [`a0cc178`](https://github.com/rethinkhealth/glion/commit/a0cc178a0aed61d92b240c0e8af830e86db488d1), [`d716120`](https://github.com/rethinkhealth/glion/commit/d7161207ed85a57908f52318027967f5aaf2d9dd), [`003907b`](https://github.com/rethinkhealth/glion/commit/003907bfe239970a5d333e47bc9d5e82ca750c51)]:
  - @glion/mllp-client@0.20.0
  - @glion/to-hl7v2@0.20.0
  - @glion/parser@0.20.0
  - @glion/ack@0.20.0
  - @glion/mllp@0.20.0
  - @glion/util-query@0.20.0
  - @glion/ast@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`da56d71`](https://github.com/rethinkhealth/glion/commit/da56d710066a52aa22ff5a65a6e3135ebb7026c4)]:
  - @glion/mllp-client@0.19.0
  - @glion/ack@0.19.0
  - @glion/ast@0.19.0
  - @glion/mllp@0.19.0
  - @glion/parser@0.19.0
  - @glion/to-hl7v2@0.19.0
  - @glion/util-query@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- 7715edf: `glion send` now reports an unsendable message — one with no MSH-10 control ID, or with a reserved VT/FS byte in its serialized text — as the `invalid` outcome kind (previously `transport`). The exit code stays 2; JSON consumers switching on `kind` should treat `invalid` as a pre-wire input failure: nothing reached the wire.
- 7715edf: Remove `@glion/mllp-ack` from the ecosystem: `ackMiddleware` and `acknowledge()` are retired ahead of built-in acknowledgment translation at the framework's error boundary in `@glion/mllp` (ADR 0019).
  - Remove `@glion/mllp-ack` from quick-start snippets and package catalogs; apps reply by returning a `Response` or via `app.onError()` until the built-in translation lands
  - Remove the `@glion/mllp-ack` workspace dependency from `@glion/cli`

- Updated dependencies [ee6738b]
- Updated dependencies [033cdb6]
- Updated dependencies [dca5259]
- Updated dependencies [033cdb6]
- Updated dependencies [64d78d6]
- Updated dependencies [5f18700]
- Updated dependencies [e260ee4]
- Updated dependencies [7715edf]
- Updated dependencies [5d81ea0]
  - @glion/ack@0.18.0
  - @glion/ast@0.18.0
  - @glion/mllp-client@0.18.0
  - @glion/mllp@0.18.0
  - @glion/parser@0.18.0
  - @glion/to-hl7v2@0.18.0
  - @glion/util-query@0.18.0

## 0.17.0

### Minor Changes

- be51259: Add the `glion send` command — send one HL7v2 message over MLLP and print the acknowledgment. A client utility for the dev loop, alongside `glion dev` and `glion start`.
  - Read the message from a file argument or stdin (omit the path, or pass `-`, to read stdin)
  - Re-serialize the parsed message to canonical CR-delimited form before sending, normalizing editor line endings; the receiver decides validity and answers with a NAK
  - Resolve the target from `--host`/`--port`, or from the project's `glion.config.ts` via `--local` (which override per field; a wildcard bind address maps to loopback)
  - Add `--timeout`, `--json`, and `-h`/`--help` flags
  - Adapt output to the destination: a human exchange view on a TTY, one JSON line when piped or with `--json`
  - Exit `0` on accept (AA/CA), `1` on NAK (AE/AR/CE/CR), `2` when the message could not be delivered
  - Connect over plaintext only; TLS targets are not yet supported

### Patch Changes

- Updated dependencies [b3a1921]
- Updated dependencies [c09d415]
- Updated dependencies [5d65e92]
- Updated dependencies [58de708]
- Updated dependencies [58de708]
- Updated dependencies [58de708]
  - @glion/mllp-client@0.17.0
  - @glion/ack@0.17.0
  - @glion/mllp@0.17.0
  - @glion/ast@0.17.0
  - @glion/parser@0.17.0
  - @glion/to-hl7v2@0.17.0
  - @glion/util-query@0.17.0

## 0.16.0

### Minor Changes

- 5e3d97e: Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

  Node 18 reaches end-of-life in April 2026; new code in this repo uses
  Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
  and standardising on a single supported Node line keeps the
  dependency matrix coherent across the monorepo.

  Downstream impact: applications that pin Node 18 will need to upgrade
  to Node 20 or later. Node 20 is itself in active LTS and remains
  supported until April 2026; Node 22 is the current LTS.

### Patch Changes

- Updated dependencies [5e3d97e]
- Updated dependencies [5e3d97e]
  - @glion/mllp@0.16.0

## 0.15.3

### Patch Changes

- @glion/mllp@0.15.3

## 0.15.2

### Patch Changes

- @glion/mllp@0.15.2

## 0.15.1

### Patch Changes

- 3ea71c2: Fix npm sigstore provenance verification by normalizing the `repository` field in every publishable package.json to the object form with a full GitHub URL and a `directory` subpath:

  ```json
  {
    "type": "git",
    "url": "git+https://github.com/rethinkhealth/glion.git",
    "directory": "packages/<name>"
  }
  ```

  Previously, most packages used the bare string shorthand `"rethinkhealth/glion.git"`, and `@glion/annotate-delimiters` had no `repository` field at all. npm's sigstore provenance check couldn't resolve either into a URL matching the OIDC claim (`https://github.com/rethinkhealth/glion`), causing CI publish to fail with:

  ```
  E422 Unprocessable Entity - PUT https://registry.npmjs.org/@glion%2fannotate-delimiters
  Error verifying sigstore provenance bundle:
  "repository.url" is "", expected to match "https://github.com/rethinkhealth/glion" from provenance
  ```

  No runtime or API changes.
  - @glion/mllp@0.15.1

## 0.15.0

### Minor Changes

- 57bbbc9: Initial release of the `glion` package — the MLLP server dev tool, extracted from `@glion/mllp`.
  - `glion dev` runs a live TUI + file watcher with cold-restart on save.
  - `glion start` runs in production mode with JSON-line stdout for log aggregators.
  - `glion/config` subpath export: `defineConfig` helper and `GlionConfig` type for `glion.config.ts`.
  - Zero-config fallback: looks for `glion.app.ts` or `src/glion.app.ts` when no config file is present.
  - Cross-runtime: works under Node (default), Bun (`bun --bun run`), and Deno (`deno task`).
  - CLI dependencies (Ink, chokidar, jiti, cosmiconfig, React) are `optionalDependencies` — the `@glion/mllp` core package no longer carries them.

- 05c2012: Capture `console.log`, `console.info`, `console.warn`, and `console.error` as structured `log` events.
  - Add `log` event type with `level` field (`"log"` | `"info"` | `"warn"` | `"error"`) and `message` string
  - Intercept all four console methods in the child process before loading user code
  - Format arguments via `util.format` (supports `%s`, `%d`, `%j` placeholders)
  - Render log events in the TUI with level-appropriate icons (▸ log, ℹ info, ! warn, ✗ error)
  - Fix dev mode crash when autosave triggers a rebuild on a file with syntax errors — the current child keeps running and the next save retries
  - Fix orphan child processes holding the port after parent crash — child detects parent death via stdin pipe close and self-exits

- 47404f5: Security hardening, file logger, and lifecycle refinements.

  **New features**
  - Opt-in file logging — adds a polymorphic `logging` field to `GlionConfig` (`boolean | LogLevel | object`). Default is **off**; opt in with `logging: true`, `logging: "info"`, or `logging: { level, dir, maxFiles }`. When enabled, writes rotating NDJSON to `.glion/logs/` with file mode `0600` and directory mode `0700`. An announcement on stderr surfaces the filesystem side effect on first run.
  - Startup warning when `glion start` binds `0.0.0.0` without TLS — emitted as a structured `warning` event (stdout + file logger) so operators see the exposure in aggregators. HELP_TEXT gains a "Network binding" section documenting dev (127.0.0.1) vs start (0.0.0.0) defaults.
  - New `GlionErrorKind`: `"log-dir-unsafe"` — surfaces when the configured log directory is a symlink instead of a regular directory.

  **Security hardening**
  - `.glion/` cache directory now created with mode `0700` and `manifest.json` with mode `0600` — closes world-readable TLS passphrase exposure on shared hosts.
  - File-logger rotation refuses to operate when the log directory is a symlink; `lstat`-guards each matching file before `unlink` so rotation only touches regular files it could have created.
  - `config-invalid` errors no longer attach the raw `ZodError` as `cause` — defense-in-depth against Zod v4's `input` retention and enum-mismatch messages that quote received values.
  - `runHeadless` event-subscriber leak fixed — repeated `runGlion` invocations no longer accumulate dead listeners.
  - `runStart` removes its `SIGINT`/`SIGTERM` process listeners on every exit path.

  **Lifecycle correctness**
  - Child `stdin`-end self-signals `SIGTERM` instead of calling `process.exit(1)` directly — delegates to the existing graceful shutdown path so in-flight MLLP messages drain.
  - Shutdown-handler error path now emits the full `closing → error → closed → exit` triplet — downstream consumers tracking lifecycle no longer see a truncated stream when `server.close()` rejects.
  - Child unhandled rejections / uncaught exceptions are converted into structured `fatal` events before exit.
  - Parent caps child `stdout`/`stderr` line length (1 MiB default) — prevents parent OOM from a runaway child.
  - TUI log array is bounded — prevents unbounded growth under high event volume.

  **Refactors (no behavior change)**
  - Event severity is now a type-level property. A `LEVEL_BY_TYPE` table in `src/events.ts` maps each variant to its level; `eventLevel(event)` is the single function sinks call. Only the `log` variant carries an instance-level `level` field (genuinely per-instance).
  - `GlionConfig` type derives from the Zod schema via `z.input` / `z.output` — adding a field to the schema propagates to public types automatically.
  - Config schema is a context-aware factory — path resolution, mode-dependent hostname, and the `configPath` top-level field all land via Zod `.transform()` calls in a single pass.
  - `file-logger.ts` lives at `src/` root as a primitive alongside `events.ts` and `errors.ts`. The `enabled` gate lives inside `createFileLogger` — callers ask for a logger and get `null` when disabled.
  - Extracted `installShutdownHandlers`, `loadEntry`, and TLS file reading into their own modules.

  **Deferred (tracked as follow-up issues)**
  - `#577` — migrate TLS passphrase off disk entirely via `GLION_TLS_PASSPHRASE` env var.
  - `#578` — add `verbose` config field (orthogonal to log levels) for gating fatal-event stack traces.
  - `#579` — PHI-via-`console.*`-capture decision log. Current stance: caller responsibility (standard logging-library position).
  - `#580` — extract `runInteractive` / `runHeadless` into their own modules for testability.
  - `#581` — stderr ANSI/control-character sanitization. Current stance: follow ecosystem (pm2, pino, Vite, Next.js all forward raw).

### Patch Changes

- 4aa0b44: Fix telemetry middleware not capturing ACK codes when `ackMiddleware()` is used.

  The TUI displayed `?` instead of `AA`/`AE`/`AR` because the telemetry middleware was installed as the innermost middleware, causing it to read `ctx.res` before the outer `ackMiddleware` had set it. Telemetry is now prepended (outermost) so its `await next()` completes after all user middleware have run.
  - Add `{ prepend: true }` option to `Mllp.use()` for inserting middleware at the front of the chain
  - Prepend the glion telemetry middleware so it wraps ackMiddleware correctly

- 11eaf43: Replace runtime TS loading with rolldown pre-build, require config file, simplify architecture.
  - Remove `loader.ts` and runtime jiti dependency — user TS files are now compiled to `.glion/` via rolldown `transform()` (config) and `build()` (entry) before loading
  - Remove c12 dependency — config discovery uses simple file existence checks (cwd-only, no ancestor walk)
  - Require `glion.config.ts` — remove zero-config conventional entry fallback (`glion.app.ts`)
  - Remove `synthesized` field from `ResolvedConfig`
  - Remove `resolve-config.ts` — merge config resolution into `config/load.ts` as a single `loadConfig()` export
  - Add `ChildManifest` type — parent writes server options + compiled entry path to `.glion/manifest.json`, child reads it via native `import()`
  - Change `GlionSupervisorOptions` — remove `config`, add `cwd`, `gracefulCloseMs`, `manifestPath`; make `runnerPath` optional (defaults to `dist/child/runner.js`)
  - Add `fatalEvent()` to `events.ts` — shared fatal event construction, replaces duplicated inline logic
  - Reduce tsdown entry points from 7 to 4 — eliminate stub + chunk duplication in dist
  - Add `tsconfig.build.json` — prevent test `.d.ts` files from shipping in dist

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4aa0b44]
- Updated dependencies [4af9499]
  - @glion/mllp@0.15.0
