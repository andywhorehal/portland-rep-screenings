# Portland Repertory Screenings Calendar

A beginner-friendly static web app that aggregates repertory and curated film screenings in Portland, OR.

## Local dev

1. Install dependencies:

```bash
npm install
```

2. Run the scraper:

```bash
npm run scrape
```

3. Serve locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Automated updates

This repo includes a GitHub Actions workflow that runs the scraper daily and deploys the site to GitHub Pages.

## Sources

- Hollywood Theatre
- The Cinemagic Theater
- Clinton Street Theater
- PAM CUT @ Portland Art Museum (Whitsell Auditorium)
- Tomorrow Theater
- Cinema 21
