import utils from '../utils.js'

export default {
    tags: ['devlog'],
    preflight: async function(info, context) {
        return true
            && !(await utils.has_error_messages(info))
            && context.can_be_released
    },
    render: async function ({entry, page}) {
        let children = await utils.get_tree(notion, page)
        let buffer = !!entry.cover
            ? `[center][img width=750]${await utils.upload_media_if_not_found(entry.cover[entry.cover.type].url)}[/img][/center]\n`
            : ''


        for (let child of children) {
            switch(child.type) {
                case 'heading_1':
                case 'heading_2':
                case 'heading_3':
                case 'heading_4':
                case 'heading_5':
                case 'heading_6':
                    buffer += '[b]'
                        + child[child.type].text.map(this.render_text).join('')
                        + '[/b]\n\n'
                    break

                case 'paragraph':
                    let content = child.paragraph.text.map(this.render_text).join('').trim()

                    if (!!content)
                        buffer += content + '\n\n'
                    break

                // TODO: Add callout block

                case 'numbered_list_item':
                case 'bulleted_list_item':
                    // TODO: Implement counting and sub-items
                    let last_of_list = children[children.indexOf(child) + 1].type != child.type
                    buffer += '* ' + child[child.type].text.map(this.render_text).join('') + '\n'

                    if (last_of_list)
                        buffer += '\n'
                    break

                case 'image':
                    var url = await utils.upload_media_if_not_found(child.image[child.image.type].url)
                    buffer += `\n[center][img]${url}[/img][/center]\n\n`
                    break

                case 'column_list':
                    let is_image_gallery = child.has_children &&
                        child.children
                            .map(
                                child => child.children
                                    .map(child => child.type === 'image')
                            )
                            .flat()
                            .reduce((a, t) => a = a && t)

                    if (is_image_gallery) {
                        let images = child.children
                            .map(
                                child => child.children
                                    .map(child => child.image[child.image.type].url)
                            )
                            .flat()

                        buffer += '[center][table]'
                        for (let image of images) {
                            let url = await utils.upload_media_if_not_found(image)
                            buffer += `[td][img]${url}[/img][/td]\n`
                        }
                        buffer += '[/table][/center]\n\n'

                        break
                    }

                case 'unsupported':
                    console.warn('Came across an unsupported block!')
                    break
            }
        }

        return buffer
    },
    publish: async function({notion, entry, page}, content) {
        let file_name = utils.generate_slug(page) + '.bbcode.txt'
        let buffer = new TextEncoder().encode(content)

        console.debug(`Uploading "${file_name}" as temporary to S3`)
        let url = await utils.check_s3_or_upload(file_name, buffer, 'duifje-notion-files', true, true)

        let files = (await utils.get_files_array(notion, entry))
            .filter(
                entry => entry.name != 'BBCode for TIGSource'
            )
            .concat(
                [
                    {
                        type: 'external',
                        name: 'BBCode for TIGSource',
                        external: {
                            url
                        }
                    }
                ]
            )

        await notion.pages.update(
            {
                page_id: entry.id,
                properties: {
                    Files: { files }
                }
            }
        )
    },
    render_text: function(info) {
        let buffer = ''
        if (!!info.text.link)
            buffer = `[url=${info.text.link.url}]${info.text.content}[/url]`
        else
            buffer = info.text.content

        for (let key in info.annotations) {
            if (info.annotations[key])
                switch(key) {
                    case 'bold':
                        buffer = `[b]${buffer}[/b]`
                        break
                    case 'italic':
                        buffer = `[i]${buffer}[/i]`
                        break
                    case 'code':
                        buffer = `[code]${buffer}[/code]`
                        break
                    case 'strikethrough':
                        buffer = `[s]${buffer}[/s]`
                        break
                    case 'underline':
                        buffer = `[u]${buffer}[/u]`
                        break

                    // TODO: Add support for color
                }
        }

        return buffer
    }
}
