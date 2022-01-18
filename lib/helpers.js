import fs from 'fs-extra';
import path from 'path';
import {  sparqlEscapeString, uuid } from 'mu';
import { sparqlEscapeUri } from './utils';
import { countResourcesInGraph, getBatchedTriples, mayBeTaskOfInterest } from './queries';
import { STATUS_SCHEDULED } from './constants';
import {
  EXPORT_TTL_BATCH_SIZE,
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
    const taskDetails = await mayBeTaskOfInterest(task);
    return taskDetails ? taskDetails : null;
  }
  return null;

}

/**
 * Export resources of a specific graph in Turtle format to a file.
*/
export async function generateDumpFile( fileBaseName, graphToDump, publicationEndpoint ) {
  const outputDir = path.join('/share', RELATIVE_FILE_PATH, fileBaseName);
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${fileBaseName}-${new Date().toISOString().replace(/-|T|Z|:|\./g, '')}-${uuid()}`;
  const ttlFile = path.join(outputDir, `${filename}.ttl`);
  const tmpFile = `${ttlFile}.tmp`;
  const count = await countResourcesInGraph(graphToDump, publicationEndpoint);

  //TODO: this flow should be somewhere else
  if(count == 0){
    console.log('No triples found, nothing to do');
    return null;
  }
  else {
    console.log(`Exporting 0/${count} resources`);
    await saveTriplesToFile(tmpFile, count, graphToDump, publicationEndpoint);
    await fs.rename(tmpFile, ttlFile);
    return ttlFile;
  }
}

async function saveTriplesToFile(file, count, graph, publicationEndpoint) {
  let offset = 0;
  while (offset < count) {
    const triples = await getBatchedTriples(offset, graph, publicationEndpoint);
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
  if(triplePart.type == 'uri' || triplePart.termType == "NamedNode"){
    return sparqlEscapeUri(triplePart.value);
  }
  else if (triplePart.type === 'literal' || triplePart.type === 'typed-literal') {
    if(triplePart.datatype) {
        return `${sparqlEscapeString(triplePart.value)}^^${sparqlEscapeUri(triplePart.datatype)}`;
    }
    else if(triplePart.lang) {
      return `${sparqlEscapeString(triplePart.value)}@${triplePart.lang}`;
    }
    else {
      return sparqlEscapeString(triplePart.value);
    }
  }
  else {
    console.log(`Don't know how to escape type ${triplePart.type}. Will escape as a string.`);
    return sparqlEscapeString(triplePart.value);
  }
}
