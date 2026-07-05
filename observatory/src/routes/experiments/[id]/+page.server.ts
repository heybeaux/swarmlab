import { error } from '@sveltejs/kit';
import { getExperiment } from '$lib/server/lab';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const experiment = await getExperiment(params.id);
  if (!experiment) error(404, `experiment "${params.id}" not found`);
  return { experiment };
};
