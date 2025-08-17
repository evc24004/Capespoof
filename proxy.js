'use strict';

/**
 * replicape — Bedrock relay that swaps your cape on-the-fly.
 * 
 * CLI usage:
 *   node replicape.js --host suomicraftpe.ddns.net --port 19132 --cape MojangStudios_cape.png
 * 
 * Optional flags:
 *   --listen-host  Default: 127.0.0.1
 *   --listen-port  Default: 19130
 *   --version      Bedrock protocol version string (default: 1.21.100)
 * 
 * Author: DJ Stomp <85457381+DJStompZone@users.noreply.github.com>
 * License: MIT
 */

const { Relay } = require('bedrock-protocol');
const sharp = require('sharp');
const { parseArgs } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const BedrockVersions = require("bedrock-versions");

/**
 * Parse CLI args with sane defaults.
 * We avoid external deps; Node 18+ provides parseArgs.
 *
 * @returns {{destHost:string, destPort:number, capePath:string, listenHost:string, listenPort:number, version:string}}
 */
function getConfigFromCLI() {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      port: { type: 'string' },
      cape: { type: 'string' },
      'listen-host': { type: 'string' },
      'listen-port': { type: 'string' },
      version: { type: 'string' },
    }
  });

  const env = process.env;
  const LATEST = await BedrockVersions.getLatestStableVersion();
  const destHost = values.host || env.REPLICAPE_DEST_HOST || 'suomicraftpe.ddns.net';
  const destPort = Number(values.port || env.REPLICAPE_DEST_PORT || 19132);
  const capePath = values.cape || env.REPLICAPE_CAPE_PATH || 'MojangStudios_cape.png';
  const listenHost = values['listen-host'] || env.REPLICAPE_LISTEN_HOST || '127.0.0.1';
  const listenPort = Number(values['listen-port'] || env.REPLICAPE_LISTEN_PORT || 19130);
  const version = values.version || env.REPLICAPE_VERSION || LATEST || '1.21.100';

  if (!destHost || Number.isNaN(destPort)) {
    console.error('Bad arguments: --host and --port (number) are required/valid.');
    process.exit(2);
  }

  return { destHost, destPort, capePath, listenHost, listenPort, version };
}

/**
 * Load a PNG and convert it to raw RGBA for bedrock-protocol skin.cape_data.
 *
 * @param {string} imgPath Absolute or relative path to a PNG file.
 * @returns {Promise<{width:number,height:number,data:{type:'Buffer',data:number[]}}>} Prepared cape data.
 */
async function loadCapeRGBA(imgPath) {
  const resolved = path.resolve(imgPath);
  try {
    await fs.promises.access(resolved, fs.constants.R_OK);
  } catch {
    throw new Error(`Cape file not readable: ${resolved}`);
  }

  const { data, info } = await sharp(resolved)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (!info || !info.width || !info.height) {
    throw new Error('Sharp did not return image dimensions; file may be corrupt.');
  }

  return {
    width: info.width,
    height: info.height,
    data: {
      type: 'Buffer',
      data: Array.from(data)
    }
  };
}

/**
 * Persist an incoming raw RGBA cape blob as PNG for reference.
 *
 * @param {{width:number,height:number,data:any}} capeData Raw cape from packet.
 * @param {string} outDir Directory to drop the file into.
 * @returns {Promise<string|undefined>} Output path if saved.
 */
async function saveOriginalCapeIfAny(capeData, outDir = '.') {
  try {
    if (!capeData || (!capeData.data && !Array.isArray(capeData))) return;
    let raw;
    if (capeData.data && capeData.data.type === 'Buffer' && Array.isArray(capeData.data.data)) {
      raw = Buffer.from(capeData.data.data);
    } else if (Array.isArray(capeData.data)) {
      raw = Buffer.from(capeData.data);
    } else if (Array.isArray(capeData)) {
      raw = Buffer.from(capeData);
    }
    if (!raw || !capeData.width || !capeData.height) return;

    const ts = Date.now();
    const out = path.resolve(outDir, `original_cape_${ts}.png`);
    await sharp(raw, {
      raw: { width: capeData.width, height: capeData.height, channels: 4 }
    }).png().toFile(out);
    return out;
  } catch (err) {
    console.error('Error saving original cape:', err);
  }
}

/**
 * Start the relay with packet mutation for player_skin.
 *
 * @param {{destHost:string,destPort:number,listenHost:string,listenPort:number,version:string}} cfg Relay configuration.
 * @param {{width:number,height:number,data:{type:'Buffer',data:number[]}}} spoofedCape Preloaded raw cape.
 */
function startRelay(cfg, spoofedCape) {
  console.log(`Creating relay -> ${cfg.destHost}:${cfg.destPort} (listen ${cfg.listenHost}:${cfg.listenPort}, v=${cfg.version})`);

  const relay = new Relay({
    version: cfg.version,
    host: cfg.listenHost,
    port: cfg.listenPort,
    offline: false,
    destination: {
      host: cfg.destHost,
      port: cfg.destPort,
      offline: false
    },
    omitParseErrors: true
  });

  relay.conLog = console.debug;
  relay.listen();

  relay.on('connect', player => {
    console.log('New connection', player.connection.address);

    player.on('clientbound', ({ name, params }) => {
      if (name === 'disconnect') {
        params.message = 'Dropped From Server';
        return { name, params };
      }
    });

    player.on('serverbound', async ({ name, params }) => {
      // Fast-path: pass chatty packets through without log spam.
      if (name === 'player_auth_input' || name === 'interact') {
        return { name, params };
      }

      if (name !== 'player_skin') {
        console.log(name);
        return { name, params };
      }

      try {
        // Toggle a few flags to look canonical.
        params.skin.premium = true;
        params.skin.cape_on_classic = true;
        params.skin.persona = false;

        // Best-effort save of original cape, if provided by client.
        if (params.skin && params.skin.cape_data) {
          const out = await saveOriginalCapeIfAny(params.skin.cape_data, '.');
          if (out) console.log(`Saved original cape -> ${out}`);
        }

        if (spoofedCape) {
          params.skin.cape_data = spoofedCape;
          params.skin.cape_id = '1b302e84-6da6-11ec-90d6-0242ac120003';
          params.skin.full_skin_id = 'manrandomid';

          // Nudge persona capes so servers that peek don't instantly reject.
          const pieces = params.skin.personal_pieces || [];
          for (const piece of pieces) {
            if (piece.piece_type === 'persona_capes') {
              piece.product_id = '4f156163-666c-4d3a-ace8-fc82ac8ac179';
              piece.piece_id = '1b302e84-6da6-11ec-90d6-0242ac120003';
              piece.pack_id = '1b302e84-6da6-11ec-90d6-0242ac120003';
            }
          }

          console.log(`Cape spoofed with ${spoofedCape.width}x${spoofedCape.height} RGBA from CLI path.`);
          player.queue('text', {
            type: 'system',
            needs_translation: false,
            source_name: '',
            xuid: '',
            platform_chat_id: '',
            filtered_message: '',
            message: 'Cape Spoofer activated'
          });
        } else {
          console.warn('Spoofed cape not loaded; passing through original skin.');
        }
      } catch (err) {
        console.error('Error during player_skin mutation:', err);
      }

      return { name, params };
    });
  });

  relay.on('error', (err) => {
    console.error('Relay error:', err);
  });
}

/**
 * Main entry — parse CLI, load cape, run relay.
 */
async function main() {
  try {
    const cfg = getConfigFromCLI();
    const spoofedCape = await loadCapeRGBA(cfg.capePath);
    console.log(`Cape data preloaded from ${cfg.capePath} (${spoofedCape.width}x${spoofedCape.height})`);
    startRelay(cfg, spoofedCape);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { getConfigFromCLI, loadCapeRGBA, saveOriginalCapeIfAny, startRelay };
}
