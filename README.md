# Arin X

Build ArinX: an open-source, full-featured recreation of YouTube's core product workflows as a modern, responsive web application.

Key capabilities to implement:
1. Navigation & Browsing:
- Home feed with category pills, personalized recommendations, trending, and subscriptions feed
- Search bar with autocomplete suggestions, query handling, and result filtering (by type, upload date, duration)
- Shorts-style vertical video experience with vertical scroll/snap, like, comment, and sound controls
- Channel pages with banner, avatar, tabs (Home, Videos, Shorts, Playlists, Community, About), and Subscribe functionality
- User Library and History: Watch history, Liked videos, Watch Later, and custom playlists

2. Video Playback & Watch Experience:
- Full-featured custom video player with play/pause, scrub bar, volume, playback speed, theater mode, full-screen, and picture-in-picture
- Video details section: title, view count, timestamp, like/dislike buttons, share, save to playlist, channel card with subscriber count
- Expandable description box with timestamps and tags
- Comment section with threaded replies, sorting (top vs newest), and comment creation
- Up next / Related videos recommendation sidebar

3. Creator Studio & Upload Flow:
- Video upload workflow: file upload, title, description, thumbnail upload/selection, category, visibility (public, unlisted, private)
- Channel customization: profile picture, banner, channel name, handle, and bio
- Creator dashboard with video management (edit metadata, delete, change visibility) and channel analytics (views, watch time, subscribers)

4. Design & Polish:
- High-fidelity YouTube-inspired dark and light theme interface
- Collapsible sidebar navigation (Home, Shorts, Subscriptions, Library, History, Your videos, Watch later, Liked videos)
- Realistic seed data with high-quality video streams, channels, comments, and diverse categories to ensure the platform feels alive immediately

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://arin-x.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9a8aec90-fd30-4c40-bb8e-25cd7ec9e85c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
