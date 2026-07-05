import { listExperiments } from '$lib/server/lab';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { experiments: await listExperiments() };
};
