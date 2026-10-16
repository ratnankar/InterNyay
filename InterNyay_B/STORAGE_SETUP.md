# File storage setup

InterNyay keeps **all data in MySQL**. Every uploaded PDF or document is **not** stored in the database:
the file goes to file storage and MySQL keeps only its details and a random storage key.

| Files | Folder in storage | Key column in MySQL |
|---|---|---|
| Case, client and advocate documents, hearing orders | `documents/` | `documents.storage_key` |
| Notification PDFs | `notifications/` | `notifications.storage_key` |
| District PDFs (Quick Access) | `district-pdfs/` | `district_pdfs.pdf_storage_key` |
| Legal forms | `legal-forms/` | `legal_forms.storage_key` |
| Court calendars | `court-calendars/` | `court_calendars.storage_key` |

Profile photos and payment QR images are small (limited to about 1.5 MB, checked on upload) and are sent
to the browser inside the normal JSON, so they stay in MySQL as image text (`users`, `clients`, `judge_profiles`,
`qr_codes`). Nothing else is stored as a file inside MySQL.

Files are never public. Every download goes through the backend, which checks the logged-in user first.

## Option 1: local disk (default, good for development)

Nothing to set up. Files are written to `./data/uploads` (change it with `STORAGE_LOCAL_DIR`).

Use this in production only when the server has a **persistent disk** and you run a single backend instance.
Back up the folder together with the database. On hosts with a temporary disk (Heroku, Render free tier,
most container platforms) files would be lost on every restart: use S3 there.

## Option 2: S3 compatible bucket (recommended for launch)

Works with AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, MinIO.

1. Create a **private** bucket (block all public access). No CORS setup is needed, the browser never talks to the bucket.
2. Create an access key limited to that bucket (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`).
3. Set these in `.env` (or the server's environment):

```
STORAGE_TYPE=s3
S3_BUCKET=your-bucket-name
S3_REGION=ap-south-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
# Only for non-AWS providers:
# S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
# S3_PATH_STYLE=true        (MinIO)
```

On AWS you can leave the two keys empty and give the server an IAM role instead.

## Moving from local disk to S3 later

Copy the contents of `data/uploads` into the bucket keeping the same paths (for example
`aws s3 sync ./data/uploads s3://your-bucket-name`), then switch `STORAGE_TYPE` to `s3`.
The keys in the database stay valid because they are the same paths.

## Good to know

- Deleting a document, case, client or account removes the database rows first and the files after the
  transaction commits, so a failed delete never leaves a row pointing at a missing file.
- Backups: always back up MySQL and the file storage together.
