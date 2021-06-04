/**
 * JS file containing all env. and derived variables.
 */

export const SERVICE_NAME = process.env.SERVICE_NAME || 'delta-producer-dump-file-publisher';
export const EXPORT_TTL_BATCH_SIZE = process.env.EXPORT_TTL_BATCH_SIZE || 1000;
export const DUMP_FILE_CREATION_TASK_OPERATION = process.env.DUMP_FILE_CREATION_TASK_OPERATION || 'http://redpencil.data.gift/id/jobs/concept/TaskOperation/deltas/deltaDumpFileCreation';
export const FILES_GRAPH = process.env.FILES_GRAPH || 'http://mu.semte.ch/graphs/public';
export const DCAT_DATASET_GRAPH = process.env._DCAT_DATASET_GRAPH || 'http://mu.semte.ch/graphs/public';
export const RELATIVE_FILE_PATH = process.env.FILES_GRAPH || 'delta-producer-dumps';
export const JOBS_GRAPH =  process.env.JOBS_GRAPH || 'http://mu.semte.ch/graphs/system/jobs';

if(!process.env.GRAPH_TO_DUMP)
  throw `Environment variable 'GRAPH_TO_DUMP' should be provided.`;
export const GRAPH_TO_DUMP = process.env.GRAPH_TO_DUMP;

if(!process.env.EXPORT_FILE_BASE_NAME)
  throw `Environment variable 'EXPORT_FILE_BASE_NAME' should be provided.`;
export const EXPORT_FILE_BASE_NAME = process.env.EXPORT_FILE_BASE_NAME;

if(!process.env.DUMP_FILE_CREATION_JOB_OPERATION)
  throw `Environment variable 'DUMP_FILE_CREATION_JOB_OPERATION' should be provided.`;
export const DUMP_FILE_CREATION_JOB_OPERATION = process.env.DUMP_FILE_CREATION_JOB_OPERATION;

if(!process.env.DCAT_DATASET_SUBJECT)
  throw `Environment variable 'DCAT_DATASET_SUBJECT' should be provided.`;
export const DCAT_DATASET_SUBJECT = process.env.DCAT_DATASET_SUBJECT;
