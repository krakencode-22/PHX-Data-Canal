import { useState, useMemo, useCallback, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridReadyEvent,
  type ICellRendererParams,
  type GridApi,
  type INumberFilterParams,
  type ITextFilterParams,
  type IDateFilterParams,
} from 'ag-grid-community'
import jobsRaw from './data/jobs.json'
import type { JobRecord } from './types'

ModuleRegistry.registerModules([AllCommunityModule])

const jobs: JobRecord[] = jobsRaw as JobRecord[]

// ── Stat helpers ──
function uniqueCount(arr: JobRecord[], key: keyof JobRecord): number {
  return new Set(arr.map((r) => r[key])).size
}

function avgWage(arr: JobRecord[]): number {
  const withWage = arr.filter((r) => r.wage != null && r.wage > 0)
  if (withWage.length === 0) return 0
  return Math.round(withWage.reduce((s, r) => s + r.wage!, 0) / withWage.length)
}

function formatCurrency(n: number): string {
  return n === 0 ? '—' : '$' + n.toLocaleString()
}

// ── Cell Renderers ──
function StatusRenderer(params: ICellRendererParams) {
  if (!params.value) return null
  return <span className="status-active">{params.value}</span>
}

function WageRenderer(params: ICellRendererParams) {
  const wage = params.value as number | null
  if (wage == null || wage === 0) {
    return <span className="wage-none">Not listed</span>
  }
  const cls = wage >= 120000 ? 'wage-high' : 'wage-mid'
  return <span className={`wage-badge ${cls}`}>${wage.toLocaleString()}</span>
}

function JobTitleRenderer(params: ICellRendererParams<JobRecord>) {
  const url = params.data?.url
  return (
    <a
      href={url}
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

// ── Category Pill ──
function CategoryPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer border
        ${
          active
            ? 'bg-white text-slate-900 border-white shadow-lg shadow-white/10'
            : 'bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/[0.12] hover:text-white'
        }
      `}
    >
      {label}
      <span
        className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
          active ? 'bg-slate-900 text-white' : 'bg-white/10 text-slate-400'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

// ── Main App ──
export default function App() {
  const gridRef = useRef<AgGridReact>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [gridApi, setGridApi] = useState<GridApi | null>(null)
  const [filteredCount, setFilteredCount] = useState(jobs.length)

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobs) {
      map.set(j.category, (map.get(j.category) || 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [])

  const filteredJobs = useMemo(() => {
    if (!activeCategory) return jobs
    return jobs.filter((j) => j.category === activeCategory)
  }, [activeCategory])

  const stats = useMemo(
    () => ({
      total: filteredJobs.length,
      employers: uniqueCount(filteredJobs, 'employer'),
      avgWage: avgWage(filteredJobs),
      withWage: filteredJobs.filter((r) => r.wage != null && r.wage > 0).length,
    }),
    [filteredJobs],
  )

  const columnDefs = useMemo<ColDef<JobRecord>[]>(
    () => [
      {
        headerName: 'Job Title',
        field: 'jobTitle',
        cellRenderer: JobTitleRenderer,
        flex: 2.5,
        minWidth: 280,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset', 'apply'], closeOnApply: true } satisfies ITextFilterParams,
      },
      {
        headerName: 'Employer',
        field: 'employer',
        flex: 1.5,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset', 'apply'], closeOnApply: true } satisfies ITextFilterParams,
      },
      {
        headerName: 'Location',
        field: 'location',
        flex: 1.2,
        minWidth: 150,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset', 'apply'], closeOnApply: true } satisfies ITextFilterParams,
      },
      {
        headerName: 'Posted',
        field: 'datePosted',
        cellRenderer: DateRenderer,
        flex: 1,
        minWidth: 120,
        filter: 'agDateColumnFilter',
        filterParams: {
          buttons: ['reset', 'apply'],
          closeOnApply: true,
          comparator: (filterDate: Date, cellValue: string) => {
            if (!cellValue) return -1
            const cellDate = new Date(cellValue + 'T00:00:00')
            if (cellDate < filterDate) return -1
            if (cellDate > filterDate) return 1
            return 0
          },
        } satisfies IDateFilterParams,
        sort: 'desc',
      },
      {
        headerName: 'Salary',
        field: 'wage',
        cellRenderer: WageRenderer,
        flex: 1,
        minWidth: 120,
        filter: 'agNumberColumnFilter',
        filterParams: {
          buttons: ['reset', 'apply'],
          closeOnApply: true,
        } satisfies INumberFilterParams,
      },
      {
        headerName: 'Status',
        field: 'status',
        cellRenderer: StatusRenderer,
        flex: 0.8,
        minWidth: 100,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Category',
        field: 'category',
        flex: 1.5,
        minWidth: 180,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset', 'apply'], closeOnApply: true } satisfies ITextFilterParams,
        hide: activeCategory !== null,
      },
      {
        headerName: 'SOC',
        field: 'soc',
        flex: 0.8,
        minWidth: 100,
        filter: 'agTextColumnFilter',
        hide: true,
      },
    ],
    [activeCategory],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      floatingFilter: true,
    }),
    [],
  )

  const onGridReady = useCallback((params: GridReadyEvent) => {
    setGridApi(params.api)
    params.api.sizeColumnsToFit()
  }, [])

  const onFilterChanged = useCallback(() => {
    if (gridApi) {
      setFilteredCount(gridApi.getDisplayedRowCount())
    }
  }, [gridApi])

  const handleCategoryClick = (cat: string | null) => {
    setActiveCategory(cat)
    if (gridApi) {
      gridApi.setFilterModel(null)
    }
  }

  const handleExportCsv = () => {
    gridApi?.exportDataAsCsv({
      fileName: `phx-jobs-${new Date().toISOString().slice(0, 10)}.csv`,
    })
  }

  const handleClearFilters = () => {
    gridApi?.setFilterModel(null)
  }

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
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-white/[0.06] border border-white/10 rounded-xl hover:bg-white/[0.12] hover:text-white transition-all cursor-pointer"
            >
              Clear Filters
            </button>
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
          <StatCard icon="📊" label="Total Postings" value={stats.total} sub={`${filteredCount} shown after filters`} />
          <StatCard icon="🏢" label="Unique Employers" value={stats.employers} />
          <StatCard
            icon="💰"
            label="Avg. Listed Salary"
            value={formatCurrency(stats.avgWage)}
            sub={`${stats.withWage} postings with salary`}
          />
          <StatCard icon="📂" label="Job Categories" value={categories.length} sub="from Jared's dataset" />
        </div>

        {/* ── Category Tabs ── */}
        <div className="flex flex-wrap gap-2">
          <CategoryPill label="All Categories" count={jobs.length} active={activeCategory === null} onClick={() => handleCategoryClick(null)} />
          {categories.map(([cat, count]) => (
            <CategoryPill
              key={cat}
              label={cat}
              count={count}
              active={activeCategory === cat}
              onClick={() => handleCategoryClick(cat)}
            />
          ))}
        </div>

        {/* ── Data Grid ── */}
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/20">
          <div className="ag-theme-alpine" style={{ height: 'calc(100vh - 340px)', minHeight: 480, width: '100%' }}>
            <AgGridReact<JobRecord>
              ref={gridRef}
              rowData={filteredJobs}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onGridReady={onGridReady}
              onFilterChanged={onFilterChanged}
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

        {/* ── Footer ── */}
        <div className="text-center text-xs text-slate-500 pt-2 pb-4">
          PHX Data Canal &middot; Dataset owned by Jared, Asst. Director, Human Services &amp; Workforce Development &middot; {jobs.length} records
        </div>
      </main>
    </div>
  )
}
