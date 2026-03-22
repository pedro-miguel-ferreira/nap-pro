# Response — 002-fs-eng-design-sprint-bc

## Built

Two HTML mock files, both self-contained and openable in a browser:

### variant-b-board-companion.html
- Gutter (60px) | Kanban board (flex) | Terminal (480px fixed)
- Six columns: draft, backlog, todo, doing, review, done
- Cards show napkin name + agent status dots (clickable — each dot switches terminal)
- Architect pill in board header, clickable to show architect output
- Same terminal content and interaction model as variant A
- Compact cards fit the narrower middle column

### variant-c-board-full.html
- Gutter (60px) | Full-width kanban board
- No persistent terminal — instead, a slide-in drawer from the right when you click an agent row
- Cards are larger with more detail: artifact tags (nap.md, spec.md, etc.) + full agent name rows
- Agent rows inside cards are clickable — opens the drawer with terminal output
- Drawer closes on X button or Escape key
- Architect pill in header opens drawer too

## Design decisions

- **Variant B terminal width**: Fixed at 480px (vs flex in A) so the board columns get enough room. Board columns have min-width 130px.
- **Variant C drawer pattern**: Since there's no terminal column, agent output appears in a slide-in drawer. This keeps the board as the primary view while still allowing inspection.
- **Variant C shows more card detail**: With the extra width, cards include artifact tags and full agent name rows instead of just dots. This answers whether the board can work as a standalone dashboard.
- **Same mock data**: All 5 napkins, same statuses, same agent terminal content across all three variants.
- **Same color scheme and design language**: Identical to variant A — #1e1e1e/#252526/#3c3c3c, status dot colors, monospace font, hover/selected states.
