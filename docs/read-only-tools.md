# Read-only MCP tools

All v1 tools are read-only and backed only by upstream `GET` requests. Outputs are scoped to what the authenticated WordPress/Fluent Community account can see in the web UI.

All tools should use annotations equivalent to:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

All tool inputs and outputs must have Zod schemas. Upstream REST responses start as `unknown` and are validated with Zod before use.

## Common rules

- `limit`: default 50, hard max 200 unless a tool states lower.
- `page`: integer 1..100.
- `per_page`: default 50, hard max 100 for feeds/members/spaces/courses.
- `comment_per_feed_limit`: default 100, hard max 200.
- `scan_feed_limit`: default 300, hard max 500.
- `since`: parsed to WordPress local time `YYYY-MM-DD HH:mm:ss`.
- `username`: `^[A-Za-z0-9_-]{1,80}$`.
- `space_slug`: `^[A-Za-z0-9_-]{1,120}$`.
- `feed_id`: positive integer.
- `query`: trimmed string, 1..200 chars, no control chars.
- Upstream concurrency for fan-out tools: default 4, hard max 8.
- No tool accepts arbitrary URL, route, method, or headers.

## Tool: `club_search_members`

Find visible members/profiles by search text.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 200 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 }
  },
  "required": ["query"]
}
```

Upstream:

```text
GET /members?search=<query>&page=1&per_page=<limit>
```

Output fields:

```text
members[].user_id
members[].display_name
members[].username
members[].avatar
members[].short_description
members[].total_points
members[].last_activity
members[].permalink
```

## Tool: `club_get_profile`

Get visible profile fields for another user.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "username": { "type": "string", "pattern": "^[A-Za-z0-9_-]{1,80}$" },
    "include_spaces": { "type": "boolean", "default": true },
    "include_recent_comments": { "type": "boolean", "default": false },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 }
  },
  "required": ["username"]
}
```

Upstream:

```text
GET /profile/{username}
GET /profile/{username}/spaces
GET /profile/{username}/comments?page=1&per_page=<limit>
```

Output fields:

```text
profile.user_id
profile.display_name
profile.username
profile.avatar
profile.cover_photo
profile.website
profile.social_links
profile.short_description_text
profile.short_description_html
profile.total_points
profile.last_activity
spaces[] optional
recent_comments[] optional
```

Default redaction includes `email`, `token`, `password`, `nonce`, `secret`, `cookie`, and `authorization` fields.

## Tool: `club_get_my_profile`

Get the authenticated user's own profile. This is separate from `club_get_profile` because upstream may expose private fields for the current user.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "include_private_fields": { "type": "boolean", "default": false },
    "include_spaces": { "type": "boolean", "default": true }
  },
  "required": []
}
```

Behavior:

- If `include_private_fields` is false, redact e-mail and other private fields.
- If true, clients should ask for explicit user consent before calling.

Upstream:

```text
GET /members?search=<current username or ID>
GET /profile/{current_username}
GET /profile/{current_username}/spaces
```

Current username source depends on auth mode and may require one safe profile/member lookup.

## Tool: `club_get_recent_posts`

List visible posts created since a given time.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "since": { "type": "string", "minLength": 1, "maxLength": 40 },
    "space": { "type": "string", "pattern": "^[A-Za-z0-9_-]{1,120}$" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
    "scan_feed_limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 300 }
  },
  "required": ["since"]
}
```

Upstream:

```text
GET /feeds?feed_base_url=feeds&page=N&per_page=100&order_by_type=new_activity&space=<space>
```

Output fields:

```text
posts[].id
posts[].slug
posts[].title
posts[].message_text
posts[].message_html
posts[].created_at
posts[].author.user_id
posts[].author.username
posts[].author.display_name
posts[].space.slug
posts[].space.title
posts[].comments_count
posts[].reactions_count
posts[].permalink
```

## Tool: `club_get_recent_comments`

List visible comments created or edited since a given time.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "since": { "type": "string", "minLength": 1, "maxLength": 40 },
    "include_edits": { "type": "boolean", "default": true },
    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 },
    "scan_feed_limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 300 },
    "comment_per_feed_limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 },
    "concurrency": { "type": "integer", "minimum": 1, "maximum": 8, "default": 4 }
  },
  "required": ["since"]
}
```

Upstream:

```text
GET /feeds?page=N&per_page=100&order_by_type=new_activity
GET /feeds/{feed_id}/comments?page=1&per_page=<comment_per_feed_limit>
```

Algorithm:

1. Fetch visible feeds with pagination up to `scan_feed_limit`.
2. Keep feeds with `comments_count > 0`.
3. Fetch comments with bounded concurrency 4-8.
4. New comments: `created_at >= since`.
5. Edited old comments: `updated_at >= since && created_at < since` if `include_edits`.
6. Return bounded results and scan metadata.

Known limitation: no verified global `comments_since` endpoint exists.

Output fields:

```text
comments[].id
comments[].post_id
comments[].parent_id
comments[].created_at
comments[].updated_at
comments[].author.user_id
comments[].author.username
comments[].author.display_name
comments[].message_text
comments[].message_html
comments[].post.id
comments[].post.title
comments[].post.permalink
comments[].space.slug
comments[].space.title
```

## Tool: `club_get_user_comments`

List comments by a specific user, optionally since a time.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "username": { "type": "string", "pattern": "^[A-Za-z0-9_-]{1,80}$" },
    "since": { "type": "string", "minLength": 1, "maxLength": 40 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 }
  },
  "required": ["username"]
}
```

Upstream:

```text
GET /profile/{username}/comments?page=N&per_page=100
```

If individual comments omit `xprofile`, backfill author metadata from the profile response.

Output fields:

```text
comments[].id
comments[].post_id
comments[].parent_id
comments[].created_at
comments[].updated_at
comments[].author.user_id
comments[].author.username
comments[].author.display_name
comments[].message_text
comments[].message_html
comments[].post.id
comments[].post.title
comments[].post.permalink
pagination.current_page
pagination.has_more
```

## Tool: `club_get_feed`

Fetch one visible post/thread by ID.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "feed_id": { "type": "integer", "minimum": 1 },
    "include_comments": { "type": "boolean", "default": true },
    "comment_limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 }
  },
  "required": ["feed_id"]
}
```

Upstream:

```text
GET /feeds/{feed_id}/by-id
GET /feeds/{feed_id}/comments?page=1&per_page=<comment_limit>
```

`/feeds/{feed_id}/by-id` is live-verified.

Output fields:

```text
feed.id
feed.slug
feed.title
feed.message_text
feed.message_html
feed.created_at
feed.author.user_id
feed.author.username
feed.author.display_name
feed.space.slug
feed.space.title
feed.comments_count
feed.reactions_count
feed.permalink
comments[] optional, same shape as club_get_feed_comments
```

## Tool: `club_get_feed_comments`

Fetch comments for one visible feed.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "feed_id": { "type": "integer", "minimum": 1 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 }
  },
  "required": ["feed_id"]
}
```

Upstream:

```text
GET /feeds/{feed_id}/comments?page=1&per_page=<limit>
```

Output fields:

```text
comments[].id
comments[].post_id
comments[].parent_id
comments[].created_at
comments[].updated_at
comments[].author.user_id
comments[].author.username
comments[].author.display_name
comments[].message_text
comments[].message_html
comments[].reactions_count
comments[].status
```

## Tool: `club_list_spaces`

List visible spaces/pokoje.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "include_members": { "type": "boolean", "default": false },
    "member_limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 }
  },
  "required": []
}
```

Upstream:

```text
GET /spaces/all-spaces
GET /spaces/{spaceSlug}/members?page=1&per_page=<member_limit>
```

Output includes `id`, `title`, `slug`, `description`, `privacy`, `members_count`, and visible permissions.

## Tool: `club_list_courses`

List visible courses.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "include_sections": { "type": "boolean", "default": true }
  },
  "required": []
}
```

Upstream:

```text
GET /courses/all-courses
```

Output fields:

```text
courses[].course.id
courses[].course.title
courses[].course.slug
courses[].course.description_text
courses[].course.description_html
courses[].course.permalink
courses[].sections[].id optional
courses[].sections[].title optional
courses[].sections[].lessons[] optional
courses[].track optional
count
```

## Tool: `club_get_unread_notifications`

Get unread notification count and visible unread notification metadata for the authenticated user.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {},
  "required": []
}
```

Upstream:

```text
GET /notifications/unread
```

Output fields:

```text
unread_count
notifications[].id
notifications[].type
notifications[].created_at
notifications[].message_text
notifications[].permalink optional
notifications[].actor optional
```

## Tool: `club_search_content`

Search visible posts, comments, and members.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 200 },
    "since": { "type": "string", "minLength": 1, "maxLength": 40 },
    "include_posts": { "type": "boolean", "default": true },
    "include_comments": { "type": "boolean", "default": true },
    "include_members": { "type": "boolean", "default": true },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 },
    "scan_feed_limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 300 },
    "concurrency": { "type": "integer", "minimum": 1, "maximum": 8, "default": 4 }
  },
  "required": ["query"]
}
```

Upstream:

```text
GET /members?search=<query>
GET /feeds?search=<query>&search_in[]=post_content&page=N&per_page=100
GET /feeds/{feed_id}/comments ... if comment search is enabled
```

Hard caps:

- max 500 scanned feeds,
- max 2,000 scanned comments,
- max 100 returned combined results.

Output fields:

```text
results[].kind = member | post | comment
results[].score optional
results[].matched_field
results[].member optional, same safe shape as club_search_members
results[].post optional, same safe shape as club_get_recent_posts
results[].comment optional, same safe shape as club_get_recent_comments
counts.members
counts.posts
counts.comments
scan_metadata
```

## Tool: `club_get_since_summary`

Convenience aggregation for “what is new since X”.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "since": { "type": "string", "minLength": 1, "maxLength": 40 },
    "limit_posts": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
    "limit_comments": { "type": "integer", "minimum": 1, "maximum": 200, "default": 100 },
    "include_edits": { "type": "boolean", "default": true }
  },
  "required": ["since"]
}
```

Output fields:

```text
new_posts[] same safe shape as club_get_recent_posts
new_comments[] same safe shape as club_get_recent_comments
edited_comments[] same safe shape as club_get_recent_comments with edit_reason
counts.new_posts
counts.new_comments
counts.edited_comments
scan_metadata.scanned_feeds
scan_metadata.scanned_comments
scan_metadata.since
scan_metadata.generated_at
```

## Forbidden tools/routes in v1

```text
POST /feeds
POST /feeds/{id}/comments
POST/PUT/PATCH/DELETE /feeds/{id}
POST/PUT/PATCH/DELETE /comments/{id}
POST /feeds/{id}/react
POST /spaces/{slug}/join
POST /spaces/{slug}/leave
POST/PUT /profile/{username}
/admin/*
```

No generic REST fetch/proxy tool is allowed.
