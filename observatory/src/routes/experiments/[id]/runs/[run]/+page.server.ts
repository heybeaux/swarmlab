import { error } from '@sveltejs/kit';
import { getTrace } from '$lib/server/lab';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const events = await getTrace(params.id, params.run);
  if (!events) error(404, `trace "${params.run}" not found in ${params.id}`);
  return { expId: params.id, runId: params.run, events };
};
