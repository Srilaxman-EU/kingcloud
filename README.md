# KingCloud 👑

Personal cloud storage powered by [Storj DCS](https://www.storj.io/) — a static web app with no build step, no frameworks, and no backend server.

## Features

- 🔐 **Login page** with auth guard (redirect to login if not authenticated)
- 📁 **File manager** — list, upload, download, delete, rename files in your Storj bucket
- 🎨 **6 themes** — Light, Dark, Midnight, Forest, Sunset, Rose (persisted in localStorage)
- 🔍 **Search, sort, and view toggle** (grid / list) for file browser
- ⚙️ **Settings page** — appearance, account (username/password), storage credentials, advanced
- 📱 **Mobile responsive** with sidebar navigation

## Default Credentials

| Username | Password |
|----------|------------|
| `admin` | `kingcloud123` |

> Change your username and password in **Settings → Account**.

## Setup

1. **Clone / deploy** this repo to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.).
2. Open `index.html` and log in.
3. Go to **Settings → Storage** and enter your Storj S3-compatible credentials:
   - **Gateway Endpoint** — e.g. `https://gateway.storjshare.io`
   - **Access Key** — your Storj S3 access key
   - **Secret Key** — your Storj S3 secret key
   - **Bucket Name** — the bucket to use
4. Click **Test Connection** to verify, then **Save Credentials**.

> All credentials are stored only in your browser's `localStorage`. No secrets are ever sent to any server other than Storj.

## CORS Configuration (Required)

For the browser to communicate with your Storj bucket you **must** add a CORS rule.  
In your Storj bucket settings (Satellite UI or `uplink` CLI), add:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders":  ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds":  3600
  }
]
```

> For production, replace `"*"` in `AllowedOrigins` with your specific domain (e.g. `"https://yourdomain.com"`).

## File Structure

```
kingcloud/
├── index.html          # Login page (entry point)
├── dashboard.html      # File manager
├── settings.html       # Settings page
├── assets/
│   └── logo.svg        # KingCloud logo
├── css/
│   ├── style.css       # Global styles & all 6 themes
│   ├── login.css       # Login page styles
│   ├── dashboard.css   # Dashboard / file manager styles
│   └── settings.css    # Settings page styles
└── js/
    ├── theme.js        # Theme & appearance manager
    ├── auth.js         # Auth (login, session, credentials)
    ├── storj.js        # Storj S3 client (AWS Sig V4)
    ├── dashboard.js    # File manager logic
    └── settings.js     # Settings page logic
```

## Technology

- Pure HTML / CSS / vanilla JavaScript — no build step, no frameworks
- AWS Signature V4 implemented in pure JS using the Web Crypto API
- All data (credentials, session, preferences) stored in `localStorage`
