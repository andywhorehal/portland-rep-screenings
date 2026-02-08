const state = {
  data: null,
  venues: [],
  events: [],
  venueMap: new Map(),
  selectedDay: null,
  currentMonth: null,
  view: "calendar",
  filters: {
    search: "",
    venues: new Set(),
    tags: new Set(),
    startDate: "",
    endDate: ""
  }
};

const elements = {
  lastUpdated: document.getElementById("last-updated"),
  dataNote: document.getElementById("data-note"),
  sampleBanner: document.getElementById("sample-banner"),
  venueFilters: document.getElementById("venue-filters"),
  tagFilters: document.getElementById("tag-filters"),
  search: document.getElementById("search"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  viewCalendar: document.getElementById("view-calendar"),
  viewList: document.getElementById("view-list"),
  calendarView: document.getElementById("calendar-view"),
  listView: document.getElementById("list-view"),
  monthLabel: document.getElementById("month-label"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
  calendarGrid: document.getElementById("calendar-grid"),
  dayTitle: document.getElementById("day-title"),
  dayEvents: document.getElementById("day-events"),
  listResults: document.getElementById("list-results"),
  listCount: document.getElementById("list-count")
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

const formatTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit"
});

const formatMonth = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadData() {
  return fetch("data/events.json")
    .then((response) => response.json())
    .then((data) => {
      state.data = data;
      state.venues = data.venues || [];
      state.events = data.events || [];
      state.venueMap = new Map(state.venues.map((venue) => [venue.id, venue]));
      const today = new Date();
      state.selectedDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      state.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      elements.lastUpdated.textContent = `Last updated: ${data.meta?.generatedAt || "unknown"}`;
      elements.dataNote.textContent = data.meta?.notes || "";

      if (state.events.some((event) => event.isSample)) {
        elements.sampleBanner.classList.remove("hidden");
      }

      buildFilters();
      applyFilters();
      bindEvents();
    });
}

function buildFilters() {
  elements.venueFilters.innerHTML = "";
  state.venues.forEach((venue) => {
    const chip = document.createElement("label");
    chip.className = "chip";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = venue.id;
    checkbox.checked = true;
    state.filters.venues.add(venue.id);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.filters.venues.add(venue.id);
      } else {
        state.filters.venues.delete(venue.id);
      }
      applyFilters();
    });

    const text = document.createElement("span");
    text.textContent = venue.name;

    chip.appendChild(checkbox);
    chip.appendChild(text);
    elements.venueFilters.appendChild(chip);
  });

  const tagSet = new Set();
  state.events.forEach((event) => {
    (event.tags || []).forEach((tag) => tagSet.add(tag));
  });

  elements.tagFilters.innerHTML = "";
  [...tagSet].sort().forEach((tag) => {
    const chip = document.createElement("label");
    chip.className = "chip";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tag;
    checkbox.checked = true;
    state.filters.tags.add(tag);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.filters.tags.add(tag);
      } else {
        state.filters.tags.delete(tag);
      }
      applyFilters();
    });

    const text = document.createElement("span");
    text.textContent = tag;

    chip.appendChild(checkbox);
    chip.appendChild(text);
    elements.tagFilters.appendChild(chip);
  });
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  elements.startDate.addEventListener("change", (event) => {
    state.filters.startDate = event.target.value;
    applyFilters();
  });

  elements.endDate.addEventListener("change", (event) => {
    state.filters.endDate = event.target.value;
    applyFilters();
  });

  elements.viewCalendar.addEventListener("click", () => setView("calendar"));
  elements.viewList.addEventListener("click", () => setView("list"));

  elements.prevMonth.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() - 1,
      1
    );
    renderCalendar(state.filteredEvents || []);
  });

  elements.nextMonth.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() + 1,
      1
    );
    renderCalendar(state.filteredEvents || []);
  });
}

function setView(view) {
  state.view = view;
  if (view === "calendar") {
    elements.viewCalendar.classList.add("active");
    elements.viewList.classList.remove("active");
    elements.calendarView.classList.remove("hidden");
    elements.listView.classList.add("hidden");
  } else {
    elements.viewList.classList.add("active");
    elements.viewCalendar.classList.remove("active");
    elements.listView.classList.remove("hidden");
    elements.calendarView.classList.add("hidden");
  }
}

function eventMatches(event) {
  if (!state.filters.venues.has(event.venueId)) {
    return false;
  }

  if (state.filters.tags.size > 0) {
    const tagHit = (event.tags || []).some((tag) => state.filters.tags.has(tag));
    if (!tagHit) {
      return false;
    }
  }

  if (state.filters.search) {
    const venue = state.venueMap.get(event.venueId);
    const searchSpace = [
      event.title,
      venue?.name,
      ...(event.tags || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!searchSpace.includes(state.filters.search)) {
      return false;
    }
  }

  const eventDate = new Date(event.start);
  if (state.filters.startDate) {
    const start = new Date(`${state.filters.startDate}T00:00:00`);
    if (eventDate < start) {
      return false;
    }
  }

  if (state.filters.endDate) {
    const end = new Date(`${state.filters.endDate}T23:59:59`);
    if (eventDate > end) {
      return false;
    }
  }

  return true;
}

function applyFilters() {
  const filtered = state.events.filter(eventMatches).sort((a, b) => {
    return new Date(a.start) - new Date(b.start);
  });
  state.filteredEvents = filtered;

  renderCalendar(filtered);
  renderList(filtered);
}

function renderCalendar(events) {
  elements.monthLabel.textContent = formatMonth.format(state.currentMonth);
  elements.calendarGrid.innerHTML = "";

  weekdayLabels.forEach((label) => {
    const header = document.createElement("div");
    header.className = "weekday";
    header.textContent = label;
    elements.calendarGrid.appendChild(header);
  });

  const firstDay = new Date(
    state.currentMonth.getFullYear(),
    state.currentMonth.getMonth(),
    1
  );
  const lastDay = new Date(
    state.currentMonth.getFullYear(),
    state.currentMonth.getMonth() + 1,
    0
  );

  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - startOffset);

  const dayCells = 42; // 6 weeks
  const eventsByDate = new Map();

  events.forEach((event) => {
    const key = dateKey(new Date(event.start));
    if (!eventsByDate.has(key)) {
      eventsByDate.set(key, []);
    }
    eventsByDate.get(key).push(event);
  });

  for (let i = 0; i < dayCells; i += 1) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + i);
    const key = dateKey(date);
    const isCurrentMonth = date.getMonth() === state.currentMonth.getMonth();

    const cell = document.createElement("div");
    cell.className = `day${isCurrentMonth ? "" : " inactive"}`;
    cell.dataset.date = key;

    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = date.getDate();
    cell.appendChild(number);

    const list = document.createElement("div");
    list.className = "day-events";

    const dayEvents = (eventsByDate.get(key) || []).slice(0, 3);
    dayEvents.forEach((event) => {
      const pill = document.createElement("div");
      pill.className = "event-pill";
      const venue = state.venueMap.get(event.venueId);
      pill.innerHTML = `<strong>${event.title}</strong>${venue?.name || ""}`;
      list.appendChild(pill);
    });

    if ((eventsByDate.get(key) || []).length > 3) {
      const more = document.createElement("div");
      more.className = "event-pill";
      more.textContent = `+${eventsByDate.get(key).length - 3} more`;
      list.appendChild(more);
    }

    cell.appendChild(list);
    cell.addEventListener("click", () => {
      state.selectedDay = date;
      renderDayDetail(eventsByDate.get(key) || [], date);
    });

    elements.calendarGrid.appendChild(cell);
  }

  renderDayDetail(eventsByDate.get(dateKey(state.selectedDay)) || [], state.selectedDay);
}

function renderDayDetail(events, date) {
  elements.dayTitle.textContent = `Selected: ${formatDate.format(date)}`;
  elements.dayEvents.innerHTML = "";

  if (!events.length) {
    elements.dayEvents.textContent = "No screenings for this day with the current filters.";
    return;
  }

  events.forEach((event) => {
    const venue = state.venueMap.get(event.venueId);
    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `
      <h4>${event.title}</h4>
      <p>${formatTime.format(new Date(event.start))} · ${venue?.name || ""}</p>
      <p>${(event.tags || []).map((tag) => `#${tag}`).join(" ")}</p>
      <a href="${event.ticketUrl}" target="_blank" rel="noreferrer">Tickets / Info</a>
    `;
    elements.dayEvents.appendChild(card);
  });
}

function renderList(events) {
  elements.listResults.innerHTML = "";
  elements.listCount.textContent = `${events.length} screening${events.length === 1 ? "" : "s"}`;

  if (!events.length) {
    elements.listResults.textContent = "No screenings found with the current filters.";
    return;
  }

  events.forEach((event) => {
    const venue = state.venueMap.get(event.venueId);
    const item = document.createElement("div");
    item.className = "list-item";

    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = event.title;

    const date = document.createElement("p");
    date.textContent = `${formatDate.format(new Date(event.start))} · ${formatTime.format(
      new Date(event.start)
    )}`;

    const venueText = document.createElement("p");
    venueText.textContent = venue?.name || "";

    const badges = document.createElement("div");
    badges.className = "badges";
    (event.tags || []).forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = tag;
      badges.appendChild(badge);
    });

    content.appendChild(title);
    content.appendChild(date);
    content.appendChild(venueText);
    content.appendChild(badges);

    const linkWrap = document.createElement("div");
    const link = document.createElement("a");
    link.href = event.ticketUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Tickets / Info";
    linkWrap.appendChild(link);

    item.appendChild(content);
    item.appendChild(linkWrap);

    elements.listResults.appendChild(item);
  });
}

loadData();
