import { TwitterApi as Twitter }  from '../../deno_twitter_api/mod.ts'
import { encode } from 'https://deno.land/std@0.82.0/encoding/base64.ts'
import { delay } from 'https://deno.land/std@0.113.0/async/delay.ts'

import utils from '../utils.js'

const TWITTER_AUTH = {
    consumerApiKey: Deno.env.get('TWITTER_CONSUMER_KEY'),
    consumerApiSecret: Deno.env.get('TWITTER_CONSUMER_SECRET'),
    accessToken: Deno.env.get('TWITTER_ACCESS_TOKEN'),
    accessTokenSecret: Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET')
}

export default {
    tags: ['tweet'],
    preflight: async function(info, context) {
        // TODO: Implement auto assign date for tweets

        return true
            && await !utils.has_error_messages(info)
            && context.can_be_released
    },
    render: async function(info, context) {
        let {entry, page, notion} = info

        // Prepare context for twitter
        context.twitter = { media: [] }

        let buffer = ''
        for (let child of await utils.get_tree(notion, page)) {
            switch(child.type) {
                case 'heading_1':
                case 'heading_2':
                case 'heading_3':
                case 'heading_4':
                case 'heading_5':
                case 'heading_6':
                case 'paragraph':
                    buffer += child.paragraph.text.map(this.render_text).join('') + '\n\n'
                    break

                case 'numbered_list_item':
                case 'bulleted_list_item':
                    // TODO: Implement counting and sub-items
                    let last_of_list = children[children.indexOf(child) + 1].type != child.type
                    buffer += '* ' + child[child.type].text.map(this.render_text).join('') + '\n'

                    if (last_of_list)
                        buffer += '\n'
                    break

                // TODO: Implement <hr> breaks for manual tweet splitting

                case 'image':
                    context.twitter.media.push(await this.upload_media_chunked(child.image[child.image.type].url))
                    break

                // TODO: Implement video
            }
        }
        buffer = buffer.trim()
        // TODO: Implement auto splitter or manual split for threads
        if (buffer.length >= 280) {
            utils.add_error_message(
                `You went past the maximum amount of characters (${buffer.length}/280)`,
                info
            )
            return false
        }

        return buffer
    },

    publish: async function(data, content, context) {
        // TODO: Implement threads
        let response = await (new Twitter(TWITTER_AUTH)).post(
            'statuses/update.json',
            {
                status: content,
                media_ids: context.twitter.media
            }
        )
    },

    upload_media_chunked: async function(url) {
        const CHUNK_SIZE = 1 * 1024 * 1024
        let blob = await (await fetch(url)).blob()

        let client = new Twitter(TWITTER_AUTH)
        client.baseUrl = 'https://upload.twitter.com/1.1/'

        // Initialize the uploading process
        var response = await client.post(
            'media/upload.json',
            {
                command: 'INIT',
                total_bytes: blob.size,
                media_type: blob.type,
                media_category: 'tweet_image'
            }
        )
        let data = await response.json()
        let { media_id_string: media_id } = data
        console.debug(`Got "${media_id}" back as media_id`)

        let amount_of_slices = Math.max(Math.round(blob.size / CHUNK_SIZE), 1)
        console.debug(`Uploading in ${amount_of_slices} slices with total size of ${blob.size}`)

        // Prepare media slices
        let buffer = new Uint8Array(await blob.arrayBuffer())
        let slices = []
        for (let index = 0; index < amount_of_slices; index++) {
            let start = index * CHUNK_SIZE
            let end = (index + 1) * CHUNK_SIZE

            if (end > blob.size)
                end = blob.size

            slices.push(buffer.slice(start, end))
        }

        // Append media buffer slices
        for (let slice of slices) {
            console.debug(`Uploading slice #${slices.indexOf(slice) + 1}`)

            var response = await client.post(
                'media/upload.json',
                {
                    command: 'APPEND',
                    media_id,
                    segment_index: slices.indexOf(slice),
                    media: encode(slice)
                }
            )

            if (response.status < 200 || response.status > 299)
                console.log(await response.text())
        }

        // Finalize media upload
        var response = await client.post(
            'media/upload.json',
            {
                command: 'FINALIZE',
                media_id
            }
        )

        // TODO: Implement / test GIF/Video with "command STATUS"

        return media_id
    },

    render_text: function(info) {
        let buffer = info.text.content

        for (let key in info.annotations) {
            if (info.annotations[key])
                switch(key) {
                    case 'bold':
                        buffer = `*${buffer}*`
                        break
                    case 'italic':
                        buffer = `_${buffer}_`
                        break
                    case 'code':
                        buffer = `\`${buffer}\``
                        break
                    case 'strikethrough':
                        buffer = `~${buffer}~`
                        break
                    // TODO: Add support for underline and color
                }
        }

        return buffer
    }
}
