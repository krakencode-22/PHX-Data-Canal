export interface JobRecord {
  id: number
  jobTitle: string
  employer: string
  location: string
  datePosted: string
  status: string
  wage: number | null
  category: string
  occupationName: string
  soc: string
  url: string
}
