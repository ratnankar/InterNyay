# Legal knowledge library

The chat assistant searches every .md file in this folder, and in the folder set by internyay.chat.knowledge-dir, when a question is about law or procedure.

File format: a first line "# Source name", then one passage per "## Heading" with the text below it. Keep each passage short and about one point. Put the words an advocate would type, such as section numbers and common names, in the heading or the text.

Add court practice directions, local rules and checklists as new .md files in the knowledge directory, then call POST /api/admin/chat/knowledge/reload.
