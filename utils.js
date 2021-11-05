import { sha1 } from 'https://denopkg.com/chiefbiiko/sha1/mod.ts'
import { extension } from "https://deno.land/x/media_types/mod.ts"
import { S3Bucket } from "https://deno.land/x/s3@0.4.1/mod.ts"

let bucket
export default {
    // initialize S3 connection
    init_s3: function() {
        bucket = new S3Bucket(
            {
                accessKeyID: Deno.env.get('S3_KEY'),
                secretKey: Deno.env.get('S3_SECRET'),
                bucket: Deno.env.get('S3_BUCKET'),
                region: Deno.env.get('S3_REGION'),
                endpointURL: Deno.env.get('S3_ENDPOINT')
            }
        )
    },

    // Simple function for removing duplicates in a .filter generic function
    remove_duplicates: (entry, index, array) => array.indexOf(entry) === index,

    // Function for retaining and returning a mirrored URL
    upload_media_if_not_found: async function(url) {
        if (url.indexOf('secure.notion') === -1)
            return url

        if (cached_files[url])
            return cached_files[url]

        let blob = await (await fetch(url)).blob()
        let buffer = new Uint8Array(await blob.arrayBuffer())
        let hash = sha1(buffer, 'utf8', 'hex')
        let file_extension = extension(blob.type)
        let file_name = `${hash}.${file_extension}`
        let new_url = `https://brams-bucket.s3.nl-ams.scw.cloud/pigeon/${file_name}`

        cached_files[url] = new_url
        this.check_s3_or_upload(file_name, buffer)

        return new_url
    },

    check_s3_or_upload: async function(file_name, buffer, directory = 'pigeon', temporary = false, overwrite = false) {
        if (!overwrite && !!(await bucket.getObject(`${directory}/${file_name}`)))
            return console.debug('Filename', file_name, 'already exists, so skipping upload')

        await bucket.putObject(
            `${directory}/${file_name}`,
            buffer,
            {
                acl: 'public-read',
                contentType: buffer.type,
                expires: temporary ? new Date(Date.now() + 24 * 3600 * 1000) : null
            }
        )

        console.debug('Done uploading', file_name)
        return `https://brams-bucket.s3.nl-ams.scw.cloud/${directory}/${file_name}`
    },

    // Generate a generic slug based on page data
    generate_slug: function(page) {
        return page[page.type].title
            .replace(/\(|\)|#|,|\.|"|'/g, ' ')
            .trim()
            .replace(/\s\s/g, ' ')
            .replace(/\s\s/g, ' ')
            .replace(/_|\s/g, '-')
            .toLowerCase()
    },

    // Get files array for row
    get_files_array: async function(notion, row) {
        let page = await notion.pages.retrieve({
            page_id: row.id
        })

        return page.properties.Files.files
    },

    // Get a block and recursively note down it's children
    get_tree: async function(notion, block) {
        let children = (await notion.blocks.children.list({ block_id: block.id })).results
        for (let child of children) {
            if (child.has_children)
                child.children = await this.get_tree(notion, child)
        }
        return children
    }
}

let cached_files = {}
