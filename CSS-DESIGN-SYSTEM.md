# CSS & Design System Reference Guide

A complete, copy-paste reference for building web applications with the same stack used in this project:
**Tailwind CSS v3 + shadcn/ui + Radix UI + lucide-react**

---

## Table of Contents

1. [Stack Overview](#1-stack-overview)
2. [Project Setup](#2-project-setup)
3. [CSS Variables & Theming](#3-css-variables--theming)
4. [The `cn()` Utility](#4-the-cn-utility)
5. [Tailwind Core Patterns](#5-tailwind-core-patterns)
6. [Typography](#6-typography)
7. [Colors & Semantic Tokens](#7-colors--semantic-tokens)
8. [Spacing & Sizing](#8-spacing--sizing)
9. [Layout — Flex & Grid](#9-layout--flex--grid)
10. [Component: Button](#10-component-button)
11. [Component: Input & Textarea](#11-component-input--textarea)
12. [Component: Select (Picklist/Dropdown)](#12-component-select-picklistdropdown)
13. [Component: Badge](#13-component-badge)
14. [Component: Card](#14-component-card)
15. [Component: Dialog / Modal](#15-component-dialog--modal)
16. [Component: Label](#16-component-label)
17. [Component: Toast / Notifications](#17-component-toast--notifications)
18. [Component: Dropdown Menu](#18-component-dropdown-menu)
19. [Component: Tabs](#19-component-tabs)
20. [Component: Tooltip](#20-component-tooltip)
21. [Component: Avatar](#21-component-avatar)
22. [Component: Separator](#22-component-separator)
23. [Custom Patterns Used in This App](#23-custom-patterns-used-in-this-app)
24. [Icons — lucide-react](#24-icons--lucide-react)
25. [Dark Mode](#25-dark-mode)
26. [Animation & Transitions](#26-animation--transitions)
27. [Responsive Design](#27-responsive-design)
28. [Forms — Full Example](#28-forms--full-example)
29. [Common UI Patterns](#29-common-ui-patterns)

---

## 1. Stack Overview

| Package | Purpose |
|---|---|
| `tailwindcss` v3 | Utility-first CSS — all layout, spacing, color via class names |
| `shadcn/ui` | Copy-paste component library built on Radix UI |
| `@radix-ui/*` | Headless accessible primitives (Select, Dialog, Tooltip, etc.) |
| `class-variance-authority` (cva) | Manages component variants cleanly |
| `clsx` + `tailwind-merge` | Conditional class merging without conflicts |
| `lucide-react` | Icon library (500+ SVG icons as React components) |
| `tailwindcss-animate` | Smooth enter/exit animations |

---

## 2. Project Setup

### Install

```bash
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p

npm install class-variance-authority clsx tailwind-merge tailwindcss-animate
npm install lucide-react

# Radix primitives used by shadcn components
npm install @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-select
npm install @radix-ui/react-dropdown-menu @radix-ui/react-toast @radix-ui/react-tooltip
npm install @radix-ui/react-label @radix-ui/react-tabs @radix-ui/react-avatar
npm install @radix-ui/react-separator @radix-ui/react-checkbox @radix-ui/react-popover
```

### `tailwind.config.js`

```js
import animate from "tailwindcss-animate"

export default {
  darkMode: ["class"],                  // dark mode via .dark class on <html>
  content: ["./src/**/*.{ts,tsx}"],     // scan all TS/TSX files
  theme: {
    extend: {
      colors: {
        // All colors reference CSS variables — swappable for themes
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
}
```

### `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## 3. CSS Variables & Theming

All colors are HSL values stored as CSS variables in `src/index.css`. This is what makes dark mode and theming trivial — change the variables, everything updates.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ── Backgrounds ─────────────────────────────── */
    --background: 0 0% 100%;           /* white */
    --foreground: 222.2 84% 4.9%;      /* near black */

    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    /* ── Brand color ─────────────────────────────── */
    --primary: 239 84% 67%;            /* indigo-500 */
    --primary-foreground: 210 40% 98%; /* white */

    /* ── Neutral surface ─────────────────────────── */
    --secondary: 210 40% 96.1%;        /* light gray */
    --secondary-foreground: 222.2 47.4% 11.2%;

    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%; /* medium gray text */

    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;

    /* ── Danger ──────────────────────────────────── */
    --destructive: 0 84.2% 60.2%;      /* red */
    --destructive-foreground: 210 40% 98%;

    /* ── Borders & inputs ────────────────────────── */
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 239 84% 67%;               /* focus ring = primary */

    /* ── Radius ──────────────────────────────────── */
    --radius: 0.5rem;                  /* base border-radius */
  }

  /* ── Dark mode overrides ─────────────────────── */
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 239 84% 67%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 239 84% 67%;
  }
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', sans-serif;
  }
}
```

### How to change the brand color

To switch from indigo to blue, just change `--primary`:
```css
--primary: 221 83% 53%;  /* blue-600 */
```
Every button, ring, and accent updates automatically.

---

## 4. The `cn()` Utility

The most important utility in the whole system. Merges Tailwind classes without conflicts and supports conditional classes.

```tsx
import { cn } from "@/lib/utils"

// Basic merge — no duplicates, no conflicts
cn("px-4 py-2", "px-6")           // → "py-2 px-6" (px-6 wins)

// Conditional classes
cn("base-class", isActive && "bg-primary text-white")

// Dynamic variants
cn(
  "rounded-full px-3 py-1 text-xs font-semibold",
  status === "completed" && "bg-green-100 text-green-700",
  status === "in-progress" && "bg-blue-100 text-blue-700",
  status === "todo" && "bg-slate-100 text-slate-600"
)

// Override props from parent
function MyButton({ className, ...props }) {
  return <button className={cn("bg-primary text-white px-4 py-2", className)} {...props} />
}
// Caller can override: <MyButton className="bg-red-500" />  →  bg-red-500 wins
```

---

## 5. Tailwind Core Patterns

### Display

```
flex          → display: flex
inline-flex   → display: inline-flex
grid          → display: grid
block         → display: block
inline-block  → display: inline-block
hidden        → display: none
```

### Position

```
relative  absolute  fixed  sticky
inset-0            → top/right/bottom/left: 0
top-4 right-0      → individual sides
z-10 z-20 z-50     → z-index
```

### Overflow

```
overflow-hidden    overflow-auto    overflow-y-auto    overflow-x-hidden
truncate           → overflow:hidden + text-overflow:ellipsis + white-space:nowrap
line-clamp-2       → clamp text to 2 lines with ellipsis
```

---

## 6. Typography

```tsx
// Size scale
text-xs      // 12px
text-sm      // 14px
text-base    // 16px
text-lg      // 18px
text-xl      // 20px
text-2xl     // 24px
text-3xl     // 30px
text-4xl     // 36px

// Weight
font-normal   font-medium   font-semibold   font-bold   font-extrabold

// Color
text-foreground           // primary text
text-muted-foreground     // secondary / hint text
text-primary              // brand color
text-destructive          // red / error

// Alignment
text-left   text-center   text-right

// Line height
leading-none   leading-tight   leading-snug   leading-normal   leading-relaxed

// Letter spacing
tracking-tight   tracking-normal   tracking-wide   tracking-wider   tracking-widest

// Transform
uppercase   lowercase   capitalize   normal-case

// Decoration
underline   line-through   no-underline

// Whitespace
whitespace-nowrap   whitespace-pre-wrap   whitespace-normal

// Examples
<h1 className="text-2xl font-bold text-foreground leading-tight">Page Title</h1>
<p className="text-sm text-muted-foreground leading-relaxed">Description text</p>
<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  Section Label
</span>
```

---

## 7. Colors & Semantic Tokens

### Semantic tokens (use these — they adapt to dark mode)

```tsx
// Backgrounds
bg-background        // page background
bg-card              // card/surface
bg-muted             // subtle background
bg-accent            // hover background
bg-primary           // brand
bg-secondary         // neutral surface
bg-destructive       // danger

// Text
text-foreground           // primary text
text-muted-foreground     // secondary text
text-primary              // brand color text
text-primary-foreground   // text ON primary bg
text-destructive          // error text
text-accent-foreground    // text on accent bg

// Borders
border-border        // default border
border-input         // input border
border-primary       // brand border
```

### Raw Tailwind colors (hardcoded — don't adapt to dark mode)

```tsx
// Grays
bg-slate-50  bg-slate-100  bg-slate-200  bg-slate-500  bg-slate-900
text-slate-400  text-slate-600  text-slate-800

// Status colors (used throughout this app)
bg-blue-50   text-blue-600   border-blue-200    // in-progress
bg-green-50  text-green-600  border-green-200   // completed / success
bg-yellow-50 text-yellow-600 border-yellow-200  // medium / warning
bg-orange-50 text-orange-600 border-orange-200  // high priority
bg-red-50    text-red-600    border-red-200      // urgent / error
bg-purple-50 text-purple-600 border-purple-200  // in-review
bg-indigo-50 text-indigo-600 border-indigo-200  // category

// Opacity modifier (add /N to any color)
bg-primary/10        // primary at 10% opacity
bg-black/40          // black at 40% (backdrop)
text-foreground/60   // text at 60% opacity
border-red-200/50    // border at 50% opacity
```

---

## 8. Spacing & Sizing

Tailwind uses a 4px base unit. `p-1 = 4px`, `p-4 = 16px`, `p-6 = 24px`.

```
0 → 0px       1 → 4px       2 → 8px       3 → 12px
4 → 16px      5 → 20px      6 → 24px      8 → 32px
10 → 40px     12 → 48px     14 → 56px     16 → 64px

// Padding
p-4           → all sides
px-4 py-2     → horizontal / vertical
pt-3 pb-6     → top / bottom
pl-4 pr-2     → left / right

// Margin
m-4   mx-auto (center)   mt-4   mb-2   -mt-1 (negative)

// Width / Height
w-4 = 16px    w-8 = 32px    w-full    w-screen    w-auto
h-4 = 16px    h-10 = 40px   h-full    h-screen
min-w-0       max-w-sm / md / lg / xl / 2xl / 4xl
min-h-0       max-h-48 (192px)

// Fixed square sizes (for avatars, icons)
w-6 h-6   (24px)
w-7 h-7   (28px)
w-8 h-8   (32px)
w-10 h-10 (40px)
w-12 h-12 (48px)
```

---

## 9. Layout — Flex & Grid

### Flexbox

```tsx
// Row (default)
<div className="flex items-center gap-3">

// Column
<div className="flex flex-col gap-4">

// Alignment
items-start    items-center    items-end    items-stretch    items-baseline
justify-start  justify-center  justify-end  justify-between  justify-around

// Wrapping
flex-wrap     flex-nowrap

// Grow / shrink
flex-1        // grow to fill space
flex-none     // don't grow or shrink
shrink-0      // don't shrink
min-w-0       // allow shrinking below content size (important with flex-1)

// Gap
gap-1  gap-2  gap-3  gap-4  gap-6  gap-8

// Examples
<div className="flex items-center justify-between px-4 py-3">
  <div className="flex items-center gap-2 min-w-0">
    <img className="shrink-0 w-8 h-8 rounded-full" />
    <span className="truncate">Long name here</span>
  </div>
  <button className="shrink-0">Action</button>
</div>
```

### Grid

```tsx
// Basic grid
<div className="grid grid-cols-2 gap-4">
<div className="grid grid-cols-3 gap-6">
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">  // responsive

// Auto-fill responsive
<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">

// Span columns
<div className="col-span-2">   // spans 2 columns
<div className="lg:col-span-2"> // spans 2 on large screens
```

---

## 10. Component: Button

### Usage

```tsx
import { Button } from "@/components/ui/button"

// Variants
<Button>Primary (default)</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button variant="link">Link style</Button>

// Sizes
<Button size="sm">Small</Button>         // h-9
<Button size="default">Default</Button>  // h-10
<Button size="lg">Large</Button>         // h-11
<Button size="icon"><X /></Button>        // h-10 w-10, square

// States
<Button disabled>Disabled</Button>
<Button disabled><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading...</Button>

// With icon
<Button className="gap-2">
  <Plus className="w-4 h-4" />
  Add Task
</Button>

// Full width
<Button className="w-full">Submit</Button>

// As a link (asChild pattern)
import { Link } from "react-router-dom"
<Button asChild>
  <Link to="/dashboard">Go to Dashboard</Link>
</Button>
```

### Custom button styles (extending beyond variants)

```tsx
// Pill shaped
<Button className="rounded-full px-5">Pill Button</Button>

// Split button (Add + dropdown arrow)
<div className="flex">
  <Button className="rounded-r-none border-r border-primary-foreground/20">
    Add Task
  </Button>
  <Button className="rounded-l-none px-2" onClick={toggleDropdown}>
    <ChevronDown className="w-3.5 h-3.5" />
  </Button>
</div>

// Icon-only with tooltip
<Button variant="ghost" size="icon" className="h-8 w-8">
  <Settings className="w-4 h-4" />
</Button>

// Danger confirm style
<Button
  variant="destructive"
  className="gap-2"
  onClick={() => confirm("Delete?") && doDelete()}
>
  <Trash2 className="w-4 h-4" />
  Delete
</Button>
```

---

## 11. Component: Input & Textarea

### Input

```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Basic
<Input placeholder="Type here..." />

// With label
<div className="space-y-1.5">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>

// Controlled
<Input
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Search..."
/>

// Sizes (override with className)
<Input className="h-8 text-xs" />   // small
<Input className="h-12 text-base" /> // large

// With icon inside (custom wrapper)
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
  <Input className="pl-9" placeholder="Search tasks..." />
</div>

// With clear button
<div className="relative">
  <Input value={search} onChange={(e) => setSearch(e.target.value)} />
  {search && (
    <button
      onClick={() => setSearch('')}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  )}
</div>

// Type variants
<Input type="text" />
<Input type="email" />
<Input type="password" />
<Input type="date" />
<Input type="number" />
<Input type="file" />
```

### Textarea

```tsx
import { Textarea } from "@/components/ui/textarea"

<Textarea placeholder="Write a description..." />

// Controlled + fixed size
<Textarea
  value={text}
  onChange={(e) => setText(e.target.value)}
  className="min-h-[120px] resize-none"
  rows={4}
/>

// Enter to submit, Shift+Enter for newline
<Textarea
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }}
/>
```

### Form field pattern (full)

```tsx
<div className="space-y-1.5">
  <Label htmlFor="title" className="text-sm font-medium">
    Task Title <span className="text-destructive">*</span>
  </Label>
  <Input
    id="title"
    value={title}
    onChange={(e) => setTitle(e.target.value)}
    placeholder="e.g. Design the landing page"
    className={cn(error && "border-destructive focus-visible:ring-destructive")}
  />
  {error && (
    <p className="text-xs text-destructive">{error}</p>
  )}
  <p className="text-xs text-muted-foreground">
    Keep it short and descriptive.
  </p>
</div>
```

---

## 12. Component: Select (Picklist/Dropdown)

### Basic Select

```tsx
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Uncontrolled
<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="todo">Todo</SelectItem>
    <SelectItem value="in-progress">In Progress</SelectItem>
    <SelectItem value="completed">Completed</SelectItem>
  </SelectContent>
</Select>

// Controlled
<Select value={status} onValueChange={setStatus}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="todo">Todo</SelectItem>
    <SelectItem value="in-progress">In Progress</SelectItem>
    <SelectItem value="in-review">In Review</SelectItem>
    <SelectItem value="completed">Completed</SelectItem>
  </SelectContent>
</Select>
```

### Select with colored badges inside items

```tsx
const STATUS_OPTIONS = [
  { value: 'todo',        label: 'Todo',        cls: 'bg-slate-100 text-slate-700' },
  { value: 'in-progress', label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  { value: 'in-review',   label: 'In Review',   cls: 'bg-purple-100 text-purple-700' },
  { value: 'completed',   label: 'Completed',   cls: 'bg-green-100 text-green-700' },
]

<Select value={status} onValueChange={setStatus}>
  <SelectTrigger className="h-8 w-auto border-0 bg-transparent text-xs">
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
      STATUS_OPTIONS.find(o => o.value === status)?.cls
    )}>
      {STATUS_OPTIONS.find(o => o.value === status)?.label}
    </span>
  </SelectTrigger>
  <SelectContent>
    {STATUS_OPTIONS.map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", opt.cls)}>
          {opt.label}
        </span>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Select with groups and separator

```tsx
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select"

<Select>
  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Active</SelectLabel>
      <SelectItem value="todo">Todo</SelectItem>
      <SelectItem value="in-progress">In Progress</SelectItem>
    </SelectGroup>
    <SelectSeparator />
    <SelectGroup>
      <SelectLabel>Done</SelectLabel>
      <SelectItem value="completed">Completed</SelectItem>
      <SelectItem value="cancelled" disabled>Cancelled</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

---

## 13. Component: Badge

```tsx
import { Badge } from "@/components/ui/badge"

// Variants
<Badge>Default</Badge>                          // primary colored
<Badge variant="secondary">Secondary</Badge>   // gray
<Badge variant="outline">Outline</Badge>        // border only
<Badge variant="destructive">Error</Badge>      // red

// Custom colored badges (most common pattern in this app)
<Badge className="bg-blue-100 text-blue-700 border-0">In Progress</Badge>
<Badge className="bg-green-100 text-green-700 border-0">Completed</Badge>
<Badge className="bg-yellow-100 text-yellow-700 border-0">Medium</Badge>
<Badge className="bg-red-100 text-red-700 border-0">Urgent</Badge>
<Badge className="bg-orange-100 text-orange-700 border-0">High</Badge>
<Badge className="bg-purple-100 text-purple-700 border-0">In Review</Badge>

// Small inline badge
<Badge className="text-[10px] px-1.5 py-0 h-4">Tag</Badge>

// Status pill with dot indicator (custom pattern)
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
  In Progress
</span>
```

---

## 14. Component: Card

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"

// Full card
<Card>
  <CardHeader>
    <CardTitle>Task Summary</CardTitle>
    <CardDescription>Overview of all tasks in this workspace</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content goes here.</p>
  </CardContent>
  <CardFooter className="flex justify-between">
    <Button variant="outline">Cancel</Button>
    <Button>Save</Button>
  </CardFooter>
</Card>

// Card without header
<Card>
  <CardContent className="p-6">
    <p>Simple card with just content.</p>
  </CardContent>
</Card>

// Stat card (pattern from this app)
<div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-background">
  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
    <Clock className="w-4 h-4" />
  </div>
  <div>
    <div className="text-xl font-bold">12</div>
    <div className="text-xs text-muted-foreground">In Progress</div>
  </div>
</div>

// Task list card (pattern from this app)
<button className="w-full text-left bg-card rounded-xl border-l-4 border border-border shadow-sm hover:shadow-md transition-all p-5 border-l-blue-500">
  <div className="flex items-center gap-2 mb-3">
    {/* status pill */}
    {/* priority badge */}
    {/* due date */}
  </div>
  <h3 className="text-base font-semibold text-foreground mb-2">Task Title</h3>
  <p className="text-sm text-muted-foreground line-clamp-2">Description...</p>
</button>
```

---

## 15. Component: Dialog / Modal

```tsx
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

// Controlled (most common)
const [open, setOpen] = useState(false)

<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Create Task</DialogTitle>
      <DialogDescription>
        Fill in the details below to create a new task.
      </DialogDescription>
    </DialogHeader>

    {/* Form content */}
    <div className="space-y-4 py-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input placeholder="Task title" />
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Create Task</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// Large dialog / full modal
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

// No close button (custom)
<DialogContent className="[&>button]:hidden">

// Full screen overlay (not Dialog, custom pattern from this app)
{selectedTaskId && (
  <>
    <div
      className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
      onClick={() => setSelectedTaskId(null)}
    />
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl z-50 shadow-2xl flex flex-col">
      <TaskDetailPane onClose={() => setSelectedTaskId(null)} />
    </div>
  </>
)}
```

---

## 16. Component: Label

```tsx
import { Label } from "@/components/ui/label"

// Basic
<Label htmlFor="email">Email address</Label>
<Input id="email" />

// Styled variations
<Label className="text-xs text-muted-foreground uppercase tracking-wider">
  Section Header
</Label>

<Label className="text-sm font-semibold text-foreground">
  Required Field <span className="text-destructive ml-0.5">*</span>
</Label>
```

---

## 17. Component: Toast / Notifications

```tsx
// Setup in main.tsx or App.tsx
import { Toaster } from "@/components/ui/toaster"

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}

// Usage anywhere in the app
import { toast } from "@/hooks/use-toast"

// Success
toast({ title: "Task created!" })

// With description
toast({
  title: "Task updated",
  description: "Your changes have been saved.",
})

// Error/Destructive
toast({
  title: "Error",
  description: "Failed to save. Please try again.",
  variant: "destructive",
})

// With action
import { ToastAction } from "@/components/ui/toast"
toast({
  title: "Task deleted",
  description: "This cannot be undone.",
  action: <ToastAction altText="Undo" onClick={undoDelete}>Undo</ToastAction>,
})
```

---

## 18. Component: Dropdown Menu

```tsx
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

// Basic dropdown
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreHorizontal className="w-4 h-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-52">
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleEdit}>
      <Pencil className="w-4 h-4 mr-2" /> Edit
    </DropdownMenuItem>
    <DropdownMenuItem onClick={handleDuplicate}>
      <Copy className="w-4 h-4 mr-2" /> Duplicate
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onClick={handleDelete}
      className="text-destructive focus:text-destructive"
    >
      <Trash2 className="w-4 h-4 mr-2" /> Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>

// With checkbox items
<DropdownMenuCheckboxItem
  checked={showCompleted}
  onCheckedChange={setShowCompleted}
>
  Show completed tasks
</DropdownMenuCheckboxItem>

// With radio group (single selection)
<DropdownMenuRadioGroup value={view} onValueChange={setView}>
  <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
  <DropdownMenuRadioItem value="board">Board</DropdownMenuRadioItem>
</DropdownMenuRadioGroup>

// Align options: "start" | "center" | "end"
// Side options: "top" | "right" | "bottom" | "left"
<DropdownMenuContent align="end" side="bottom" sideOffset={4}>
```

---

## 19. Component: Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Basic tabs
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="tasks">Tasks</TabsTrigger>
    <TabsTrigger value="members">Members</TabsTrigger>
  </TabsList>

  <TabsContent value="overview">
    <p>Overview content here</p>
  </TabsContent>
  <TabsContent value="tasks">
    <p>Tasks content here</p>
  </TabsContent>
  <TabsContent value="members">
    <p>Members content here</p>
  </TabsContent>
</Tabs>

// Controlled
<Tabs value={activeTab} onValueChange={setActiveTab}>

// Full-width tabs
<TabsList className="w-full grid grid-cols-3">
  <TabsTrigger value="a">Tab A</TabsTrigger>
  <TabsTrigger value="b">Tab B</TabsTrigger>
  <TabsTrigger value="c">Tab C</TabsTrigger>
</TabsList>
```

---

## 20. Component: Tooltip

```tsx
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"

// Wrap your app (or section) in TooltipProvider once
<TooltipProvider>
  <App />
</TooltipProvider>

// Usage
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon">
      <Settings className="w-4 h-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>Settings</p>
  </TooltipContent>
</Tooltip>

// Custom delay
<Tooltip delayDuration={300}>

// Side placement
<TooltipContent side="right">Right tooltip</TooltipContent>
<TooltipContent side="bottom">Bottom tooltip</TooltipContent>
```

---

## 21. Component: Avatar

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// With image (falls back to initials if image fails to load)
<Avatar>
  <AvatarImage src={user.avatar} alt={user.name} />
  <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
</Avatar>

// Sized
<Avatar className="w-8 h-8">   // small
<Avatar className="w-12 h-12"> // medium
<Avatar className="w-16 h-16"> // large

// Stacked avatars (custom pattern from this app)
<div className="flex -space-x-2">
  {assignees.slice(0, 3).map((a) => (
    <div
      key={a.id}
      title={a.name}
      className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500
                 border-2 border-background flex items-center justify-center
                 text-white text-[11px] font-bold"
    >
      {a.name.charAt(0).toUpperCase()}
    </div>
  ))}
  {assignees.length > 3 && (
    <div className="w-7 h-7 rounded-full bg-muted border-2 border-background
                    flex items-center justify-center text-xs text-muted-foreground">
      +{assignees.length - 3}
    </div>
  )}
</div>
```

---

## 22. Component: Separator

```tsx
import { Separator } from "@/components/ui/separator"

// Horizontal line
<Separator />

// Vertical line
<Separator orientation="vertical" className="h-4" />

// In a menu/list
<div className="flex items-center gap-2">
  <span>Item 1</span>
  <Separator orientation="vertical" className="h-4" />
  <span>Item 2</span>
</div>

// With margin
<Separator className="my-4" />
```

---

## 23. Custom Patterns Used in This App

### Priority left border card

```tsx
const BORDER: Record<string, string> = {
  urgent: 'border-l-red-500',
  high:   'border-l-orange-400',
  medium: 'border-l-yellow-400',
  low:    'border-l-slate-300',
}

<div className={cn(
  "bg-card rounded-xl border-l-4 border border-border shadow-sm",
  "hover:shadow-md transition-all p-5",
  BORDER[task.priority]
)}>
```

### Filter panel (slide down)

```tsx
// Button with active count badge
<Button
  variant={filterOpen || activeCount > 0 ? 'default' : 'outline'}
  size="sm"
  className="gap-2"
  onClick={() => setFilterOpen(v => !v)}
>
  <SlidersHorizontal className="w-4 h-4" />
  Filters
  {activeCount > 0 && (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[11px]
                     font-bold rounded-full bg-primary-foreground/20 text-primary-foreground">
      {activeCount}
    </span>
  )}
</Button>

// Filter panel
{filterOpen && (
  <div className="border-b bg-card px-6 py-4 shadow-sm">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          className="w-full text-sm border rounded-lg px-3 py-2 bg-background
                     focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All</option>
          <option value="todo">Todo</option>
          <option value="in-progress">In Progress</option>
        </select>
      </div>
    </div>
  </div>
)}
```

### Workspace/profile dropdown (custom, not DropdownMenu)

```tsx
{dropdownOpen && (
  <>
    {/* Backdrop to close on outside click */}
    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />

    {/* Dropdown panel */}
    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border bg-popover
                    shadow-lg z-20 py-2 overflow-hidden">
      <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground
                    uppercase tracking-wider">
        My Account
      </p>
      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm
                         hover:bg-accent transition-colors text-left">
        <Settings className="w-4 h-4 text-muted-foreground" />
        Settings
      </button>
      <div className="border-t mx-3 my-1.5" />
      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm
                         hover:bg-accent transition-colors text-left text-destructive">
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  </>
)}
```

### Empty state

```tsx
<div className="flex flex-col items-center justify-center py-24 text-center">
  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
    <ClipboardList className="w-7 h-7 text-muted-foreground" />
  </div>
  <p className="font-medium text-foreground mb-1">No tasks yet</p>
  <p className="text-sm text-muted-foreground mb-5">
    Click "Add Task" to create your first task.
  </p>
  <Button onClick={openCreate} className="gap-2">
    <Plus className="w-4 h-4" /> Add Task
  </Button>
</div>
```

### Inline editable field (click to edit)

```tsx
{editingTitle ? (
  <div className="flex items-start gap-2">
    <Input
      value={titleValue}
      onChange={(e) => setTitleValue(e.target.value)}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave()
        if (e.key === 'Escape') { setEditing(false); setValue(original) }
      }}
    />
    <Button size="icon" variant="ghost" onClick={handleSave}>
      <Check className="w-4 h-4 text-green-600" />
    </Button>
  </div>
) : (
  <div className="flex items-start gap-2 group">
    <h2 className="flex-1">{title}</h2>
    <button
      onClick={() => setEditing(true)}
      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all"
    >
      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  </div>
)}
```

### Tag input with removable chips

```tsx
const [tags, setTags] = useState<string[]>([])
const [input, setInput] = useState('')

const addTag = () => {
  const t = input.trim()
  if (t && !tags.includes(t)) setTags(prev => [...prev, t])
  setInput('')
}

<div className="space-y-2">
  {/* Chips */}
  <div className="flex flex-wrap gap-1.5">
    {tags.map((tag) => (
      <span key={tag} className="inline-flex items-center gap-1 text-xs
                                  bg-secondary px-2 py-0.5 rounded-full">
        {tag}
        <button onClick={() => setTags(tags.filter(t => t !== tag))}>
          <X className="w-3 h-3 hover:text-destructive" />
        </button>
      </span>
    ))}
  </div>
  {/* Input */}
  <div className="flex gap-1.5">
    <Input
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder="Add tag..."
      className="h-8 text-xs"
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
    />
    <Button size="sm" variant="outline" className="h-8" onClick={addTag}>
      <Plus className="w-3 h-3" />
    </Button>
  </div>
</div>
```

---

## 24. Icons — lucide-react

All icons are React components. Size via `w-*` and `h-*` classes.

```tsx
import {
  // Navigation
  ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ChevronRight, ChevronLeft,

  // Actions
  Plus, X, Check, Pencil, Trash2, Copy, Save, Send, Upload, Download,

  // UI
  Settings, Search, Filter, SlidersHorizontal, MoreHorizontal, MoreVertical,
  Menu, Bell, LogOut, Eye, EyeOff,

  // Content
  FileText, Folder, Tag, Calendar, Clock, Flag, User, Users, UserPlus,
  MessageSquare, Star, Bookmark, Link, ExternalLink,

  // Status
  CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2,
  ClipboardList, LayoutGrid, List,

  // Media
  Mic, Video, Image, Music,
} from 'lucide-react'

// Usage
<Plus className="w-4 h-4" />                  // default icon size
<Search className="w-5 h-5 text-muted-foreground" />
<Loader2 className="w-4 h-4 animate-spin" />  // loading spinner
<AlertCircle className="w-4 h-4 text-destructive" />

// In a button
<Button className="gap-2">
  <Plus className="w-4 h-4" />
  Add Task
</Button>

// Icon sizes by use case
w-3 h-3   // tiny (inside pills/chips)
w-4 h-4   // standard button/inline icon
w-5 h-5   // slightly prominent
w-6 h-6   // section headers
w-8 h-8   // empty state icons (in colored bg circle)
```

---

## 25. Dark Mode

Toggle dark mode by adding/removing `dark` class on `<html>`:

```ts
// Enable dark mode
document.documentElement.classList.add('dark')

// Disable dark mode
document.documentElement.classList.remove('dark')

// Toggle
document.documentElement.classList.toggle('dark')

// Persist to localStorage
const theme = localStorage.getItem('theme') || 'light'
document.documentElement.classList.toggle('dark', theme === 'dark')
```

In components, use `dark:` prefix for dark-mode-specific overrides:
```tsx
<div className="bg-white dark:bg-slate-900 text-black dark:text-white">
```

The CSS variable approach means most semantic token classes (`bg-background`, `text-foreground`, etc.) **automatically** adapt — no `dark:` prefix needed.

---

## 26. Animation & Transitions

```tsx
// Transitions
transition-colors     // color changes
transition-all        // all properties
transition-transform
duration-150   duration-200   duration-300   ease-in   ease-out

// Hover effects
hover:bg-accent
hover:shadow-md
hover:text-primary
hover:scale-105    // subtle grow
hover:opacity-80

// Focus
focus:outline-none
focus:ring-2 focus:ring-ring focus:ring-offset-2
focus-visible:ring-2 focus-visible:ring-ring  // only on keyboard focus

// Animate utilities (tailwindcss-animate)
animate-spin          // continuous rotation (loading)
animate-pulse         // pulsing fade (skeleton loaders)
animate-bounce        // bouncing
animate-in            // entry animation
fade-in-0             // fade from transparent
zoom-in-95            // zoom from 95%
slide-in-from-top-2   // slide down

// Group hover (hover parent → affect child)
<div className="group">
  <div>Parent (hover me)</div>
  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
    Appears on parent hover
  </button>
</div>

// Conditional ring (selected state)
<div className={cn(
  "border rounded-xl p-4 cursor-pointer transition-all",
  selected && "ring-2 ring-primary ring-offset-1 shadow-md"
)}>
```

---

## 27. Responsive Design

Breakpoints: `sm` 640px · `md` 768px · `lg` 1024px · `xl` 1280px · `2xl` 1536px

```tsx
// Mobile-first: base = mobile, add breakpoints for larger screens
<div className="flex flex-col lg:flex-row gap-4">
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Show/hide at breakpoints
<div className="hidden lg:block">Only on desktop</div>
<div className="lg:hidden">Only on mobile/tablet</div>

// Text size responsive
<h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">

// Padding responsive
<div className="p-4 sm:p-6 lg:p-8">

// Width responsive
<div className="w-full lg:w-96">

// Max width containers
<div className="max-w-xl mx-auto">     // 576px
<div className="max-w-3xl mx-auto">    // 768px
<div className="max-w-5xl mx-auto">    // 1024px
<div className="max-w-7xl mx-auto">    // 1280px
```

---

## 28. Forms — Full Example

```tsx
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export function CreateTaskForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (title.length > 255) e.title = 'Title too long'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({ title, description, priority, dueDate })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Title field */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Design the landing page"
          className={cn(errors.title && "border-destructive")}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{errors.title}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details..."
          className="resize-none min-h-[100px]"
        />
      </div>

      {/* Two-column row: Priority + Due Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🟢 Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="due">Due Date</Label>
          <Input
            id="due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1">Create Task</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>

    </form>
  )
}
```

---

## 29. Common UI Patterns

### Loading spinner (inline)

```tsx
import { Loader2 } from 'lucide-react'

<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />

// Full page
<div className="flex items-center justify-center h-full">
  <Loader2 className="w-8 h-8 animate-spin text-primary" />
</div>

// In button
<Button disabled>
  <Loader2 className="w-4 h-4 animate-spin mr-2" />
  Saving...
</Button>
```

### Skeleton loader

```tsx
<div className="space-y-3">
  <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
  <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
  <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
</div>
```

### Divider with label

```tsx
<div className="relative">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground">or</span>
  </div>
</div>
```

### Scrollable area with fade

```tsx
<div className="relative">
  <div className="overflow-y-auto max-h-64 space-y-2 pr-1">
    {items.map(item => <div key={item.id}>{item.name}</div>)}
  </div>
  {/* Bottom fade */}
  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8
                  bg-gradient-to-t from-background to-transparent" />
</div>
```

### Responsive sidebar layout

```tsx
<div className="flex h-screen overflow-hidden">
  {/* Sidebar */}
  <aside className="hidden lg:flex w-64 flex-col border-r bg-card shrink-0">
    {/* nav */}
  </aside>

  {/* Main */}
  <main className="flex-1 min-w-0 overflow-y-auto">
    {/* content */}
  </main>
</div>
```

### Sticky header inside scroll container

```tsx
<div className="flex flex-col h-full overflow-hidden">
  {/* Sticky toolbar */}
  <div className="shrink-0 border-b px-4 py-3 bg-background sticky top-0 z-10">
    <h1>Title</h1>
  </div>
  {/* Scrollable content */}
  <div className="flex-1 overflow-y-auto p-4">
    {/* long list */}
  </div>
</div>
```

### Conditional ring selection highlight

```tsx
// On cards, makes selected item visually distinct
<div className={cn(
  "border rounded-xl p-4 cursor-pointer transition-all",
  "hover:border-primary/50 hover:shadow-sm",
  selected && "ring-2 ring-primary ring-offset-1 shadow-md border-primary/50"
)}>
```

### Overdue/warning color pattern

```tsx
const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== 'completed'

<span className={cn(
  "text-xs font-medium",
  isOverdue ? "text-red-600" : "text-muted-foreground"
)}>
  {isOverdue && "Overdue · "}
  {format(new Date(dueDate), 'MMM d, yyyy')}
</span>
```
