
export const serializeObject = (o:any, seen = new Set()):any => {
  if (o && typeof o === 'object') {
    if (seen.has(o)) return '[Circular]';
    seen.add(o);

    if (Array.isArray(o)) return o.map(item => serializeObject(item, seen));
    return Object.fromEntries(Object.entries(o).map(([key, value]) => [key, serializeObject(value, seen)]));
  }
  return o;
}

const toConsole = (o:any, out:Function, msg?:string) => {
  const output = (suffix:string) => {
    if(msg) msg = msg.endsWith(': ') ? msg : `${msg}: `;
    out(msg ? `${msg}${suffix}` : suffix);
  }
  if(o instanceof Error) {
    console.error(msg);
    console.error(o);
    return;
  }
  if(o instanceof Object) {
    output(JSON.stringify(serializeObject(o), null, 2));
    return;
  }
  output(`${o}`);
}

export const log = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.log(s), msg);
}

export const warn = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.warn(s), msg);
}

export const error = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.error(s), msg);
}

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export enum TimeUnit {
  SECOND = ONE_SECOND_MS,
  MINUTE = ONE_MINUTE_MS,
  HOUR = ONE_HOUR_MS,
  DAY = ONE_DAY_MS,
}

const getOffsetDate = (offsetMs: number, date?: Date): Date => {
  return new Date((date ?? new Date()).getTime() + offsetMs);
}

const getOffsetDateString = (offsetMs: number, date?: Date): string => {
  return getOffsetDate(offsetMs, date).toISOString();
}

export const getPastDateString = (unitCount: number, unitType: TimeUnit, date?: Date): string => {
  return getOffsetDateString(-unitCount * unitType, date);
}

export const getFutureDateString = (unitCount: number, unitType: TimeUnit, date?: Date): string => {
  return getOffsetDateString(unitCount * unitType, date);
}

export const asCommitTimestamp = (date: Date|string): string => {
  const dateStr = typeof date === 'string' ? date : date.toISOString();
  return `commit_time:${dateStr}`;
}

export const asServerTimestamp = (date: Date|string): string => {
  const dateStr = typeof date === 'string' ? date : date.toISOString();
  return `server_time:${dateStr}`;
}