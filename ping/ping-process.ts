
import child_process from 'child_process';

export type PingOptions = {
  uri: string;
  wait?: number;
  ttl?: number;
  bytes: number;
}

export type PingHandler = (data: any, uri: string) => any;

export function ping(options: PingOptions, cb: PingHandler): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let pingProcess: child_process.ChildProcessWithoutNullStreams, args: string[], uri: string, wait: number,
      ttl: number, bytes: number;
    args = [];
    uri = options.uri;
    wait = options.wait || 1;
    ttl = options.ttl;
    bytes = options.bytes;
    if(wait !== undefined) {
      args.push('-i', wait + '');
    }
    if(ttl !== undefined) {
      args.push('-m', ttl + '');
    }
    if(bytes !== undefined) {
      args.push('-s', bytes + '');
    }
    args.push(uri);

    pingProcess = child_process.spawn('ping', args);

    pingProcess.stdout.on('data', data => {
      resolve(() => {
        pingProcess.kill();
      });
      return cb(data, uri);
    });

    pingProcess.on('error', err => {
      reject(err);
    });

  });
}
