import utils from '../utils.js'

export default {
    tags: ['devlog'],
    render: async function (row, page, children) {
        let buffer = ''
        for (let child of children) {
            switch(child.type) {
                case 'heading_1':
                case 'heading_2':
                case 'heading_3':
                case 'heading_4':
                case 'heading_5':
                case 'heading_6':
                    let amount = ~~child.type.split('').slice(-1)
                    buffer += new Array(amount).fill('#').join('')
                        + ' '
                        + child[child.type].text.map(this.render_text).join('')
                        + '\n\n'
                    break

                case 'paragraph':
                    let content = child.paragraph.text.map(this.render_text).join('')

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
                    buffer += `\n![](${url}) \n\n`
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

                        for (let image of images) {
                            let url = await utils.upload_media_if_not_found(image)
                            buffer += `\n![](${url}) \n\n`
                        }

                        break
                    }

                case 'unsupported':
                    console.warn('Came across an unsupported block!')
                    break
            }
        }

        return buffer
    },
    publish: async function(notion, row, page, content) {
        let file_name = utils.generate_slug(page) + '.md.txt'
        let buffer = new TextEncoder().encode(content)

        console.debug(`Uploading "${file_name}" as temporary to S3`)
        let url = await utils.check_s3_or_upload(file_name, buffer, 'duifje-notion-files', true, true)

        let files = (await utils.get_files_array(notion, row))
            .filter(
                entry => entry.name != 'Markdown file'
            )
            .concat(
                [
                    {
                        type: 'external',
                        name: 'Markdown file',
                        external: {
                            url
                        }
                    }
                ]
            )

        await notion.pages.update(
            {
                page_id: row.id,
                properties: {
                    Files: { files }
                }
            }
        )

    },
    render_text: function(info) {
        let buffer = ''
        if (!!info.text.link)
            buffer = `[${info.text.content}](${info.text.link.url})`
        else
            buffer = info.text.content

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
