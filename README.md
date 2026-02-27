# PHX Data Canal

**Phoenix Metro Job Market Intelligence Dashboard**

Live: [phx-data-canal.netlify.app](https://phx-data-canal.netlify.app)

---

## Executive Summary

PHX Data Canal is a BI-style interactive dashboard built to support job seekers in the Phoenix metro area. The project transforms raw workforce data into a single, filterable view of the local tech job market — giving users the ability to sort, slice, and explore 181 active job postings across three occupation categories.

### The Data

The source dataset was compiled by **Jared, Assistant Director of Human Services & Workforce Development**, and exported from JobsEQ as three Excel workbooks:

| Category | Postings |
|---|---|
| Computer and Information Systems Managers | 88 |
| Software Developers | 62 |
| Network and Computer System Administrators | 31 |

The data spans **March 2025 through February 2026**, covering 9 unique employers across 4 Phoenix metro locations. During ingestion, 24 metadata rows (source attribution and export footers embedded in the Excel files) were identified and cleaned from the dataset.

### What It Does

The dashboard provides a single point of view for viewing and manipulating the job data through two primary interfaces:

**Filter Toolbar** — A dedicated control bar with multi-select dropdown pickers for Employer, Location, and Status; a date range picker for posting dates; a salary range selector; and a global text search. Every filter updates the entire dashboard in real time.

**Data Grid** — A sortable, paginated table (AG Grid) displaying all job records. Every job title links directly to the original posting. Column sorting is available on all fields. The grid responds to all toolbar filters and category selections.

### Data Visualizations

Four interactive panels tell the story of the dataset:

- **Top Employers** — Horizontal bar chart ranking employers by posting volume. Oracle dominates the Phoenix metro tech market with 133 of 181 postings.
- **Posting Freshness** — Donut ring chart breaking down how recently jobs were posted (last 5, 10, 30, 60, and 60+ days), showing market activity velocity at a glance.
- **Top Job Roles & Skills** — Compound phrase extraction (2-4 word n-grams) from job titles, surfacing the actual roles in demand: "Data Center", "Software Developer", "Program Manager", etc. Single-word noise and seniority prefixes are filtered out.
- **Posting Activity** — Timeline bar chart showing posting volume by date with hover tooltips, revealing hiring patterns over time.

### Technical Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Data Grid | AG Grid Community |
| Hosting | Netlify |
| Source Control | GitHub |

### Design Decisions

- **Filter Toolbar over in-grid filters.** Early iterations used AG Grid's built-in column filters, but the UX was poor — tiny dropdowns, text-only search, and inconsistent behavior with custom components. The Filter Toolbar was built as a standalone React layer that pre-filters data before AG Grid sees it, making filtering reliable and discoverable.
- **Compound phrase extraction over word frequency.** The initial keyword widget split titles into single words, producing meaningless results like "data: 83". The final implementation extracts 2-4 word n-grams, deduplicates overlapping phrases, and strips seniority prefixes to surface actual job roles.
- **Data cleaning at the source.** The Excel exports contained footer rows with query metadata. These were removed during JSON conversion rather than filtered at runtime.

### Repository

GitHub: [github.com/krakencode-22/PHX-Data-Canal](https://github.com/krakencode-22/PHX-Data-Canal)

### Quick Start

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173).

---

*Dataset owned by Jared, Assistant Director, Human Services & Workforce Development. Dashboard built during a rapid prototyping session, February 2026.*
