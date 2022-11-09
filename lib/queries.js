import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { parseResult, sparqlEscapeUri } from './utils';

import {
  ERROR_URI_PREFIX,
  ERROR_TYPE,
  PREFIXES,
  TASK_TYPE,
  JOB_TYPE,
  STATUS_SCHEDULED,
  DELTA_ERROR_TYPE,
  ERROR_CREATOR_URI
} from './constants';
import {
  EXPORT_TTL_BATCH_SIZE,
  DUMP_FILE_CREATION_TASK_OPERATION,
  JOBS_GRAPH
} from './env';

/**
 * Updates the status of the given resource
 */
export async function updateStatus(uri, status) {
  const q = `
    PREFIX adms: <http://www.w3.org/ns/adms#>

    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    }
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ${sparqlEscapeUri(status)} .
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    }
  `;
  await update(q);
}

export async function countResourcesInGraph(graph, publicationGraphEndpoint) {
  console.log(`Hitting publicationGraphEndpoint ${publicationGraphEndpoint}`);
  const queryResult = await query(`
      SELECT (COUNT( DISTINCT(?s)) as ?count)
      WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ?s ?p ?o .
        }
      }
    `, {}, publicationGraphEndpoint);

  return parseInt(queryResult.results.bindings[0].count.value);
}

export async function getBatchedTriples(offset, graph, publicationGraphEndpoint) {
  console.log(`Hitting publicationGraphEndpoint ${publicationGraphEndpoint}`);
  const q = `
    SELECT DISTINCT ?s ?p ?o
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        {
          SELECT DISTINCT ?s WHERE {
            GRAPH ${sparqlEscapeUri(graph)} {
              ?s ?p ?o .
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

  const queryResult = await query(q, {}, publicationGraphEndpoint);
  return queryResult.results.bindings;
}

export async function appendTaskError(task, errorMsg){
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX oslc: <http://open-services.net/ns/core#>

  INSERT {
    GRAPH ?g {
      ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)};
        mu:uuid ${sparqlEscapeString(id)};
        oslc:message ${sparqlEscapeString(errorMsg)}.
      ${sparqlEscapeUri(task)} task:error ${sparqlEscapeUri(uri)}.
    }
  } WHERE {
    GRAPH ?g {
      ${sparqlEscapeUri(task)} a ?type .
    }
  }
  `;

  await update(queryError);
}

export async function storeError(errorMsg){
 //Helper to store general errors not related to a task
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
    ${PREFIXES}

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOBS_GRAPH)}{
        ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)}, ${sparqlEscapeUri(DELTA_ERROR_TYPE)};
          mu:uuid ${sparqlEscapeString(id)};
          dct:subject "Delta Producer Dump File Publisher" ;
          oslc:message ${sparqlEscapeString(errorMsg)} ;
          dct:created ${sparqlEscapeDateTime(new Date().toISOString())} ;
          dct:creator ${sparqlEscapeUri(ERROR_CREATOR_URI)} .
      }
    }
  `;

  await update(queryError);
}

export async function mayBeTaskOfInterest(taskUri) {
  const q = `
    ${PREFIXES}

    SELECT DISTINCT ?job ?task ?jobOperation WHERE {
      BIND(${sparqlEscapeUri(taskUri)} as ?task)
      GRAPH ?g {
          ?job a ${sparqlEscapeUri(JOB_TYPE)};
            task:operation ?jobOperation.

          ?task dct:isPartOf ?job;
            a ${sparqlEscapeUri(TASK_TYPE)};
            task:operation ?taskOperation;
            adms:status ${sparqlEscapeUri(STATUS_SCHEDULED)}.
       }
      FILTER( ?taskOperation IN (
         ${sparqlEscapeUri(DUMP_FILE_CREATION_TASK_OPERATION)}
      ))
    }
  `;
  const queryResult = await query(q);
  return parseResult(queryResult)[0];
}
