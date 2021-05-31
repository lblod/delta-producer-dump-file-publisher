import fs from 'fs-extra';
import path from 'path';
import { sparqlEscapeUri, sparqlEscapeString, uuid } from 'mu';
import { countResourcesInGraph, getBatchedTriples, isTaskInExpectedJob } from './queries';
import { STATUS_SCHEDULED } from './constants';
import {
  EXPORT_TTL_BATCH_SIZE,
  GRAPH_TO_DUMP,
  EXPORT_FILE_BASE_NAME,
  RELATIVE_FILE_PATH
} from './env';

export async function getScheduledDumpTask(inserts) {
  const task = inserts.filter( triple => {
    return triple.predicate.type == 'uri'
      && triple.predicate.value == 'http://www.w3.org/ns/adms#status'
      && triple.object.type == 'uri'
      && triple.object.value == STATUS_SCHEDULED;
  }).map(triple => triple.subject.value)[0]; // assume one une task per deltas

  if(task){
    const taskInExpectedJob = await isTaskInExpectedJob(task);
    return taskInExpectedJob ? task : null;
  }
  return null;

}

/**
 * Export resources of a specific graph in Turtle format to a file.
*/
export async function generateDumpFile() {
  const outputDir = path.join('/share', RELATIVE_FILE_PATH, EXPORT_FILE_BASE_NAME);
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${EXPORT_FILE_BASE_NAME}-${new Date().toISOString().replace(/-|T|Z|:|\./g, '')}-${uuid()}`;
  const ttlFile = path.join(outputDir, `${filename}.ttl`);
  const tmpFile = `${ttlFile}.tmp`;
  const count = await countResourcesInGraph(GRAPH_TO_DUMP);

  console.log(`Exporting 0/${count} resources`);
  await saveTriplesToFile(tmpFile, count);
  await fs.rename(tmpFile, ttlFile);
  return ttlFile;
}

async function saveTriplesToFile(file, count) {
  let offset = 0;
  while (offset < count) {
    const triples = await getBatchedTriples(offset);
    let serializedTriples = triples.map(t => serializeTriple(t)).join('\n');
    serializedTriples = serializedTriples + '\n'; //Make sure to end on new line, else virtuoso does not like it`
    fs.appendFileSync(file, serializedTriples);
    offset = offset + EXPORT_TTL_BATCH_SIZE;
    console.log(`Constructed triples of ${offset < count ? offset : count}/${count} resources`);
  }
}

function serializeTriple(triple) {
  const predicate = sparqlEscapePredicate(triple.p.value);
  return `${serializeTriplePart(triple.s)} ${predicate} ${serializeTriplePart(triple.o)}.`;
}

function sparqlEscapePredicate(predicate) {
  return isInverse(predicate) ? `^<${predicate.slice(1)}>` : `<${predicate}>`;
}

function isInverse(predicate) {
  return predicate && predicate.startsWith('^');
}

function serializeTriplePart(triplePart){
  if(triplePart.type == 'uri'){
    return sparqlEscapeUri(triplePart.value);
  }
  else {
    if(triplePart.datatype){
      return `${sparqlEscapeString(triplePart.value)}^^${sparqlEscapeUri(triplePart.datatype)}`;
    }
    else {
      return sparqlEscapeString(triplePart.value);
    }
  }
}
