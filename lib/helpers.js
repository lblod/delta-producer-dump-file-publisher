import fs from 'fs-extra';
import path from 'path';
import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { countResourcesInGraph, insertFileInDb } from './queries';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import {
  EXPORT_TTL_BATCH_SIZE,
  GRAPH_TO_DUMP,
  EXPORT_FILE_BASE_NAME,
  DUMP_FILE_CREATION_TASK_OPERATION
} from './env';

/**
 * Export resources of a specific graph in Turtle format to a file.
 *
 * @param {string} file Absolute path of the file to export to (e.g. /data/exports/mandaten.ttl)
*/
export async function generateDumpFile(file) {
  const outputDir = `/share/exports/${EXPORT_FILE_BASE_NAME}`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${EXPORT_FILE_BASE_NAME}-${new Date().toISOString().replace(/-|T|Z|:|\./g, '')}`;
  const ttlFile = path.join(outputDir, `${filename}.ttl`);
  const tmpFile = `${ttlFile}.tmp`;
  const count = await countResourcesInGraph(GRAPH_TO_DUMP);

  console.log(`Exporting 0/${count} resources`);
  await saveTriplesToFile(tmpFile, count)
  await fs.rename(tmpFile, ttlFile);
  await insertFileInDb(ttlFile, 'text/turtle');
}

// ---------------------------------------- INTERNAL LOGIC ----------------------------------------

async function saveTriplesToFile(file, count) {
  let offset = 0;
  while (offset < count) {
    const q = `
      SELECT DISTINCT ?s ?p ?o
      WHERE {
        GRAPH ${sparqlEscapeUri(GRAPH_TO_DUMP)} {
          {
            SELECT DISTINCT ?s WHERE {
              GRAPH ${sparqlEscapeUri(GRAPH_TO_DUMP)} {
                ?s a ?type .
              }
            }
            ORDER BY ?s
            LIMIT ${EXPORT_TTL_BATCH_SIZE}
            OFFSET ${offset}
          }
          ?s ?p ?o .
        }
      }
    `;

    await appendBatch(file, q, offset);
    offset = offset + EXPORT_TTL_BATCH_SIZE;
    console.log(`Constructed triples of ${offset < count ? offset : count}/${count} resources`);
  }
}

async function appendBatch(file, request) {
  try {
    const queryResult = await query(request);
    const triples = queryResult.results.bindings;

    let ttlTriples = '';
    triples.forEach(triple => {
      ttlTriples += serializeTriple(triple) + '\n';
    })

    console.log('ttlTriples', ttlTriples);
    fs.appendFileSync(file, ttlTriples);
  } catch(e) {
    console.log(e);
    throw(e);
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
