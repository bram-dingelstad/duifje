import { Client } from 'https://deno.land/x/notion_sdk/src/mod.ts'
import { listenAndServe } from 'https://deno.land/std@0.113.0/http/server.ts'
import 'https://deno.land/x/dotenv/load.ts'

let env_variables = [
    'GITHUB_TOKEN',
    'NOTION_TOKEN',
    'NOTION_DATABASE_ID',
    'S3_KEY',
    'S3_SECRET',
    'S3_BUCKET',
    'S3_REGION'
]

// Check if all ENV variables are set
for (let env of env_variables) {
    if (!Deno.env.get(env))
        throw new Error('You forgot to set env variable ' + env)
}

import blog from './destinations/blog.js'
import twitter from './destinations/twitter.js'
import bbcode from './destinations/bbcode.js'
import markdown from './destinations/markdown.js'
import utils from './utils.js'

// Set some constants for tokens and ID's
const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN')
const NOTION_DATABASE_ID = Deno.env.get('NOTION_DATABASE_ID')

// Initializing a client
const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2021-08-16' })
utils.init_s3()

// TODO: Implement small backend API call that executes `run` and redirects `stdout` to page

let running = false
let last_ran = null

async function run() {
    if (running)
        return console.debug('Tried re-running while I\'m already busy!')
    running = true

    console.debug(`Doing a run at ${Date()}`)
    let ready_pages = await notion.databases.query({
        database_id: NOTION_DATABASE_ID,
        filter: {
            property: 'Status',
            select: {
                equals: 'Ready to be released'
            }
        }
    })

    for (let entry of ready_pages.results) {
        let page = await notion.blocks.retrieve({ block_id: entry.id })
        let data = {
            notion,
            entry,
            entries: ready_pages.results,
            page
        }
        let context = {}

        let date = entry.properties['Publish Date'].date
        context.has_release_date = !!date
        context.can_be_released = context.has_release_date && new Date(date.start).getTime() < Date.now()

        let modules = [blog, twitter, bbcode, markdown].filter(
                module => module.tags.filter(
                    tag => entry.properties.Type.multi_select.map(type => type.name).indexOf(tag) !== -1
                ).length != 0
            )

        let successful = true
        for (let module of modules) {
            try {
                if (!(await module.preflight(data, context)) || entry.properties.Type.multi_select.find(type => type.name == 'failed'))
                    continue

                let content = await module.render(data, context)
                successful = successful && !!content

                if (Deno.env.get('DRY_RUN'))
                    console.debug('Doing dry run') || module.dry_run && (await module.dry_run(data, content, context))
                else
                    await module.publish(data, content, context)
            } catch (error) {
                console.error('Something went wrong! 🙀')
                console.error(error)
            }
        }

        if (false && successful && !Deno.env.get('DRY_RUN'))
            await notion.pages.update({
                page_id: entry.id,
                properties: {
                    Status: {
                        select: {
                            name: 'Released'
                        }
                    }
                }
            })
    }
    running = false
}

listenAndServe(
    ':8080', async (request) => {
        let path = request.url.substr(request.url.indexOf('/', 'https://'.length), request.url.length)

        // if (!Deno.env.get('DRY_RUN') && ['iframe', 'empty'].indexOf(request.headers.get('sec-fetch-dest')) === -1)
        //     return new Response(new Blob(['<h1>He flew away!</h1>'], {type: 'text/html'}))

        if (path === '/') {
            let html = `
            <html>
                <head>
                    <title>Duifje's screen</title>
                    <meta charset="utf-8" />
                    <style>
                        /* TODO: Make this the same colorscheme as Notion with auto dark */
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                            background-color: #0C0D0B;
                            color: #D9D9D9;
                            padding: 0px;
                            margin: 0px;
                            height: 100%;
                        }

                        main {
                            border: solid 4px #3F5559;
                            padding: 18px;
                            margin: 18px;
                            border-radius: 18px;
                            height: calc(100% - 36px);
                        }

                        main:after {
                            content: '';
                            display: block;
                            clear: both;
                        }

                        button {
                            background-color: rgba(0, 0, 0, 0);/*#70848C;*/
                            border: solid 4px #70848C;
                            color: #D9D9D9;
                            padding: 4px;
                            border-radius: 8px;
                            font-weight: bold;
                            float: right;
                            transition: .3s ease;
                        }

                        button:hover:not(:disabled) {
                            background-color: #70848C;
                            color: #0C0D0B;
                        }

                        button:active {
                            border-width: 2px;
                            margin: 2px;
                            background-color: #1F2620;
                            border-color: #1F2620;
                            color: #D9D9D9;
                        }

                        button:disabled {
                            opacity: .8;
                            border-width: 1px;
                            margin: 3px;
                            border-style: dashed;
                        }

                    </style>
                    <script type="text/javascript">
                        async function run() {
                            document.querySelector('button').disabled = true
                            await fetch(document.location.href + 'run')
                            document.querySelector('button').disabled = false
                            document.location.reload()
                        }
                    </script>
                </head>
                <body>
                    <main>
                        <div>
                            ⏳ Last ran: ${last_ran || 'not yet'}
                        </div>
                        <button onclick='run()'>🐦 Let the bird loose</button>
                    </main>
                </body>
            </html>
            `.trim()
            let blob = new Blob([html], {type: 'text/html'})
            return new Response(blob)
        } else if (path === '/run') {
            console.debug('Received request to do a run!')
            await run()
            last_ran = new Date(Date.now())
            return new Response('Done!')
        }

        return new Response('Hello World\n')
    }
)

