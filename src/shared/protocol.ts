export interface StartRequest {
  type: 'start';
  id: number;
  command: string;
  name?: string;
  cwd?: string;
  parentId?: string | null;
}

export interface PsRequest {
  type: 'ps';
  id: number;
}

export interface PeekRequest {
  type: 'peek';
  id: number;
  name: string;
}

export interface KillRequest {
  type: 'kill';
  id: number;
  name: string;
}

export interface CloseRequest {
  type: 'close';
  id: number;
  name: string;
}

export type SocketRequest =
  | StartRequest
  | PsRequest
  | PeekRequest
  | KillRequest
  | CloseRequest;
