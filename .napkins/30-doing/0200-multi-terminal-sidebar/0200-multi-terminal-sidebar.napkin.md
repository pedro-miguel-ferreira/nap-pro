* multi-terminal + sidebar
  * the multiplexer — one window, many sessions
  * proves: switching between long-scrollback sessions is instant

* state (zustand)
  * terminal store
    * each terminal = { id, name, pty, xterm, status, parentId, messageQueue[] }
    * status: running | exited | done
    * activeTerminalId — which one is displayed
  * actions
    * createTerminal(name, command, cwd, parentId?)
    * removeTerminal(id)
    * setActive(id)
    * setStatus(id, status)

* sidebar
  * left panel, ~250px
  * collapsible (Cmd+B)
    * terminal fills full width when collapsed
  * agent cards
    * name
    * status dot
      * green = running
      * gray = exited
      * blue = done
    * parent name (if spawned by another, smaller text)
  * click card → setActive(id)
  * first terminal card always at top
    * it's the user's shell, not an agent

* terminal switching
  * the hard part
  * on switch
    * detach xterm's DOM element from visible container
    * attach new terminal's DOM element
    * call fitAddon.fit() on the newly visible terminal
  * what stays alive
    * Terminal instance (buffer, scrollback)
    * WebGL addon (stays attached)
    * pty (keeps producing output in background)
  * critical test: does WebGL survive detach/reattach?
    * if not: dispose WebGL on detach, re-init on attach
    * measure: is there a flash? how long?

* pty background output
  * hidden terminals keep receiving pty output
  * xterm.write() keeps filling the buffer
  * when user switches back, all output is there
  * no replay needed — buffer was never lost
