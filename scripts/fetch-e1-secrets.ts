import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'com-f5-parm';
const OUTFILE = process.argv[2] ?? '.env.e1';

const SECRETS: Record<string, string> = {
  E1_PLATFORM_SERVICE_TOKEN: 'remember-e1-platform-service-token',
};

console.log('Fetching e1 secrets from GCP Secret Manager...');

const lines: string[] = [];
for (const [envName, secretName] of Object.entries(SECRETS)) {
  const value = execSync(
    `gcloud secrets versions access latest --secret=${secretName} --project=${PROJECT}`,
    { encoding: 'utf-8' },
  ).trim();
  lines.push(`${envName}=${value}`);
}

writeFileSync(OUTFILE, lines.join('\n') + '\n');
console.log(`Written ${lines.length} secrets to ${OUTFILE}`);
