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
		let date = moment(r.created_time).format("YYYY-MM-DD")
		let pdate = r.properties?.['Date']?.['date']?.['start']
		if (pdate) {
			date = moment(pdate).format('YYYY-MM-DD')
		}
		// title
		let title = id
		let ptitle = r.properties?.['Post']?.['title']
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
		let cats = []
		let pcats = r.properties?.['Categories']?.['multi_select']
		for (const t of pcats) {
			const n = t?.['name']
			if (n) {
				cats.push(n)
			}
		}
		
		// comments
		//const comments = r.properties?.['No Comments']?.['checkbox'] == false

		// frontmatter
		let fmtags = ''
		let fmcats = ''
		if (tags.length > 0) {
			fmtags += '\ntags:\n'
			for (const t of tags) {
				fmtags += '  - ' + t + '\n'
			}
		}
		if (cats.length > 0) {
			fmcats += '\ncategories:\n'
			for (const t of cats) {
				fmcats += '  - ' + t + '\n'
			}
		}
		const fm = `---
                    layout: post
                    title: ${title}
                    category: ${fmcats}
                    date: ${date}
                    tags: ${fmtags}
                    ---
                    `
		const mdblocks = await n2m.pageToMarkdown(id);
		const md = n2m.toMarkdownString(mdblocks);

		//writing to file
		const ftitle = `${date}-${title.replaceAll(' ', '-')}.md`
		fs.writeFile(path.join(root, ftitle), fm + md, (err) => {
			if (err) {
				console.log(err);
			}
		});
	}


})();