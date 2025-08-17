# replicape

![Cape Spoofer Demo](https://i.imgur.com/OQPCLvm.png)

Everyone deserves a Mojang Developer cape.

## Overview

Replicape is a tiny Bedrock relay that **spoofs your Minecraft cape** on the fly. It sits between your client and a remote Bedrock server, intercepts the `player_skin` packet, and replaces the cape with one you provide (default: MojangStudios_cape.png). It also dumps your original cape to disk for convenience.

> Tested with bedrock-protocol Relay on 1.21.100. Your mileage may vary if Mojang changes packet structures.


## What it does (in one breath)

- Runs a `bedrock-protocol` Relay that listens on 127.0.0.1:19130 and forwards to a destination server (default: suomicraftpe.ddns.net:19132).
- Preloads your replacement cape from `MojangStudios_cape.png` using `sharp`, ensures RGBA, and stores {width, height, raw} in memory.
- On `player_skin`, flips switches to look “premium/persona-off/cape-on-classic”, swaps `skin.cape_data` with the preloaded image, tweaks persona cape piece IDs, and notifies you in chat with a “Cape Spoofer activated” system message.
- If you connected with a cape, it will try to save your **original** cape to `original_cape_<timestamp>.png` for posterity.


## Why this exists

For folks who want to test cape looks, branding, or texture alignment without touching resource packs on disk or running a modded client. It’s a protocol shim that rewrites exactly one thing: your cape in the `player_skin` packet.


## Requirements

- Node.js 18+ (LTS recommended)
- A working C/C++ toolchain if your OS needs it for `sharp` (libvips). See Troubleshooting.
- A valid PNG at `MojangStudios_cape.png` with the expected cape dimensions (common 64x32 or 64x64; any RGBA with alpha works).


## Install

```
npm i -g replicape-mc
```

## Quickstart

1) Point your **Minecraft Bedrock client** to localhost port **19130** (that’s where the relay listens).
2) Start the relay.

    node replicape.js

3) Join. If the connection succeeds, you should see logs like:

    Creating relay
    New connection 127.0.0.1:xxxxx
    Cape spoofed with MojangStudios_cape.png (64x32)
    Cape Spoofer activated

4) Check your in-game appearance. The system message should pop once per skin send.

## Configuration

The relay is configured inline. Adjust these knobs in `createRelay()`:

- version: Bedrock protocol string. Example: `1.21.100`. Must match your client. If you’re not sure, run the relay with `omitParseErrors: false` to see parsing failures. Defaults to latest stable release.
- host / port: Where the relay listens (default 127.0.0.1:19130). Keep it local unless you know what you’re doing.
- destination.host / destination.port: The remote Bedrock server you actually want to join.
- offline flags: Leave `false` for normal Xbox Live authentication flows.

You can also change the default cape PNG by renaming or modifying `loadCapeData()` to point at a different file.

### Environment variables (optional)

Not strictly required, but if you prefer env-driven config, wrap these in your script:

- REPLICAPE_LISTEN_HOST (default 127.0.0.1)
- REPLICAPE_LISTEN_PORT (default 19130)
- REPLICAPE_DEST_HOST (default suomicraftpe.ddns.net)
- REPLICAPE_DEST_PORT (default 19132)
- REPLICAPE_VERSION (defaults to latest stable release)
- REPLICAPE_CAPE_PATH (default MojangStudios_cape.png)

## How it works

- On startup, `sharp` reads `MojangStudios_cape.png`, converts to raw RGBA, and caches `{width, height, data}` in `spoofedCapeData`.
- The relay emits `serverbound` events for packets sent to the server. When it sees `player_skin`:
  - It marks the skin as premium, persona=false, cape_on_classic=true.
  - If the client sent a real cape, it reconstructs it via `sharp` and saves it to `original_cape_<timestamp>.png` for you.
  - It replaces `params.skin.cape_data` with your preloaded image.
  - It aligns persona-cape pieces (`product_id`, `piece_id`, `pack_id`) so servers that sanity-check persona pieces don’t immediately nuke the change.
  - It queues a `text` system message confirming activation.
- Everything else passes through unmodified (except for dropping some noisy logs).

## Notes and caveats

- **Protocol/version drift**: If your client updates, the declared `version` may need to change. Packet layouts can and do drift.
- **Servers with stricter checks** may ignore/override skin mutations or enforce canonical capes via server-side policies.
- **PNG dimensions**: Use a known-good cape size, keep alpha, and mind that some clients expect specific layouts.
- **Saving original capes**: Works only if the incoming `cape_data` is present and includes width/height + RGBA data.

## Troubleshooting

- sharp install fails on Linux
  - Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y build-essential pkg-config libvips
  - Alpine: apk add --no-cache vips-dev build-base python3
  - RHEL/CentOS: sudo dnf install -y gcc-c++ make pkgconfig vips-devel
  - Then reinstall: npm rebuild sharp

- Relay starts but client can’t join
  - Verify your client points to 127.0.0.1:19130.
  - Make sure the destination server is online and reachable from your machine.
  - Check firewalls; ensure UDP/19132 and your local listen port are open locally.
  - Match the protocol version with your client build; if mismatched, you’ll see parse/handshake issues.

- “Spoofed cape data not loaded yet”
  - The PNG failed to load, or the path is wrong. Confirm `MojangStudios_cape.png` exists next to the script and is a valid RGBA PNG.
  - Try another PNG to rule out a broken image.

- Original cape didn’t save
  - Not all clients send a cape blob. Ensure you had a cape equipped when connecting.
  - Check write permissions in the working directory.

## Extending

- Hot-reload the cape: watch the file and rebuild `spoofedCapeData` on change.
- Per-player capes: map XUID -> PNG path for multiplayer testing.
- CLI flags/env config: promote inline constants to a config module or yargs/commander CLI.
- Validation: assert PNG dimensions and channel count up front with helpful errors.

## Legal & Fair Use

- This project mutates your **own outbound skin/cape data** at runtime. It does not patch game files or distribute copyrighted assets.
- Respect server rules and Mojang/Microsoft EULAs. Some servers may prohibit cosmetic spoofing.
- You are responsible for how you use this tool.

## Minimal script shape (for reference)

This is the rough structure your script should follow. Names and IDs are the same as in the example you provided.

    const { Relay } = require('bedrock-protocol')
    const sharp = require('sharp')

    let spoofedCapeData = null

    async function loadCapeData() { /* read PNG via sharp -> raw RGBA -> store {width,height,data} */ }
    function createRelay() { /* start Relay, intercept player_skin, swap cape, send system text */ }

    loadCapeData().then(createRelay)

## FAQ

- Q: Will this work on Realms or Marketplace servers?
  - A: If they allow direct IP and don’t enforce stricter skin integrity checks, possibly. Many curated servers will likely block altered cosmetics.

- Q: Can I use JPEG or WEBP for the cape?
  - A: Use PNG with alpha. The relay converts and sends raw RGBA that should match client expectations.

- Q: Can I change other skin parts?
  - A: Yes, the same approach can rewrite other `skin.*` fields, but expect server pushback if you get creative.

## License

MIT. No warranty.

```json
{
  "code": 200,
  "status": "OK",
  "data": {
    "Count": 1,
    "Items": [
      {
        "SourceEntity": {
          "Id": "B63A0803D3653643",
          "Type": "namespace",
          "TypeString": "namespace"
        },
        "SourceEntityKey": {
          "Id": "B63A0803D3653643",
          "Type": "namespace",
          "TypeString": "namespace"
        },
        "Id": "4f156163-666c-4d3a-ace8-fc82ac8ac179",
        "Type": "bundle",
        "AlternateIds": [
          {
            "Type": "FriendlyId",
            "Value": "a9269d4c-b046-4ad8-ac20-297978d6276e"
          }
        ],
        "Title": {
          "en-US": "Mojang Studios Cape",
          "NEUTRAL": "Mojang Studios Cape",
          "neutral": "Mojang Studios Cape"
        },
        "Description": {
          "en-US": "§",
          "NEUTRAL": "§",
          "neutral": "§"
        },
        "Keywords": {
          "en-US": {
            "Values": [
              "Red"
            ]
          },
          "NEUTRAL": {
            "Values": [
              "Red"
            ]
          },
          "neutral": {
            "Values": [
              "Red"
            ]
          }
        },
        "ContentType": "PersonaDurable",
        "CreatorEntityKey": {
          "Id": "301F442C3B63DC20",
          "Type": "master_player_account",
          "TypeString": "master_player_account"
        },
        "CreatorEntity": {
          "Id": "301F442C3B63DC20",
          "Type": "master_player_account",
          "TypeString": "master_player_account"
        },
        "IsStackable": false,
        "Platforms": [
          "android.amazonappstore",
          "android.googleplay",
          "b.store",
          "ios.store",
          "nx.store",
          "oculus.store.gearvr",
          "oculus.store.rift",
          "uwp.store",
          "uwp.store.mobile",
          "xboxone.store",
          "title.bedrockvanilla",
          "title.earth"
        ],
        "Tags": [
          "4f156163-666c-4d3a-ace8-fc82ac8ac179",
          "1b302e84-6da6-11ec-90d6-0242ac120003",
          "tag.red",
          "1P"
        ],
        "CreationDate": "2022-01-18T23:14:28.974Z",
        "LastModifiedDate": "2023-08-10T15:34:13.565Z",
        "StartDate": "2022-01-18T18:00:00Z",
        "Contents": [
          {
            "Id": "50ef4890-a664-47bf-9c07-ee5935cbb84e",
            "Url": "https://xforgeassets001.xboxlive.com/pf-title-b63a0803d3653643-20ca2/50ef4890-a664-47bf-9c07-ee5935cbb84e/primary.zip",    
            "MaxClientVersion": "65535.65535.65535",
            "MinClientVersion": "1.16.0",
            "Tags": [],
            "Type": "personabinary"
          }
        ],
        "Images": [
          {
            "Id": "105e3182-d377-408b-9739-a3ee53072d40",
            "Tag": "Thumbnail",
            "Type": "Thumbnail",
            "Url": "https://xforgeassets002.xboxlive.com/pf-title-b63a0803d3653643-20ca2/105e3182-d377-408b-9739-a3ee53072d40/mojang_studios_cape_thumbnail_0.png"
          }
        ],
        "ItemReferences": [
          {
            "Id": "d057c6d8-3769-432e-ba61-ea0ad50ebbd7",
            "Amount": 1
          }
        ],
        "Rating": {
          "Average": 3,
          "TotalCount": 2,
          "Count5Star": 1,
          "Count4Star": 0,
          "Count3Star": 0,
          "Count2Star": 0,
          "Count1Star": 1
        },
        "DeepLinks": [],
        "DisplayProperties": {
          "creatorName": "Minecraft",
          "offerId": "a9269d4c-b046-4ad8-ac20-297978d6276e",
          "originalCreatorId": "2535448579972708",
          "purchasable": false,
          "packIdentity": [
            {
              "type": "persona_piece",
              "uuid": "1b302e84-6da6-11ec-90d6-0242ac120003",
              "version": "1.0.1"
            }
          ],
          "publicChangelog": {
            "neutral": "",
            "en-US": "",
            "bg-BG": "",
            "cs-CZ": "",
            "da-DK": "",
            "de-DE": "",
            "el-GR": "",
            "en-GB": "",
            "es-ES": "",
            "es-MX": "",
            "fi-FI": "",
            "fr-CA": "",
            "fr-FR": "",
            "hu-HU": "",
            "id-ID": "",
            "it-IT": "",
            "ja-JP": "",
            "ko-KR": "",
            "nb-NO": "",
            "nl-NL": "",
            "pl-PL": "",
            "pt-BR": "",
            "pt-PT": "",
            "ru-RU": "",
            "sk-SK": "",
            "sv-SE": "",
            "tr-TR": "",
            "uk-UA": "",
            "zh-CN": "",
            "zh-TW": ""
          },
          "pieceType": "persona_capes",
          "rarity": "legendary"
        }
      }
    ],
    "ConfigurationName": "DEFAULT"
  }
}
```
