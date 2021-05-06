import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeInt, sparqlEscapeDateTime } from 'mu';
import { STATUS_SCHEDULED } from './constants';
import {
  EXPORT_CLASSIFICATION_URI,
  FILES_GRAPH,
  DUMP_FILE_CREATION_TASK_OPERATION,
  SERVICE_NAME
} from './env';
import path from 'path';
import fs from 'fs-extra';

const serviceUri = 'http://lblod.data.gift/services/' + SERVICE_NAME;

export async function getTask(job) {
  const q = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>

    SELECT ?task
    WHERE {
      ?task dct:isPartOf ${sparqlEscapeUri(job)} ;
        adms:status ${sparqlEscapeUri(STATUS_SCHEDULED)} ;
        task:operation ${sparqlEscapeUri(DUMP_FILE_CREATION_TASK_OPERATION)} .
    }
  `;
  const queryResult = await query(q);
  const bindings =   queryResult.results.bindings
  return bindings.length ? bindings[0].task.value : null;
}

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
      SELECT (COUNT(*) as ?count)
      WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ?s a ?o .
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

    SELECT ?file
    WHERE {
      GRAPH ${sparqlEscapeUri(FILES_GRAPH)} {
        ?file a nfo:FileDataObject ;
          dct:created ?created ;
          dct:creator ${sparqlEscapeUri(serviceUri)} .
      }
    }
    ORDER BY DESC(?created)
    LIMIT 1
  `;

  const queryResult = await query(q);
  const bindings =   queryResult.results.bindings
  return bindings.length ? bindings[0].file.value : '';
}