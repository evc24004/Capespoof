const { Relay } = require('bedrock-protocol')
const sharp = require('sharp');

let spoofedCapeData = null;

async function loadCapeData() {
    try {
        const officeCapeBuffer = await sharp('MojangStudios_cape.png')
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        spoofedCapeData = {
            width: officeCapeBuffer.info.width,
            height: officeCapeBuffer.info.height,
            data: {
                type: 'Buffer',
                data: Array.from(officeCapeBuffer.data)
            }
        };
        
        console.log(`Cape data preloaded from MojangStudios_cape.png (${officeCapeBuffer.info.width}x${officeCapeBuffer.info.height})`);
    } catch (error) {
        console.error('Error loading MojangStudios_cape.png:', error);
    }
}

function createRelay() {
    console.log('Creating relay')
    const relay = new Relay({
        version: '1.21.100',
        host: '127.0.0.1',
        port: 19130,
        offline: false,
        destination: {
            host: 'suomicraftpe.ddns.net',
            port: 19132,
            offline: false
        },
        omitParseErrors: true
    })
    relay.conLog = console.debug
    relay.listen()
    relay.on('connect', player => {
        console.log('New connection', player.connection.address)

        player.on('clientbound', ({ name, params }) => {
            if (name === 'disconnect') {
                params.message = 'Dropped From Server'
            }
        })

        player.on('serverbound', ({ name, params }) => {
            if (name == 'player_auth_input' || name == 'interact') {
                return { name, params }
            } else {
                console.log(name)
            }

            if (name == 'player_skin') {
                console.log(params)

                const skinData = params.skin.personal_pieces
                params.skin.premium = true
                params.skin.cape_on_classic = true
                params.skin.persona = false

                const capeData = params.skin.cape_data

                if (spoofedCapeData) {
                    if (capeData && capeData.data) {
                        const timestamp = Date.now();
                        const filename = `original_cape_${timestamp}.png`;
                        
                        let originalBuffer;
                        if (capeData.data.type === 'Buffer' && Array.isArray(capeData.data.data)) {
                            originalBuffer = Buffer.from(capeData.data.data);
                        } else if (Array.isArray(capeData.data)) {
                            originalBuffer = Buffer.from(capeData.data);
                        }
                        
                        if (originalBuffer && capeData.width && capeData.height) {
                            sharp(originalBuffer, {
                                raw: {
                                    width: capeData.width,
                                    height: capeData.height,
                                    channels: 4
                                }
                            })
                            .png()
                            .toFile(filename)
                            .catch(err => console.error('Error saving original cape:', err));
                        }
                    }

                    params.skin.cape_data = spoofedCapeData;
                    console.log(`Cape spoofed with MojangStudios_cape.png (${spoofedCapeData.width}x${spoofedCapeData.height})`);
                } else {
                    console.log('Spoofed cape data not loaded yet');
                }

                params.skin.cape_id = '1b302e84-6da6-11ec-90d6-0242ac120003'
                params.skin.full_skin_id = "manrandomid"

                skinData.forEach(piece => {
                    if (piece.piece_type === 'persona_capes') {
                        piece.product_id = '4f156163-666c-4d3a-ace8-fc82ac8ac179'
                        piece.piece_id = '1b302e84-6da6-11ec-90d6-0242ac120003'
                        piece.pack_id = '1b302e84-6da6-11ec-90d6-0242ac120003'

                        console.log('Cape Spoofer activated')
                        player.queue('text', {
                            type: 'system', needs_translation: false, source_name: '', xuid: '', platform_chat_id: '', filtered_message: '',
                            message: `Cape Spoofer activated`
                        })
                    }
                })

                return { name, params }
            }
        })
    })
}

loadCapeData().then(() => {
    createRelay();
});