import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeInt, sparqlEscapeDateTime } from 'mu';
import path from 'path';
import fs from 'fs-extra';
import {
  ERROR_URI_PREFIX,
  ERROR_TYPE,
  PREFIXES,
  TASK_TYPE,
  JOB_TYPE,
  STATUS_SCHEDULED,
  DELTA_ERROR_TYPE
} from './constants';
import {
  FILES_GRAPH,
  SERVICE_NAME,
  EXPORT_TTL_BATCH_SIZE,
  GRAPH_TO_DUMP,
  DUMP_FILE_CREATION_TASK_OPERATION,
  DUMP_FILE_CREATION_JOB_OPERATION,
  JOBS_GRAPH
} from './env';

const serviceUri = 'http://lblod.data.gift/services/' + SERVICE_NAME;

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

export async function countResourcesInGraph(graph) {
  const queryResult = await query(`
      SELECT (COUNT( DISTINCT(?s)) as ?count)
      WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ?s ?p ?o .
        }
      }
    `);

  return parseInt(queryResult.results.bindings[0].count.value);
}

/**
 * Insert (the metadata of) a new export file
 *
 * @param {string} filename Name of the export file
 * @param {string} format MIME type of the export file
 */
export async function insertFileInDb(file, format) {
  const virtualFileUuid = uuid();
  const virtualFileUri = `http://data.lblod.info/files/${virtualFileUuid}`;
  const physicalFileUuid = uuid();
  const physicalFileUri = file.replace('/share', 'share://');


  const created = new Date();
  const filename = path.basename(file);
  const extension = path.extname(file);
  const stats = await fs.stat(file);
  const size = stats.size;

  const fileQuery = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dbpedia: <http://dbpedia.org/ontology/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(FILES_GRAPH)} {
        ${sparqlEscapeUri(virtualFileUri)} a nfo:FileDataObject ;
          mu:uuid ${sparqlEscapeString(virtualFileUuid)} ;
          nfo:fileName ${sparqlEscapeString(filename)} ;
          dct:format ${sparqlEscapeString(format)} ;
          dbpedia:fileExtension ${sparqlEscapeString(extension)} ;
          nfo:fileSize ${sparqlEscapeInt(size)} ;
          dct:created ${sparqlEscapeDateTime(created)} ;
          dct:modified  ${sparqlEscapeDateTime(created)} ;
          dct:creator ${sparqlEscapeUri(serviceUri)} .
        ${sparqlEscapeUri(physicalFileUri)} a nfo:FileDataObject ;
          mu:uuid ${sparqlEscapeString(physicalFileUuid)} ;
          nie:dataSource ${sparqlEscapeUri(virtualFileUri)} ;
          nfo:fileName ${sparqlEscapeString(filename)} ;
          dct:format ${sparqlEscapeString(format)} ;
          dbpedia:fileExtension ${sparqlEscapeString(extension)} ;
          dct:created ${sparqlEscapeDateTime(created)} ;
          dct:modified  ${sparqlEscapeDateTime(created)} .
      }
    }
  `;

  await update(fileQuery);
}

export async function getLatestFile() {
  const q = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dbpedia: <http://dbpedia.org/ontology/>

    SELECT ?file ?uuid ?filename ?format ?extension ?size ?created ?modified ?creator
    WHERE {
      GRAPH ${sparqlEscapeUri(FILES_GRAPH)} {
        ?file a nfo:FileDataObject ;
          mu:uuid ?uuid ;
          nfo:fileName ?filename ;
          dct:format ?format ;
          dbpedia:fileExtension ?extension ;
          nfo:fileSize ?size ;
          dct:created ?created ;
          dct:modified ?modified ;
          dct:creator ?creator .
        VALUES ?creator { ${sparqlEscapeUri(serviceUri)} }
      }
    }
    ORDER BY DESC(?created)
    LIMIT 1
  `;

  const queryResult = await query(q);
  const bindings =  queryResult.results.bindings;

  if (bindings.length) {
    return {
      file: queryResult.results.bindings[0].file.value,
      uuid: queryResult.results.bindings[0].uuid.value,
      filename: queryResult.results.bindings[0].filename.value,
      format: queryResult.results.bindings[0].format.value,
      extension: queryResult.results.bindings[0].extension.value,
      size: queryResult.results.bindings[0].size.value,
      created: queryResult.results.bindings[0].created.value,
      modified: queryResult.results.bindings[0].modified.value,
      creator: queryResult.results.bindings[0].creator.value
    };
  } else {
    return null;
  }
}

export async function getBatchedTriples(offset) {
  const q = `
    SELECT DISTINCT ?s ?p ?o
    WHERE {
      GRAPH ${sparqlEscapeUri(GRAPH_TO_DUMP)} {
        {
          SELECT DISTINCT ?s WHERE {
            GRAPH ${sparqlEscapeUri(GRAPH_TO_DUMP)} {
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

  const queryResult = await query(q);
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
        oslc:message ${sparqlEscapeString(errorMsg)}.
    }
   }
  `;

  await update(queryError);
}


export async function isTaskInExpectedJob(taskUri) {
  const q = `
    ${PREFIXES}

    SELECT DISTINCT ?job ?task WHERE {
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
      FILTER( ?jobOperation IN (
         ${sparqlEscapeUri(DUMP_FILE_CREATION_JOB_OPERATION)}
       )
      )
    }
  `;
  const queryResult = await query(q);
  return queryResult.results.bindings.length > 0;
}
