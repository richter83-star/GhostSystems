import 'dotenv/config';
import http from 'http';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { execFileSync } from 'child_process';

const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';

function job(spec:string, name:string, cmd:string, args:string[]){
  return new CronJob(spec, async () => {
    const iso = DateTime.now().setZone(TZ).toISO();
    console.log(`[cron:${name}] firing @ ${iso}`);
    try {
      execFileSync(cmd, args, { stdio: 'inherit' });
    } catch (e) {
      console.error(`[cron:${name}] error`, e);
    }
  }, null, true, TZ);
}

// Weekly: Monday 05:00 PT
job('0 5 * * 1', 'weekly', 'npm', ['run','weekly']);
// Nightly: 03:30 PT
job('30 3 * * *', 'nightly', 'npm', ['run','sync']);

// keep-alive HTTP server (Render/Railway healthchecks)
const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type':'application/json' });
  res.end(JSON.stringify({ ok:true, ts: Date.now() }));
});
const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`[runner] up on ${port}`));
