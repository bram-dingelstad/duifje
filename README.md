duifje
------

My little pet helper/project for delivering content to all different types of platforms.
Check out my blogpost about it for more details!

Setup
-----

You need some basic things setup in order for this to work.
If you run it locally you can use a .env file in the directory of the project.
When using any other deployment method, just inject the needed variables.

```bash
# Notion
NOTION_TOKEN='<notion integration token>'
NOTION_DATABASE_ID='<the database your reading the articles from>'

# S3 (if you use the media uploading feature)
S3_KEY="<your s3 key>"
S3_SECRET="<your s3 secret>"
S3_BUCKET="<bucket name>"
S3_REGION="<s3 region>"
S3_ENDPOINT="<your s3 endpoint URL>"

# Twitter
TWITTER_CONSUMER_KEY="<twitter consumer key>"
TWITTER_CONSUMER_SECRET="<twitter consumer secret>"
TWITTER_ACCESS_TOKEN="<twitter access token>"
TWITTER_ACCESS_TOKEN_SECRET="<twitter access secret>"

# Github
GITHUB_TOKEN="<your github personal access token>"

# Extra options
DRY_RUN="true" # use this property to soft use the code without posting to platforms
```

