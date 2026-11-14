import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
export async function tree(root) {
  const pids = new Set();
  async function visit(pid) {
    if (pids.has(pid)) return;
    pids.add(pid);
    try {
      const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim();
      if (children) await Promise.all(children.split(/\s+/).map((value) => visit(Number(value))));
    } catch {}
  }
  await visit(root);
  return [...pids];
}
export async function sample(root) {
  const pids = await tree(root);
  const processes = [];
  for (const pid of pids) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      let pss = null;
      try {
        pss = Number(
          (await readFile(`/proc/${pid}/smaps_rollup`, 'utf8')).match(/^Pss:\s+(\d+)/m)?.[1] ?? NaN,
        );
      } catch {}
      processes.push({
        pid,
        ticks: Number(fields[11]) + Number(fields[12]),
        rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0),
        pssKiB: pss,
      });
    } catch {}
  }
  return {
    at: performance.now(),
    processes,
    rssMiB: processes.reduce((s, p) => s + p.rssKiB, 0) / 1024,
    pssMiB: processes.every((p) => p.pssKiB !== null && Number.isFinite(p.pssKiB))
      ? processes.reduce((s, p) => s + p.pssKiB, 0) / 1024
      : null,
    pssCoverage: processes.filter((p) => p.pssKiB !== null && Number.isFinite(p.pssKiB)).length,
  };
}
export async function measure(root, seconds = 8) {
  const samples = [await sample(root)];
  let cpuTicks = 0;
  for (let i = 0; i < seconds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const current = await sample(root);
    const previous = samples.at(-1);
    for (const process of current.processes) {
      const old = previous.processes.find((p) => p.pid === process.pid);
      if (old) cpuTicks += Math.max(0, process.ticks - old.ticks);
    }
    samples.push(current);
  }
  const elapsed = (samples.at(-1).at - samples[0].at) / 1000;
  return {
    durationSeconds: elapsed,
    cpuPercentOneCore: (cpuTicks / ticks / elapsed) * 100,
    meanRssMiB: samples.reduce((sum, s) => sum + s.rssMiB, 0) / samples.length,
    meanPssMiB: samples.every((s) => s.pssMiB !== null)
      ? samples.reduce((sum, s) => sum + s.pssMiB, 0) / samples.length
      : null,
    processCount: samples.at(-1).processes.length,
    pssCoverage: samples.at(-1).pssCoverage,
    samples,
  };
}
