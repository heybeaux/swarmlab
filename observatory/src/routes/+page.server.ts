import { getEvidenceSummary, listExperiments } from '$lib/server/lab';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [experiments, evidence] = await Promise.all([listExperiments(), getEvidenceSummary()]);
  return { experiments, evidence };
};
