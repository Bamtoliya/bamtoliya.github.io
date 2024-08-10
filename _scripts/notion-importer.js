const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const moment = require('moment');
const path = require('path');
const fs = require('fs');

// Create a Notion client from an environment variable
const notion = new Client({
	auth: process.env.NOTION_TOKEN,
});

// passing notion client to the option
const n2m = new NotionToMarkdown({ notionClient: notion });

// Query the database and filter out unpublished entries
const response = await notion.databases.query({
		database_id: process.env.DATABASE_ID,
		filter: {
			property: "공개",
			checkbox: {
				equals: true
			}
		}
	})

// Iterate over the results
for (const r of response.results) {

  // build the post front matter

  // convert the page to markdown

  // write it to disk
  fs.writeFile("TEST");
}