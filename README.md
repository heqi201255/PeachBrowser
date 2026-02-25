<div align="center">
  <img src="client/assets/logo.png" alt="PeachBrowser Logo" width="200">
  <h1>PeachBrowser</h1>
  <p>A simple and easy-to-use local media library browser (Eagle alternative)</p>
</div>

---

## Introduction

PeachBrowser is a lightweight local media library management system that supports browsing, managing, and previewing videos and images. Built on Node.js, it provides a responsive web interface for both desktop and mobile access.

## Features

- **User Authentication** - Local JWT authentication with user registration/login
- **Library Management** - Add, remove, and scan media directories
- **Media Browsing** - Pagination, filtering, and search functionality
- **Thumbnail Generation** - Automatic thumbnail generation for videos and images (async queue processing)
- **Video Preview** - Auto-play on hover, drag left/right to adjust progress
- **Tag System** - Add tags to media files, filter by tags
- **Playback History** - Record viewing history
- **Responsive Design** - Desktop and mobile support

## Tech Stack

| Type | Technology |
|------|------------|
| Backend | Node.js + Express |
| Database | sql.js (SQLite) |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Media Processing | FFmpeg |
| Authentication | JWT + bcryptjs |

## Quick Start

### Requirements

- Node.js >= 14
- FFmpeg (for thumbnail generation)

### Installation

```bash
npm install
npm start
```

Visit http://localhost:3000

### Configuration

Edit `config.json` to configure server, database, thumbnail, and scanner settings:

```json
{
  "server": {
    "port": 3000
  },
  "database": {
    "path": "./data/peach.db"
  },
  "thumbnail": {
    "size": 320,
    "quality": 2
  },
  "scanner": {
    "concurrency": 5
  }
}
```

## Changelog

### 2026-02-18

- Initialized project structure
- Completed core features: user authentication, library management, file browsing
- Implemented automatic thumbnail generation
- Implemented video hover preview
- Implemented tag system and playback history
- Responsive design for mobile devices

## License

MIT License