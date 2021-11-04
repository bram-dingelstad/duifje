import {
  encode,
} from "https://deno.land/std@0.110.0/encoding/base64.ts";

import utils from '../utils.js'

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')

export default {
    tags: ['blog', 'devlog'],
    render: async function (row, page, children) {
        let buffer = await this.generate_header(row, page)

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
                    buffer += `\n<center><img style="flex: 1; max-width: 50%; margin: 0px 8px; margin-bottom: 8px" src="${url}" /></center>\n\n`
                    break

                case 'audio':
                    var url = await utils.upload_media_if_not_found(child.audio[child.audio.type].url)
                    buffer += `<audio controls><source src="${url}"></audio><br/>\n\n`
                    break

                // TODO: Implement video

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

                        buffer += '<center style="display: flex;">\n'
                        for (let image of images) {
                            let url = await utils.upload_media_if_not_found(image)
                            buffer += `<img style="flex: 1; max-width: 50%; margin: 0px 8px" src="${url}" />\n`
                        }
                        buffer += '</center>\n\n'

                        break
                    }

                case 'unsupported':
                    console.warn('Came across an unsupported block!')
                    break
            }
        }

        buffer += '\n\n{{<goodbye>}}'

        return buffer
    },
    generate_header: async function(row, page) {
        return `---
title: "${row.properties.Name.title.map(this.render_text).join('').replace(/"/g, '\\"')}"
subtitle: "${row.properties.Subtitle.rich_text.map(this.render_text).join('').replace(/"/g, '\\"')}"
date: ${row.properties['Publish Date'].date.start}T00:00:00+01:00
object_position: center
tags: [${row.properties.Tag.multi_select.map(item => item.name)}]
cover:
    image: "${await utils.upload_media_if_not_found(row.cover.file.url)}"
---
`

    },
    publish: async function(notion, row, page, content) {
        let slug = utils.generate_slug(page)
        let file_buffer = encode(content)
        let commit_message = `Wrote/updated ${slug}`

        console.debug('Comitting to Github for blogpost on slug', slug)

        let head_hash = (await (await fetch(
            'https://api.github.com/graphql',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`
                },
                body: JSON.stringify(
                    {
                        "query": `query {
                            repository(name:"bram.dingelstad.works", owner: "bram-dingelstad") {
                                object(expression:"HEAD") {
                                    oid
                                }
                            }
                        }`
                    }
                )
            }
        )).json()).data.repository.object.oid

        console.debug('Comitting with head', head_hash)

        let result = await fetch(
            'https://api.github.com/graphql',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`
                },
                body: JSON.stringify(
                    {
                        query: "mutation ($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { url } } }",
                        variables: {
                            input: {
                                branch: {
                                    repositoryNameWithOwner: "bram-dingelstad/bram.dingelstad.works",
                                    branchName: "master"
                                },
                                message: { "headline": commit_message },
                                fileChanges: {
                                    additions: [{
                                        path: `content/blog/${slug}/index.md`,
                                        contents: file_buffer
                                    }]
                                },
                                expectedHeadOid: head_hash
                            }
                        }
                    }
                )
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
