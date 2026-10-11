# Unique Tab

An Obsidian plugin that keeps each file open in at most one tab, jumping to the existing tab instead of opening a duplicate.

## Language

**Tab**:
A leaf in the main editor area that shows a file. Leaves in the sidebars are not tabs, even when they mirror the active file.
_Avoid_: Pane, panel, window

**Redirect**:
Activating a file's existing tab in place of opening it a second time.
_Avoid_: Jump, focus, reuse

**Tab redirect**:
The module that decides whether an open request is redirected, and carries it out.
_Avoid_: Tab handler, dedupe

**Link intent**:
A request to open a file by following a link, optionally to a heading or block inside it.
_Avoid_: Link click

**Open intent**:
A request to open a file directly, from the file explorer or quick switcher.
_Avoid_: File open, explorer click

**Anchor**:
The heading or block reference after `#` or `^` in a link, naming a place inside a file.
_Avoid_: Fragment, hash

**Ghost leaf**:
An empty leaf that Obsidian created for an open intent that was then redirected. It is hidden and discarded.
_Avoid_: Stale leaf, hidden tab, zombie
