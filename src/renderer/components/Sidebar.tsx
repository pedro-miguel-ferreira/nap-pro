import { useTerminalStore, TerminalMeta } from '../store';

const STATUS_COLORS: Record<TerminalMeta['status'], string> = {
  running: '#22c55e',
  exited: '#6b7280',
  done: '#3b82f6',
};

export function Sidebar() {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const setActive = useTerminalStore((s) => s.setActive);
  const createTerminal = useTerminalStore((s) => s.createTerminal);

  return (
    <div
      style={{
        width: 250,
        flexShrink: 0,
        backgroundColor: '#252526',
        borderRight: '1px solid #3c3c3c',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #3c3c3c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: '#cccccc',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Terminals
        </span>
        <button
          onClick={() => {
            const id = createTerminal('shell');
            useTerminalStore.getState().setActive(id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
          title="New Terminal"
        >
          +
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {terminals.map((t) => (
          <AgentCard
            key={t.id}
            terminal={t}
            isActive={t.id === activeTerminalId}
            onClick={() => setActive(t.id)}
            parentName={
              t.parentId ? terminals.find((p) => p.id === t.parentId)?.name : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({
  terminal,
  isActive,
  onClick,
  parentName,
}: {
  terminal: TerminalMeta;
  isActive: boolean;
  onClick: () => void;
  parentName?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: isActive ? '#37373d' : 'transparent',
        borderLeft: isActive ? '2px solid #007acc' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[terminal.status],
            flexShrink: 0,
          }}
        />
        <span style={{ color: '#cccccc', fontSize: 13 }}>{terminal.name}</span>
      </div>
      {parentName && (
        <div style={{ color: '#808080', fontSize: 11, marginLeft: 16, marginTop: 2 }}>
          {'↳ '}
          {parentName}
        </div>
      )}
    </div>
  );
}
