import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridReadyEvent,
  type ICellRendererParams,
  type GridApi,
} from 'ag-grid-community'
import jobsRaw from './data/jobs.json'
import type { JobRecord } from './types'

ModuleRegistry.registerModules([AllCommunityModule])

const jobs: JobRecord[] = jobsRaw as JobRecord[]

// ── Helpers ──
function uniqueCount(arr: JobRecord[], key: keyof JobRecord): number {
  return new Set(arr.map((r) => r[key])).size
}

function avgWage(arr: JobRecord[]): number {
  const withWage = arr.filter((r) => r.wage != null && r.wage > 0)
  if (withWage.length === 0) return 0
  return Math.round(withWage.reduce((s, r) => s + r.wage!, 0) / withWage.length)
}

function formatCurrency(n: number): string {
  return n === 0 ? '\u2014' : '$' + n.toLocaleString()
}

function getUniqueValues(data: JobRecord[], field: keyof JobRecord): string[] {
  const set = new Set<string>()
  for (const r of data) {
    const val = r[field]
    if (val != null && String(val).trim() !== '') set.add(String(val).trim())
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

// ── Cell Renderers ──
function StatusRenderer(params: ICellRendererParams) {
  if (!params.value) return null
  return <span className="status-active">{params.value}</span>
}

function WageRenderer(params: ICellRendererParams) {
  const wage = params.value as number | null
  if (wage == null || wage === 0) return <span className="wage-none">Not listed</span>
  const cls = wage >= 120000 ? 'wage-high' : 'wage-mid'
  return <span className={`wage-badge ${cls}`}>${wage.toLocaleString()}</span>
}

function JobTitleRenderer(params: ICellRendererParams<JobRecord>) {
  return (
    <a
      href={params.data?.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 hover:text-blue-900 hover:underline font-medium transition-colors"
      title="View posting"
    >
      {params.value}
    </a>
  )
}

function DateRenderer(params: ICellRendererParams) {
  if (!params.value) return null
  const d = new Date(params.value + 'T00:00:00')
  return (
    <span className="text-slate-600 tabular-nums">
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  )
}

// ── Stat Card ──
function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/[0.1] transition-colors">
      <div className="text-3xl mt-0.5">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <div className="text-sm text-slate-300 font-medium mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  )
}

// ── Viz: Top Employers Bar Chart ──
function TopEmployersChart({ data }: { data: JobRecord[] }) {
  const topEmployers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const j of data) counts.set(j.employer, (counts.get(j.employer) || 0) + 1)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [data])

  const max = topEmployers.length > 0 ? topEmployers[0][1] : 1

  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Top Employers</h3>
      <div className="space-y-2">
        {topEmployers.map(([name, count]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="text-[12px] text-slate-300 w-32 truncate shrink-0 text-right" title={name}>{name}</span>
            <div className="flex-1 h-5 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-[12px] text-slate-400 font-semibold tabular-nums w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Viz: Top Job Phrases ──
function TopKeywords({ data }: { data: JobRecord[] }) {
  const keywords = useMemo(() => {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'are',
      'not', 'but', 'have', 'has', 'been', 'its', 'also', 'into', 'over',
      'upon', 'senior', 'principal', 'lead', 'staff', 'junior', 'associate',
      'level', 'iii', 'remote',
    ])

    // Clean title into meaningful words
    const cleanTitle = (title: string) =>
      title
        .replace(/[-–/,()]/g, ' ')
        .replace(/[^a-zA-Z\s]/g, '')
        .split(/\s+/)
        .map((w) => w.toLowerCase())
        .filter((w) => w.length > 1 && !stopWords.has(w))

    // Extract all n-grams (2, 3, 4 word phrases) from each title
    const phraseCounts = new Map<string, number>()
    for (const j of data) {
      const words = cleanTitle(j.jobTitle)
      const seen = new Set<string>()
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i <= words.length - n; i++) {
          const phrase = words.slice(i, i + n).join(' ')
          if (!seen.has(phrase)) {
            phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1)
            seen.add(phrase)
          }
        }
      }
    }

    // Filter: must appear in at least 2 job titles
    const candidates = Array.from(phraseCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])

    // De-duplicate: if "data center engineer" covers "data center", keep the longer one
    const selected: [string, number][] = []
    const covered = new Set<string>()
    for (const [phrase, count] of candidates) {
      // Skip if this phrase is a substring of an already-selected higher-count phrase
      let dominated = false
      for (const existing of covered) {
        if (existing.includes(phrase) || phrase.includes(existing)) {
          // Keep the one with higher count (already selected), skip this one
          // unless this is longer and has same count
          const existingCount = selected.find(([p]) => p === existing)?.[1] ?? 0
          if (existing.includes(phrase)) {
            dominated = true
            break
          }
          if (phrase.includes(existing) && count >= existingCount) {
            // This longer phrase is at least as common — skip it anyway,
            // the shorter one already covers the concept
            dominated = true
            break
          }
        }
      }
      if (!dominated) {
        selected.push([phrase, count])
        covered.add(phrase)
      }
      if (selected.length >= 15) break
    }

    // Title-case the phrases
    return selected.map(([phrase, count]) => [
      phrase.replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    ] as [string, number])
  }, [data])

  const max = keywords.length > 0 ? keywords[0][1] : 1

  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Top Job Roles &amp; Skills</h3>
      <div className="flex flex-wrap gap-2">
        {keywords.map(([word, count]) => {
          const intensity = Math.max(0.15, count / max)
          const size = 11 + Math.round((count / max) * 7)
          return (
            <span
              key={word}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all hover:scale-105 cursor-default"
              style={{
                fontSize: `${size}px`,
                background: `rgba(59, 130, 246, ${intensity * 0.2})`,
                borderColor: `rgba(59, 130, 246, ${intensity * 0.3})`,
                color: `rgba(147, 197, 253, ${0.5 + intensity * 0.5})`,
              }}
              title={`"${word}" found in ${count} job postings`}
            >
              <span className="font-semibold">{word}</span>
              <span className="text-[10px] opacity-60 tabular-nums">{count}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Viz: Postings Timeline ──
function PostingsTimeline({ data }: { data: JobRecord[] }) {
  const timeline = useMemo(() => {
    const counts = new Map<string, number>()
    for (const j of data) {
      if (j.datePosted) counts.set(j.datePosted, (counts.get(j.datePosted) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const max = Math.max(...timeline.map(([, c]) => c), 1)

  const formatLabel = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Posting Activity
        <span className="ml-2 text-slate-500 font-normal normal-case">by date</span>
      </h3>
      <div className="flex items-end gap-[3px] h-28">
        {timeline.map(([date, count]) => (
          <div key={date} className="flex-1 flex flex-col items-center group relative">
            <div
              className="w-full bg-gradient-to-t from-orange-500 to-amber-400 rounded-t-sm transition-all duration-300 hover:from-orange-400 hover:to-amber-300 cursor-default"
              style={{ height: `${(count / max) * 100}%`, minHeight: 3 }}
              title={`${formatLabel(date)}: ${count} posting${count > 1 ? 's' : ''}`}
            />
            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10">
              <div className="bg-slate-800 text-white text-[10px] font-semibold px-2 py-1 rounded-md shadow-lg whitespace-nowrap border border-slate-700">
                {formatLabel(date)}: {count}
              </div>
              <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 -mt-[3px] border-r border-b border-slate-700" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-slate-500">{timeline.length > 0 ? formatLabel(timeline[0][0]) : ''}</span>
        <span className="text-[10px] text-slate-500">{timeline.length > 0 ? formatLabel(timeline[timeline.length - 1][0]) : ''}</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">
        <span className="font-semibold text-slate-300">{timeline.length}</span> unique posting dates
        {timeline.length > 0 && (
          <>
            {' '}&middot; Peak: <span className="font-semibold text-orange-400">{max}</span> on {formatLabel(timeline.find(([, c]) => c === max)![0])}
          </>
        )}
      </div>
    </div>
  )
}

// ── Viz: Category Breakdown (Ring) ──
function CategoryBreakdown({ data }: { data: JobRecord[] }) {
  const segments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const j of data) counts.set(j.category, (counts.get(j.category) || 0) + 1)
    const colors = [
      { bg: 'bg-blue-500', ring: '#3b82f6', text: 'text-blue-400' },
      { bg: 'bg-violet-500', ring: '#8b5cf6', text: 'text-violet-400' },
      { bg: 'bg-emerald-500', ring: '#10b981', text: 'text-emerald-400' },
      { bg: 'bg-amber-500', ring: '#f59e0b', text: 'text-amber-400' },
    ]
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({
        name,
        count,
        pct: data.length > 0 ? Math.round((count / data.length) * 100) : 0,
        color: colors[i % colors.length],
      }))
  }, [data])

  // Build SVG donut
  const total = data.length || 1
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Category Breakdown</h3>
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative shrink-0">
          <svg width="130" height="130" viewBox="0 0 130 130">
            {segments.map((seg) => {
              const segLen = (seg.count / total) * circumference
              const dashArray = `${segLen} ${circumference - segLen}`
              const currentOffset = offset
              offset += segLen
              return (
                <circle
                  key={seg.name}
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke={seg.color.ring}
                  strokeWidth="14"
                  strokeDasharray={dashArray}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                  style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{data.length}</span>
            <span className="text-[10px] text-slate-400">jobs</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {segments.map((seg) => (
            <div key={seg.name} className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-sm ${seg.color.bg} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-slate-200 font-medium truncate" title={seg.name}>{seg.name}</div>
                <div className="text-[11px] text-slate-500">{seg.count} postings</div>
              </div>
              <span className={`text-sm font-bold tabular-nums ${seg.color.text}`}>{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Viz: Posting Freshness (Ring) ──
function PostingFreshness({ data }: { data: JobRecord[] }) {
  const today = new Date('2026-02-27T00:00:00')

  const buckets = useMemo(() => {
    const ranges = [
      { label: 'Last 5 days', maxDays: 5, ring: '#22c55e', bg: 'bg-green-500', text: 'text-green-400' },
      { label: '6–10 days', maxDays: 10, ring: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-400' },
      { label: '11–30 days', maxDays: 30, ring: '#a855f7', bg: 'bg-violet-500', text: 'text-violet-400' },
      { label: '31–60 days', maxDays: 60, ring: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-400' },
      { label: '60+ days', maxDays: Infinity, ring: '#64748b', bg: 'bg-slate-500', text: 'text-slate-400' },
    ]

    let remaining = [...data]
    return ranges.map((r) => {
      const cutoff = new Date(today)
      if (r.maxDays !== Infinity) {
        cutoff.setDate(cutoff.getDate() - r.maxDays)
      }
      const prevCutoff = new Date(today)
      const prevMax = ranges[ranges.indexOf(r) - 1]?.maxDays ?? 0
      prevCutoff.setDate(prevCutoff.getDate() - prevMax)

      let count: number
      if (r.maxDays === Infinity) {
        count = remaining.length
        remaining = []
      } else {
        const cutoffStr = cutoff.toISOString().slice(0, 10)
        const prevStr = prevMax > 0 ? new Date(today.getTime() - prevMax * 86400000).toISOString().slice(0, 10) : ''
        const matching = remaining.filter((j) => {
          if (prevMax === 0) return j.datePosted >= cutoffStr
          return j.datePosted >= cutoffStr && j.datePosted < prevStr
        })
        count = matching.length
        remaining = remaining.filter((j) => !matching.includes(j))
      }

      return { ...r, count }
    })
  }, [data])

  const total = data.length || 1
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Posting Freshness</h3>
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative shrink-0">
          <svg width="130" height="130" viewBox="0 0 130 130">
            {buckets.map((seg) => {
              const segLen = (seg.count / total) * circumference
              const dashArray = `${segLen} ${circumference - segLen}`
              const currentOffset = offset
              offset += segLen
              return (
                <circle
                  key={seg.label}
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke={seg.ring}
                  strokeWidth="14"
                  strokeDasharray={dashArray}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                  style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{buckets[0].count + buckets[1].count}</span>
            <span className="text-[9px] text-slate-400 leading-tight text-center">within<br/>10 days</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-2">
          {buckets.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-sm ${seg.bg} shrink-0`} />
              <span className="text-[12px] text-slate-300 flex-1">{seg.label}</span>
              <span className={`text-sm font-bold tabular-nums ${seg.text}`}>{seg.count}</span>
              <span className="text-[10px] text-slate-500 w-8 text-right tabular-nums">
                {data.length > 0 ? Math.round((seg.count / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Multi-Select Dropdown Filter ──
function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  label: string
  options: { value: string; count: number }[]
  selected: Set<string>
  onToggle: (val: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.value.toLowerCase().includes(q))
  }, [options, search])

  const isAllSelected = selected.size === options.length
  const activeCount = options.length - selected.size

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border
          ${
            activeCount > 0
              ? 'bg-blue-500/20 text-blue-300 border-blue-400/30 shadow-sm shadow-blue-500/10'
              : 'bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/[0.1] hover:text-white'
          }
        `}
      >
        <span>{label}</span>
        {activeCount > 0 && (
          <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {activeCount}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden" style={{ width: 300 }}>
          {/* Search */}
          <div className="p-2.5 border-b border-slate-100">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50/80 placeholder:text-slate-400"
                autoFocus
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/80 border-b border-slate-100">
            <button onClick={onSelectAll} className="text-[11px] font-semibold cursor-pointer text-blue-600 hover:text-blue-800">
              Select All
            </button>
            <span className="text-[11px] text-slate-400 font-medium tabular-nums">
              {selected.size} of {options.length}
            </span>
            <button onClick={onClearAll} className="text-[11px] font-semibold cursor-pointer text-slate-500 hover:text-red-600">
              Clear
            </button>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin' }}>
            {filtered.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4 italic">No matches</div>
            ) : (
              filtered.map((opt) => {
                const checked = selected.has(opt.value)
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 mx-1.5 px-2 py-[5px] rounded-md cursor-pointer transition-colors group ${
                      checked ? 'hover:bg-blue-50' : 'opacity-50 hover:opacity-100 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt.value)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600 shrink-0"
                    />
                    <span className="text-[13px] text-slate-700 group-hover:text-slate-900 truncate flex-1">{opt.value}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0 font-medium">{opt.count}</span>
                  </label>
                )
              })
            )}
          </div>

          {/* Active indicator */}
          {activeCount > 0 && (
            <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
              <span className="text-[11px] text-blue-700 font-semibold">
                Excluding {activeCount} value{activeCount > 1 ? 's' : ''}
              </span>
              <button onClick={() => { onSelectAll(); setOpen(false); setSearch('') }} className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer">
                Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Category Pill ──
function CategoryPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
        active
          ? 'bg-white text-slate-900 border-white shadow-lg shadow-white/10'
          : 'bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/[0.12] hover:text-white'
      }`}
    >
      {label}
      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${active ? 'bg-slate-900 text-white' : 'bg-white/10 text-slate-400'}`}>
        {count}
      </span>
    </button>
  )
}

// ── Main App ──
export default function App() {
  const gridRef = useRef<AgGridReact>(null)
  const [gridApi, setGridApi] = useState<GridApi | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Multi-select filter state
  const allEmployers = useMemo(() => getUniqueValues(jobs, 'employer'), [])
  const allLocations = useMemo(() => getUniqueValues(jobs, 'location'), [])
  const allStatuses = useMemo(() => getUniqueValues(jobs, 'status'), [])

  const [selectedEmployers, setSelectedEmployers] = useState<Set<string>>(() => new Set(allEmployers))
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => new Set(allLocations))
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => new Set(allStatuses))
  const [wageFilter, setWageFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [searchText, setSearchText] = useState('')

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobs) map.set(j.category, (map.get(j.category) || 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [])

  // Apply all filters to produce the final dataset
  const filteredJobs = useMemo(() => {
    let data = jobs

    if (activeCategory) {
      data = data.filter((j) => j.category === activeCategory)
    }
    if (selectedEmployers.size < allEmployers.length) {
      data = data.filter((j) => selectedEmployers.has(j.employer))
    }
    if (selectedLocations.size < allLocations.length) {
      data = data.filter((j) => selectedLocations.has(j.location))
    }
    if (selectedStatuses.size < allStatuses.length) {
      data = data.filter((j) => selectedStatuses.has(j.status))
    }
    if (wageFilter !== 'all') {
      switch (wageFilter) {
        case 'listed':
          data = data.filter((j) => j.wage != null && j.wage > 0)
          break
        case 'unlisted':
          data = data.filter((j) => j.wage == null || j.wage === 0)
          break
        case '150k+':
          data = data.filter((j) => j.wage != null && j.wage >= 150000)
          break
        case '100k-150k':
          data = data.filter((j) => j.wage != null && j.wage >= 100000 && j.wage < 150000)
          break
        case '50k-100k':
          data = data.filter((j) => j.wage != null && j.wage >= 50000 && j.wage < 100000)
          break
        case 'under50k':
          data = data.filter((j) => j.wage != null && j.wage > 0 && j.wage < 50000)
          break
      }
    }
    if (dateFrom) {
      data = data.filter((j) => j.datePosted >= dateFrom)
    }
    if (dateTo) {
      data = data.filter((j) => j.datePosted <= dateTo)
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      data = data.filter(
        (j) =>
          j.jobTitle.toLowerCase().includes(q) ||
          j.employer.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q),
      )
    }

    return data
  }, [activeCategory, selectedEmployers, selectedLocations, selectedStatuses, wageFilter, dateFrom, dateTo, searchText, allEmployers.length, allLocations.length, allStatuses.length])

  const stats = useMemo(
    () => ({
      total: filteredJobs.length,
      employers: uniqueCount(filteredJobs, 'employer'),
      avgWage: avgWage(filteredJobs),
      withWage: filteredJobs.filter((r) => r.wage != null && r.wage > 0).length,
    }),
    [filteredJobs],
  )

  // Employer options with counts (based on current category filter)
  const employerOptions = useMemo(() => {
    const base = activeCategory ? jobs.filter((j) => j.category === activeCategory) : jobs
    const counts = new Map<string, number>()
    for (const j of base) counts.set(j.employer, (counts.get(j.employer) || 0) + 1)
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [activeCategory])

  const locationOptions = useMemo(() => {
    const base = activeCategory ? jobs.filter((j) => j.category === activeCategory) : jobs
    const counts = new Map<string, number>()
    for (const j of base) counts.set(j.location, (counts.get(j.location) || 0) + 1)
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [activeCategory])

  const toggleEmployer = useCallback((val: string) => {
    setSelectedEmployers((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }, [])

  const toggleLocation = useCallback((val: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }, [])

  const toggleStatus = useCallback((val: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }, [])

  const statusOptions = useMemo(() => {
    const base = activeCategory ? jobs.filter((j) => j.category === activeCategory) : jobs
    const counts = new Map<string, number>()
    for (const j of base) counts.set(j.status, (counts.get(j.status) || 0) + 1)
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [activeCategory])

  const columnDefs = useMemo<ColDef<JobRecord>[]>(
    () => [
      {
        headerName: 'Job Title',
        field: 'jobTitle',
        cellRenderer: JobTitleRenderer,
        flex: 2.5,
        minWidth: 280,
      },
      {
        headerName: 'Employer',
        field: 'employer',
        flex: 1.5,
        minWidth: 160,
      },
      {
        headerName: 'Location',
        field: 'location',
        flex: 1.2,
        minWidth: 150,
      },
      {
        headerName: 'Posted',
        field: 'datePosted',
        cellRenderer: DateRenderer,
        flex: 1,
        minWidth: 120,
        sort: 'desc',
      },
      {
        headerName: 'Salary',
        field: 'wage',
        cellRenderer: WageRenderer,
        flex: 1,
        minWidth: 120,
      },
      {
        headerName: 'Status',
        field: 'status',
        cellRenderer: StatusRenderer,
        flex: 0.8,
        minWidth: 100,
      },
      {
        headerName: 'Category',
        field: 'category',
        flex: 1.5,
        minWidth: 180,
        hide: activeCategory !== null,
      },
    ],
    [activeCategory],
  )

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true }), [])

  const onGridReady = useCallback((params: GridReadyEvent) => {
    setGridApi(params.api)
    params.api.sizeColumnsToFit()
  }, [])

  const handleCategoryClick = (cat: string | null) => {
    setActiveCategory(cat)
    gridApi?.setFilterModel(null)
  }

  const handleExportCsv = () => {
    gridApi?.exportDataAsCsv({ fileName: `phx-jobs-${new Date().toISOString().slice(0, 10)}.csv` })
  }

  const handleResetAll = () => {
    setActiveCategory(null)
    setSelectedEmployers(new Set(allEmployers))
    setSelectedLocations(new Set(allLocations))
    setSelectedStatuses(new Set(allStatuses))
    setWageFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchText('')
  }

  const hasActiveFilters =
    activeCategory !== null ||
    selectedEmployers.size < allEmployers.length ||
    selectedLocations.size < allLocations.length ||
    selectedStatuses.size < allStatuses.length ||
    wageFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    searchText.trim() !== ''

  return (
    <div className="min-h-screen pb-8">
      {/* ── Header ── */}
      <header className="border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-500/20">
              P
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">PHX Data Canal</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Phoenix Metro Job Market Intelligence &middot; Compiled by Jared, Asst. Director of Human Services &amp; Workforce Development
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={handleResetAll}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-white/[0.06] border border-white/10 rounded-xl hover:bg-white/[0.12] hover:text-white transition-all cursor-pointer"
              >
                Reset All
              </button>
            )}
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 mt-6 space-y-6">
        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="📊" label="Total Postings" value={stats.total} sub={`of ${jobs.length} total records`} />
          <StatCard icon="🏢" label="Unique Employers" value={stats.employers} />
          <StatCard icon="💰" label="Avg. Listed Salary" value={formatCurrency(stats.avgWage)} sub={`${stats.withWage} postings with salary`} />
          <StatCard icon="📂" label="Job Categories" value={categories.length} sub="from Jared's dataset" />
        </div>

        {/* ── Data Visualizations ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopEmployersChart data={filteredJobs} />
          <PostingFreshness data={filteredJobs} />
        </div>

        {/* ── Category Tabs ── */}
        <div className="flex flex-wrap gap-2">
          <CategoryPill label="All Categories" count={jobs.length} active={activeCategory === null} onClick={() => handleCategoryClick(null)} />
          {categories.map(([cat, count]) => (
            <CategoryPill key={cat} label={cat} count={count} active={activeCategory === cat} onClick={() => handleCategoryClick(cat)} />
          ))}
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Filters</span>

          {/* Global search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search jobs, companies..."
              className="pl-8 pr-3 py-2 w-56 text-sm rounded-xl bg-white/[0.08] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 transition-all"
            />
          </div>

          {/* Employer dropdown */}
          <MultiSelectFilter
            label="Employer"
            options={employerOptions}
            selected={selectedEmployers}
            onToggle={toggleEmployer}
            onSelectAll={() => setSelectedEmployers(new Set(allEmployers))}
            onClearAll={() => setSelectedEmployers(new Set())}
          />

          {/* Location dropdown */}
          <MultiSelectFilter
            label="Location"
            options={locationOptions}
            selected={selectedLocations}
            onToggle={toggleLocation}
            onSelectAll={() => setSelectedLocations(new Set(allLocations))}
            onClearAll={() => setSelectedLocations(new Set())}
          />

          {/* Status dropdown */}
          <MultiSelectFilter
            label="Status"
            options={statusOptions}
            selected={selectedStatuses}
            onToggle={toggleStatus}
            onSelectAll={() => setSelectedStatuses(new Set(allStatuses))}
            onClearAll={() => setSelectedStatuses(new Set())}
          />

          {/* Posted date range */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
            dateFrom || dateTo
              ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
              : 'bg-white/[0.06] text-slate-300 border-white/10'
          }`}>
            <span className="text-xs text-slate-400 mr-1">Posted</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-200 focus:outline-none cursor-pointer w-[120px] [color-scheme:dark]"
              title="From date"
            />
            <span className="text-slate-500">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-200 focus:outline-none cursor-pointer w-[120px] [color-scheme:dark]"
              title="To date"
            />
          </div>

          {/* Wage range dropdown */}
          <div className="relative">
            <select
              value={wageFilter}
              onChange={(e) => setWageFilter(e.target.value)}
              className={`
                appearance-none px-3 py-2 pr-8 rounded-xl text-sm font-medium transition-all cursor-pointer border
                ${
                  wageFilter !== 'all'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                    : 'bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/[0.1]'
                }
              `}
            >
              <option value="all">Salary Range</option>
              <option value="listed">Has Salary</option>
              <option value="unlisted">No Salary Listed</option>
              <option value="150k+">$150k+</option>
              <option value="100k-150k">$100k – $150k</option>
              <option value="50k-100k">$50k – $100k</option>
              <option value="under50k">Under $50k</option>
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div className="flex-1" />
          <span className="text-xs text-slate-500 tabular-nums">
            {filteredJobs.length} of {jobs.length} records
          </span>
        </div>

        {/* ── Data Grid ── */}
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/20">
          <div className="ag-theme-alpine" style={{ height: 'calc(100vh - 420px)', minHeight: 480, width: '100%' }}>
            <AgGridReact<JobRecord>
              ref={gridRef}
              rowData={filteredJobs}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onGridReady={onGridReady}
              animateRows={true}
              pagination={true}
              paginationPageSize={50}
              paginationPageSizeSelector={[25, 50, 100, 200]}
              rowSelection="multiple"
              suppressRowClickSelection={true}
              enableCellTextSelection={true}
              getRowId={(params) => String(params.data.id)}
            />
          </div>
        </div>

        {/* ── Bottom Visualizations ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopKeywords data={filteredJobs} />
          <PostingsTimeline data={filteredJobs} />
        </div>

        {/* ── Footer ── */}
        <div className="text-center text-xs text-slate-500 pt-2 pb-4">
          PHX Data Canal &middot; Dataset owned by Jared, Asst. Director, Human Services &amp; Workforce Development &middot; {jobs.length} records
        </div>
      </main>
    </div>
  )
}
