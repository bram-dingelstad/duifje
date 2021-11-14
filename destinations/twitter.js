import { TwitterApi as Twitter } from 'https://raw.githubusercontent.com/bram-dingelstad/deno_twitter_api/master/mod.ts'
import { encode } from 'https://deno.land/std@0.82.0/encoding/base64.ts'

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
        if (!context.has_release_date)
            await this.auto_assign_dates(info)

        return true
            && !(await utils.has_error_messages(info))
            && context.can_be_released
    },
    render: async function(info, context) {
        let {entry, page, notion} = info
        let tweets = []

        // Prepare context for twitter
        context.twitter = { media: [] }

        let children = await utils.get_tree(notion, page)

        let buffer = !!children.length
            ? ''
            : page.child_page.title

        for (let child of children) {
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
                    let last_of_list = children[children.indexOf(child) + 1].type != child.type
                    buffer += '* ' + child[child.type].text.map(this.render_text).join('') + '\n'

                    if (last_of_list)
                        buffer += '\n'
                    break

                case 'divider':
                    buffer = buffer.trim()
                    if (buffer.length >= 280) {
                        utils.add_error_message(
                            `You went past the maximum amount of characters (${buffer.length}/280) in tweet #${tweets.length + 1}`,
                            info
                        )
                        return false
                    }
                    tweets.push(buffer)
                    buffer = ''
                    break

                case 'image':
                    context.twitter.media.push(await this.upload_media_chunked(child.image[child.image.type].url))
                    break

                // TODO: Implement video
            }
        }
        buffer = buffer.trim()
        if (buffer.length >= 280) {
            utils.add_error_message(
                `You went past the maximum amount of characters (${buffer.length}/280) in tweet #${tweets.length + 1}`,
                info
            )
            return false
        }

        tweets.push(buffer)

        return tweets
    },

    publish: async function(data, content, context) {
        console.debug(`Publishing tweet "${data.page.child_page.title}"`)

        let i = 0
        let reply_id
        for (let tweet of content) {
            console.debug(`Using "${reply_id}" as ID for posting to`)

            let response = await new Twitter(TWITTER_AUTH).post(
                'statuses/update.json',
                {
                    status: tweet,
                    // TODO: Make the media indexable per tweet
                    //       assuming even spread of 4 per tweet for now
                    media_ids: context.twitter.media.slice(i * 4, i * 4 + 4),
                    auto_populate_reply_metadata: content.length > 1,
                    in_reply_to_status_id: reply_id
                }
            )

            reply_id = (await response.json()).id_str
            i += 1
        }
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
                console.error(await response.text())
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

    auto_assign_dates: async function(info) {
        let other_tweets = info.entries.filter(
            entry => entry != info.entry && entry.properties.Type.multi_select.find(e => e.name === 'tweet')
        )

        let latest_tweet = other_tweets.length >= 1 && other_tweets
            .sort(
                (tweetA, tweetB) => {
                    let dateA = tweetA.properties['Publish Date'].date
                    let dateB = tweetB.properties['Publish Date'].date


                    return (
                        dateA
                        && dateB
                        && dateA.start
                        && dateB.start
                        && new Date(dateA.start).getTime() > new Date(dateB.start).getTime()
                    ) ? -1 : 1
                }
            )[0]

        let content_spread = parseFloat(await utils.get_runtime_variable('Content spread', info.notion)) || 48
        let release_date = (
            latest_tweet
            && latest_tweet.properties['Publish Date'].date
            && new Date(new Date(latest_tweet.properties['Publish Date'].date.start).getTime() + content_spread * 3600 * 1000)) || new Date()

        // Edit the publish date on the entity & local representations
        info.entry.properties['Publish Date'].date = { start: release_date.toISOString() }
        info.entries.find(entry => entry === info.entry).properties['Publish Date'] = info.entry.properties['Publish Date']

        await info.notion.pages.update({
            page_id: info.entry.id,
            properties: {
                'Publish Date': {
                    date: info.entry.properties['Publish Date'].date
                }
            }
        })
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
