import * as path from 'path';
import * as os from 'os';

export const SOCKET_PATH =
  process.env['NAP_SOCKET'] || path.join(os.homedir(), '.nap', 'sock');
