import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

interface Member {
  id: string
  name: string
}

export interface Filters {
  search: string
  priority: string
  category: string
  tag: string
  assigneeId: string
}

interface TaskFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
  members: Member[]
  allTags: string[]
  allCategories: string[]
}

export default function TaskFilters({ filters, onChange, members, allTags, allCategories }: TaskFiltersProps) {
  const update = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  const hasActiveFilters = filters.search || filters.priority || filters.category || filters.tag || filters.assigneeId

  const clearAll = () => onChange({ search: '', priority: '', category: '', tag: '', assigneeId: '' })

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-muted/30 border-b">
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          className="pl-9 h-9 bg-background"
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      {/* Priority */}
      <Select value={filters.priority || '_all'} onValueChange={(v) => update('priority', v === '_all' ? '' : v)}>
        <SelectTrigger className="h-9 w-36 bg-background">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Priorities</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      {/* Category */}
      {allCategories.length > 0 && (
        <Select value={filters.category || '_all'} onValueChange={(v) => update('category', v === '_all' ? '' : v)}>
          <SelectTrigger className="h-9 w-40 bg-background">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Categories</SelectItem>
            {allCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Tag */}
      {allTags.length > 0 && (
        <Select value={filters.tag || '_all'} onValueChange={(v) => update('tag', v === '_all' ? '' : v)}>
          <SelectTrigger className="h-9 w-36 bg-background">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Assignee */}
      {members.length > 0 && (
        <Select value={filters.assigneeId || '_all'} onValueChange={(v) => update('assigneeId', v === '_all' ? '' : v)}>
          <SelectTrigger className="h-9 w-40 bg-background">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Assignees</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Clear */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 gap-1 text-muted-foreground">
          <X className="w-3.5 h-3.5" />
          Clear
        </Button>
      )}
    </div>
  )
}
