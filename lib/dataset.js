import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import mu, { sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeInt } from 'mu';
import { sparqlEscapeUri } from './utils';
import path from 'path';
import fs from 'fs-extra';
import { generateDumpFile } from './helpers';
import { DCAT_DATASET_GRAPH, SERVICE_NAME, FILES_GRAPH } from './env';
import { PREFIXES, DCAT_DATASET_TYPE } from './constants';

/*
 * Based on https://github.com/kanselarij-vlaanderen/dcat-dataset-publication-service
 * Courtesy: https://github.com/Annelies-P, Erika
 */
export class DatasetManager {
  constructor(dcatDataSetSubject, graphToDump, fileBaseName){
    this.dcatDataSetSubject = dcatDataSetSubject;
    this.fileBaseName = fileBaseName;
    this.graphToDump = graphToDump;
  }
  /**
   * @public
   */
  async createDumpFile() {
    this.filePath = await generateDumpFile(this.fileBaseName, this.graphToDump);
    if(!this.filePath){
      return;
    }
    else {
    await this.generateDataset();
    await this.generateTtlDistribution();
    await this.deprecatePrevious();
      //TODO: a clean up of the previous files to avoid explosion of dumps
    }
  }

  /**
   * Create the new dataset
   *
   * @private
   */
  async generateDataset() {
    const uuid = mu.uuid();
    const uri = `http://data.lblod.info/id/dataset/${uuid}`;
    const now = Date.now();

    const queryStr = `
      ${PREFIXES}

      INSERT DATA {
        GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
          <${uri}> a dcat:Dataset ;
            mu:uuid "${uuid}" ;
            dct:type  ${sparqlEscapeUri(DCAT_DATASET_TYPE)};
            dct:subject ${sparqlEscapeUri(this.dcatDataSetSubject)};
            dct:created ${sparqlEscapeDateTime(now)} ;
            dct:modified ${sparqlEscapeDateTime(now)} ;
            dct:issued ${sparqlEscapeDateTime(now)} ;
            dct:title """Delta producer cache graph dump""" .
        }
      }
    `;
    await update(queryStr);

    this.datasetUri = uri;

    console.log(`Generated dataset ${this.datasetUri}`);
  }

  /**
   * Create a FileDataObject for the ttl file,
   * insert a distribution for the dataset ttl file
   *
   * @private
   */
  async generateTtlDistribution() {
    const now = Date.now();
    const fileName = path.basename(this.filePath);
    const extension = path.extname(this.filePath);
    const format = 'text/turtle';
    const fileStats = fs.statSync(this.filePath);
    const created = new Date(fileStats.birthtime);
    const size = fileStats.size;

    const logicalFileUuid = mu.uuid();
    const logicalFileUri = `http://data.lblod.info/id/file/${logicalFileUuid}`;

    const physicalFileUuid = mu.uuid();
    const physicalFileUri = this.filePath.replace('/share/', 'share://');

    const distributionUuid = mu.uuid();
    const distributionUri = `http://data.lblod.info/id/distribution/${distributionUuid}`;

    await update(`
      ${PREFIXES}

      INSERT {
        GRAPH ${sparqlEscapeUri(FILES_GRAPH)} {
          ${sparqlEscapeUri(logicalFileUri)} a nfo:FileDataObject ;
            mu:uuid ${sparqlEscapeString(logicalFileUuid)} ;
            nfo:fileName ${sparqlEscapeString(fileName)} ;
            dct:format ${sparqlEscapeString(format)} ;
            nfo:fileSize ${sparqlEscapeInt(size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(extension)} ;
            dct:creator ${sparqlEscapeUri(SERVICE_NAME)} ;
            dct:created ${sparqlEscapeDateTime(created)} .

          ${sparqlEscapeUri(physicalFileUri)} a nfo:FileDataObject ;
            mu:uuid ${sparqlEscapeString(physicalFileUuid)} ;
            nfo:fileName ${sparqlEscapeString(fileName)} ;
            dct:format ${sparqlEscapeString(format)} ;
            nfo:fileSize ${sparqlEscapeInt(size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(extension)} ;
            dct:created ${sparqlEscapeDateTime(created)} ;
            nie:dataSource ${sparqlEscapeUri(logicalFileUri)} .
        }
        GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
           ${sparqlEscapeUri(distributionUri)} a dcat:Distribution ;
            mu:uuid "${distributionUuid}" ;
            dct:subject ${sparqlEscapeUri(logicalFileUri)} ;
            dct:created ${sparqlEscapeDateTime(now)} ;
            dct:modified ${sparqlEscapeDateTime(now)} ;
            dct:issued ${sparqlEscapeDateTime(now)} ;
            dcat:byteSize ${sparqlEscapeInt(size)} ;
            dct:format ${sparqlEscapeString(format)} ;
            dct:title ?title .
            ?dataset dcat:distribution ${sparqlEscapeUri(distributionUri)} .
        }
      }
      WHERE {
        BIND(${sparqlEscapeUri(this.datasetUri)} as ?dataset)
        GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
          ?dataset dct:title ?title
        }
      }
    `);
  }

  /**
   * Deprecate the previous dataset
   *  - search for any previous dataset
   *  - mark it as prov:wasRevisionOf of the current dataset
   *  - update the modified:date
   *
   * @public
   */
  async deprecatePrevious() {
    const results = (await query(`
      ${PREFIXES}
      SELECT DISTINCT ?dataset
      WHERE {
        GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
          ?dataset a dcat:Dataset ;
            dct:type ${sparqlEscapeUri(DCAT_DATASET_TYPE)};
            dct:subject ${sparqlEscapeUri(this.dcatDataSetSubject)}.
        }
        FILTER NOT EXISTS { ?newerVersion prov:wasRevisionOf ?dataset . }
        FILTER ( ?dataset NOT IN (${sparqlEscapeUri(this.datasetUri)} ) )
      }
    `)).results;

    const datasets = results.bindings ? results.bindings.map(d => d.dataset.value) : [];

    if(datasets.length > 1){
      throw( `We exepected max 1 previous revision,
              instead we got ${datasets.join('\n')}`);
    }

    else if (datasets.length == 1) {
      const previousDataset = datasets[0];
      console.log(`Found previous dataset <${previousDataset}>`);

      await update(`
        ${PREFIXES}
        INSERT DATA {
          GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
            ${sparqlEscapeUri(this.datasetUri)} prov:wasRevisionOf ${sparqlEscapeUri(previousDataset)} .
          }
        }
      `);

      await deprecateDistributions(previousDataset);
    }
  }
}

async function deprecateDistributions(previousDataset) {
  console.log(`Deprecating distributions belonging to previous dataset <${previousDataset}>`);
  await update(`
    ${PREFIXES}
    DELETE {
      GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
        ${sparqlEscapeUri(previousDataset)} dct:modified ?datasetModifiedDate ;
          dct:modified ?distributionModifiedDate .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
        ${sparqlEscapeUri(previousDataset)} dcat:distribution ?distribution ;
                                            dct:modified ?datasetModifiedDate .
        ?distribution dct:modified ?distributionModifiedDate .
      }
    }
  `);

  const now = Date.now();

  await update(`
    ${PREFIXES}

    INSERT {
      GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
        ?distribution dct:modified ${sparqlEscapeDateTime(now)} .
        ${sparqlEscapeUri(previousDataset)} dct:modified ${sparqlEscapeDateTime(now)} .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(DCAT_DATASET_GRAPH)} {
        ${sparqlEscapeUri(previousDataset)} dcat:distribution ?distribution .
      }
    }
  `);
}
