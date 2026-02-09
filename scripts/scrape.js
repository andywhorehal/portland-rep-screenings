import fs from "fs/promises";
import path from "path";
import { load } from "cheerio";

const OUTPUT_PATH = path.resolve("data/events.json");
const TIMEZONE = "America/Los_Angeles";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const VENUES = [
  {
    id: "hollywood",
    name: "Hollywood Theatre",
    url: "https://hollywoodtheatre.org",
    source: "https://hollywoodtheatre.org/showtimes/",
    parser: parseHollywood
  },
  {
    id: "cinemagic",
    name: "The Cinemagic Theater",
    url: "https://www.thecinemagictheater.com/",
    source: "https://www.thecinemagictheater.com/",
    parser: parseCinemagic
  },
  {
    id: "clinton",
    name: "Clinton Street Theater",
    url: "https://cstpdx.com/",
    source: "https://cstpdx.com/",
    parser: parseClinton
  },
  {
    id: "pamcut",
    name: "PAM CUT @ Portland Art Museum (Whitsell Auditorium)",
    url: "https://portlandartmuseum.org/whitsell/",
    source: "https://portlandartmuseum.org/pam-cut/",
    parser: parsePamCut
  },
  {
    id: "tomorrow",
    name: "Tomorrow Theater",
    url: "https://tomorrowtheater.org/",
    source: "https://tomorrowtheater.org/",
    parser: parseTomorrow
  },
  {
    id: "cinema21",
    name: "Cinema 21",
    url: "https://www.pickcinema.com/theater/portland/cinema-21-theatre/",
    source: "https://www.pickcinema.com/theater/portland/cinema-21-theatre/",
    parser: parseCinema21
  }
];

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function pad2(number) {
  return String(number).padStart(2, "0");
}

function parseMonthDay(text) {
  const match = text
    .toLowerCase()
    .match(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?/i
    );
  if (!match) return null;
  const month = MONTHS[match[1]];
  const day = Number(match[2]);
  return { month, day };
}

function parseTimes(text) {
  const times = [];
  const regex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  let match;
  while ((match = regex.exec(text))) {
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3].toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    times.push({ hour, minute });
  }
  return times;
}

function resolveYear(month, day) {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), month - 1, day);
  const diffDays = (candidate - now) / (1000 * 60 * 60 * 24);
  if (diffDays < -90) {
    return now.getFullYear() + 1;
  }
  return now.getFullYear();
}

function formatOffset(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = pad2(Math.floor(abs / 60));
  const minutes = pad2(abs % 60);
  return `${sign}${hours}:${minutes}`;
}

function buildIsoDate({ year, month, day, hour = 19, minute = 0 }) {
  const local = new Date(year, month - 1, day, hour, minute);
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${formatOffset(local)}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  return response.text();
}

function extractJsonLdEvents($) {
  const events = [];
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const raw = $(el).contents().text();
      const parsed = JSON.parse(raw);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      blocks.forEach((block) => {
        const items = block["@type"] === "Event" ? [block] : block["@graph"] || [];
        items.forEach((item) => {
          if (item["@type"] !== "Event") return;
          if (!item.name || !item.startDate) return;
          events.push({
            title: item.name,
            start: item.startDate,
            url: item.url || item.offers?.url || ""
          });
        });
      });
    } catch (error) {
      // ignore invalid JSON-LD
    }
  });
  return events;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseHollywood(html, venue) {
  const $ = load(html);
  const main = $("main, #main, .site-content").first();
  const lines = main
    .text()
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => line.toLowerCase() === "showtimes");
  const endIndex = lines.findIndex((line) => line.toLowerCase() === "mission");
  const slice = lines.slice(startIndex + 1, endIndex > 0 ? endIndex : undefined);

  const events = [];
  let currentTitle = null;
  slice.forEach((line) => {
    const date = parseMonthDay(line);
    if (date) {
      const times = parseTimes(line);
      if (currentTitle) {
        const year = resolveYear(date.month, date.day);
        if (times.length) {
          times.forEach((time) => {
            events.push({
              title: currentTitle,
              start: buildIsoDate({ year, ...date, ...time }),
              tags: [],
              url: venue.source
            });
          });
        } else {
          events.push({
            title: currentTitle,
            start: buildIsoDate({ year, ...date }),
            tags: ["time-unknown"],
            url: venue.source
          });
        }
      }
      return;
    }
    if (
      line.length > 2 &&
      !/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.test(line) &&
      !/^(buy tickets|more info|tickets|now playing)$/i.test(line)
    ) {
      currentTitle = line;
    }
  });

  return events;
}

function parseCinemagic(html, venue) {
  const $ = load(html);
  const blocks = [];
  $("main h1, main h2, main h3, main h4, main p, main li").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = normalizeText($(el).text());
    if (text) blocks.push({ tag, text });
  });

  const events = [];
  let currentTitle = "";

  blocks.forEach((block) => {
    if (["h1", "h2", "h3"].includes(block.tag) && block.text.length < 80) {
      currentTitle = block.text;
      return;
    }

    const date = parseMonthDay(block.text);
    const times = parseTimes(block.text);
    if (!date || times.length === 0) return;

    const year = resolveYear(date.month, date.day);
    times.forEach((time) => {
      events.push({
        title: currentTitle || "Cinemagic Screening",
        start: buildIsoDate({ year, ...date, ...time }),
        tags: [],
        url: venue.source
      });
    });
  });

  return events;
}

function parseClinton(html, venue) {
  const $ = load(html);
  const events = [];

  const listItems = $(".tribe-events-calendar-list__event, .tribe-events-pro-photo__event");
  listItems.each((_, el) => {
    const title = normalizeText($(el).find(".tribe-events-calendar-list__event-title").text());
    const datetime = $(el).find("time").attr("datetime");
    const url = $(el).find("a").attr("href") || venue.source;
    if (title && datetime) {
      events.push({ title, start: datetime, tags: [], url });
    }
  });

  if (events.length === 0) {
    extractJsonLdEvents($).forEach((event) => {
      events.push({ title: event.title, start: event.start, tags: [], url: event.url || venue.source });
    });
  }

  return events;
}

function parsePamCut(html, venue) {
  const $ = load(html);
  const events = [];

  extractJsonLdEvents($).forEach((event) => {
    events.push({ title: event.title, start: event.start, tags: ["curated"], url: event.url || venue.source });
  });

  if (events.length === 0) {
    $("article").each((_, el) => {
      const title = normalizeText($(el).find("h2, h3").first().text());
      const datetime = $(el).find("time").attr("datetime");
      if (title && datetime) {
        events.push({ title, start: datetime, tags: ["curated"], url: venue.source });
      }
    });
  }

  return events;
}

function parseTomorrow(html, venue) {
  const $ = load(html);
  const events = [];

  extractJsonLdEvents($).forEach((event) => {
    events.push({ title: event.title, start: event.start, tags: [], url: event.url || venue.source });
  });

  return events;
}

function parseCinema21(html, venue) {
  const $ = load(html);
  const events = [];

  $(".showtime, .showtimes, .showtime-list").each((_, el) => {
    const container = $(el).closest(".movie, .movie-card, .film, .showtimes-wrap");
    const title = normalizeText(container.find("h1, h2, h3").first().text());
    const text = normalizeText($(el).text());
    const times = parseTimes(text);
    if (!title || times.length === 0) return;

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();

    times.forEach((time) => {
      events.push({
        title,
        start: buildIsoDate({ year, month, day, ...time }),
        tags: ["today"],
        url: venue.source
      });
    });
  });

  return events;
}

function normalizeEvent(venueId, event) {
  const start = event.start.includes("T") ? event.start : new Date(event.start).toISOString();
  const parsedStart = new Date(start);

  const title = event.title || "Screening";
  const id = `${venueId}-${slugify(title)}-${parsedStart.getTime()}`;

  return {
    id,
    title,
    start,
    end: null,
    venueId,
    tags: event.tags || [],
    ticketUrl: event.url || "",
    source: "scrape",
    isSample: false
  };
}

function summarize(events) {
  const counts = events.reduce((acc, event) => {
    acc[event.venueId] = (acc[event.venueId] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([venueId, count]) => `${venueId}:${count}`)
    .join(", ");
}

async function run() {
  const warnings = [];
  const allEvents = [];

  for (const venue of VENUES) {
    try {
      const html = await fetchHtml(venue.source);
      const rawEvents = venue.parser(html, venue) || [];
      rawEvents.forEach((event) => allEvents.push(normalizeEvent(venue.id, event)));
    } catch (error) {
      warnings.push(`${venue.id}: ${error.message}`);
    }
  }

  const today = new Date();
  const generatedAt = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const payload = {
    meta: {
      generatedAt,
      timezone: TIMEZONE,
      notes: "Scraped data. Some venues may require manual cleanup.",
      warnings,
      summary: summarize(allEvents)
    },
    venues: VENUES.map(({ id, name, url }) => ({ id, name, url, location: "Portland, OR" })),
    events: allEvents
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  console.log(`Wrote ${allEvents.length} events to ${OUTPUT_PATH}`);
  if (warnings.length) {
    console.log("Warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
