// TODO: Switch to more generic twitter wrapper (deno_twitter_api)
import { statusUpdate } from "https://kamekyame.github.io/twitter_api_client/api_v1/tweets/update.ts"

const TWITTER_AUTH = {
    consumerKey: Deno.env.get('TWITTER_CONSUMER_KEY'),
    consumerSecret: Deno.env.get('TWITTER_CONSUMER_SECRET'),
    token: Deno.env.get('TWITTER_ACCESS_TOKEN'),
    tokenSecret: Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET')
}

export default {
    tags: ['tweet'],

    render: async function(row, page, children) {
        let buffer = ''
        for (let child of children) {
            switch(child.type) {
                case 'heading_1':
                case 'heading_2':
                case 'heading_3':
                case 'heading_4':
                case 'heading_5':
                case 'heading_6':
                case 'paragraph':
                case 'callout':
                    buffer += child.paragraph.text.map(this.render_text).join('')
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

                // TODO: Implement media & video
                // case 'image':
                //     var url = await utils.upload_media_if_not_found(child.image[child.image.type].url)
                //     buffer += `\n<center><img style="flex: 1; max-width: 50%; margin: 0px 8px; margin-bottom: 8px" src="${url}" /></center>\n\n`
                //     break
                //
                // case 'audio':
                //     var url = await utils.upload_media_if_not_found(child.audio[child.audio.type].url)
                //     buffer += `<audio controls><source src="${url}"></audio><br/>\n\n`
                //     break
                // case 'unsupported':
                //     let is_image_gallery = child.has_children &&
                //         child.children
                //             .map(
                //                 child => child.children
                //                     .map(child => child.type === 'image')
                //             )
                //             .flat()
                //             .reduce((a, t) => a = a && t)
                //
                //     if (is_image_gallery) {
                //         let images = child.children
                //             .map(
                //                 child => child.children
                //                     .map(child => child.image[child.image.type].url)
                //             )
                //             .flat()
                //
                //         buffer += '<center style="display: flex;">\n'
                //         for (let image of images) {
                //             let url = await utils.upload_media_if_not_found(image)
                //             buffer += `<img style="flex: 1; max-width: 50%; margin: 0px 8px" src="${url}" />\n`
                //         }
                //         buffer += '</center>\n\n'
                //
                //         break
                //  }
                //
                // console.warn('Came across an unsupported block!')
                // break
            }
        }
        buffer = buffer.trim()
        // TODO: Implement auto splitter or manual split for threads
        if (buffer.length >= 280)
            return console.debug('Went over limit for a tweet') || false

        return buffer
    },

    publish: async function(notion, row, page, content) {
        // TODO: Implement threads
        // TODO: Implement media
        await statusUpdate(TWITTER_AUTH, { status: content })
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
