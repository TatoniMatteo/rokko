export class LocalLog {
  constructor(directory: string, options?: {now?: () => number});
  record(event: string, details?: {code?: number}): void;
  read(): {time:number;event:string;code?:number}[];
  clear(): void;
}
export function diagnosticReport(info: {versions:Record<string,string|undefined>;platform:string;arch:string;display:string;counts:Record<string,number>},entries:unknown[]): object;
export function exportDiagnostics(path:string,report:object):void;
