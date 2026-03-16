* multi-terminal + sidebar — min spec

* zustand store
  * single store for all terminal state
  * Terminal instances (xterm.js) live in a Map outside React
    * React re-renders must not touch Terminal objects
    * store holds metadata: { id, name, status, parentId }
    * Terminal/pty objects referenced by id from a separate registry

* sidebar
  * fixed width ~250px, not resizable (POC)
  * Cmd+B toggles visibility
    * register as electron globalShortcut or accelerator in menu
  * card ordering: creation order, first terminal always first
  * status dot colors: green=#22c55e, gray=#6b7280, blue=#3b82f6

* terminal switching
  * single container div in the terminal panel
  * switching = move xterm.element from old parent to container
    * xterm.element is a real DOM node — just reparent it
  * after reparent: fitAddon.fit() to handle any size difference
  * if WebGL breaks on reparent
    * fallback: webglAddon.dispose(), new WebglAddon(), terminal.loadAddon()
    * this is the backup plan, test the simple path first

* background terminals
  * pty.onData still calls xterm.write() even when terminal is not in DOM
  * xterm buffers internally, no DOM needed for write()
  * this means: no special handling, just keep the data flowing

* layout
  * sidebar + terminal panel in a flex row
  * sidebar: flex-shrink-0, width 250px (or 0 when collapsed)
  * terminal panel: flex-grow-1
  * transition on sidebar collapse: not required for POC
