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
(async () => {
	// ensure directory exists
	const root = path.join('_posts', 'notion')
	fs.mkdirSync(root, { recursive: true })
	
	const lastUpdate = process.env.LAST_UPDATE;
	const databaseId = process.env.DATABASE_ID;
	// TODO has_more
	const response = await notion.databases.query({
		database_id: databaseId,
		filter: {
			"and" : [
				{
					property: "Publish",
					checkbox: {
						equals: true
					}
				},{
					timestamp: "last_edited_time",
					"last_edited_time": {
						on_or_after: lastUpdate
					}
				}				
			]			
		}
	})
	for (const r of response.results) {
		console.log(r)
		const id = r.id
		// date
		let cdate = moment(r.created_time).format("YYYY-MM-DD HH:MM")
		let pcdate = r.properties?.['Date']?.['date']?.['start']
		if (pcdate) {
			cdate = moment(pdate).format('YYYY-MM-DD HH:MM')
		}

		let edate = moment(r.last_edited_time).format("YYYY-MM-DD HH:MM")
		let pedate = r.properties?.['Date']?.['date']?.['start']
		if (pedate) {
			edate = moment(edate).format('YYYY-MM-DD HH:MM')
		}
		// title
		let title = id
		let ptitle = r.properties?.['Title']?.['title']
		if (ptitle?.length > 0) {
			title = ptitle[0]?.['plain_text']
		}
		// tags
		let tags = []
		let ptags = r.properties?.['Tags']?.['multi_select']
		for (const t of ptags) {
			const n = t?.['name']
			if (n) {
				tags.push(n)
			}
		}
		// categories
		let cat = r.properties?.['Category']?.['select']?.['name'];

		// comments
		//const comments = r.properties?.['No Comments']?.['checkbox'] == false

		// frontmatter
		let fmtags = ''
		if (tags.length > 0) {
			for (const t of tags) {
				fmtags += t + ','
			}
		}

		const fm =`---
layout: post
title: ${ptitle}
category: ${cat}
date: ${cdate}
last_modified_at: ${edate}
tags: [${fmtags}]
---
`
		const mdblocks = await n2m.pageToMarkdown(id);
		const md = n2m.toMarkdownString(mdblocks);
		console.log(md);
		const date = moment(r.created_time).format("YYYY-MM-DD")
		//writing to file
		const ftitle = `${date}-${title.replaceAll(' ', '-')}.md`
		fs.writeFile(path.join(root, ftitle), fm + md, (err) => {
			if (err) {
				console.log(err);
			}
		});
	}


})();