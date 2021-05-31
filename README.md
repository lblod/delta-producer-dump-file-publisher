# delta-producer-dump-file-publisher

Service that produces and publishes a dump file of the current state of deltas.
It publishes according to the DCAT v2 standard.
Api is provided by mu-resource.
Files are hosted by mu-file.

## Installation

### docker-compose.yml
Per cache-graph to manage, you will need an instance of the service, suppose here it is related to leidinggevenden.
To add the service to your `mu.semte.ch` stack, add the following snippet to docker-compose.yml:

```yaml
services:
  delta-producer-dump-file-publisher-leiddingevenden:
    image: lblod/delta-producer-dump-file-publisher:x.x.x
    environment:
      EXPORT_FILE_BASE_NAME: "dump-leidinggevenden"
      GRAPH_TO_DUMP: "http://redpencil.data.gift/id/deltas/producer/loket-leidinggevenden-producer"
      DUMP_FILE_CREATION_JOB_OPERATION: "http://redpencil.data.gift/id/jobs/concept/JobOperation/deltas/cacheGraphDumping/leidinggevenden"
      DCAT_DATASET_SUBJECT: "http://data.lblod.info/datasets/delta-producer/dumps/LeidinggevendenCacheGraphDump"
    volumes:
      - ./data/files:/share
```

### Wire the deltas

This service works by receiving deltas from the [delta-notifier](https://github.com/mu-semtech/delta-notifier).
It should be configured as such :

```
  {
    match: {
      predicate: {
        type: 'uri',
        value: 'http://www.w3.org/ns/adms#status'
      },
      object: {
        type: 'uri',
        value: 'http://redpencil.data.gift/id/concept/JobStatus/scheduled'
      }
    },
    callback: {
      url: 'http://delta-producer-dump-file-publisher-leiddingevenden/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true
    }
  }
```

### Environment variables

Provided [environment variables](https://docs.docker.com/compose/environment-variables/) by the service. These can be added in within the docker declaration.

| Name                                | Description                 | Default                                 |
| ----------------------------------- | --------------------------- | --------------------------------------- |
| `SERVICE_NAME`                      | The name of the service     | `delta-producer-dump-file-publisher`    |
| `EXPORT_TTL_BATCH_SIZE`             | Size of the batched queries | `1000`                                  |
| `DUMP_FILE_CREATION_TASK_OPERATION` | Uri of the dump task        | `http://redpencil.data.gift/id/jobs/concept/TaskOperation/deltas/deltaDumpFileCreation` |
| `FILES_GRAPH`                       | Graph to store the file     | `http://mu.semte.ch/graphs/public` |
| `DCAT_DATASET_GRAPH`                       | Graph to store the dcat dataset     | `http://mu.semte.ch/graphs/public` |
| `RELATIVE_FILE_PATH`                       | relative path to store the files under     | `delta-producer-dumps` |
| `JOBS_GRAPH`                       | graph where the jobs resides     | `http://mu.semte.ch/graphs/system/jobs` |
| `GRAPH_TO_DUMP`                     | Graph to dump in file       |                                         |
| `EXPORT_FILE_BASE_NAME`             | Base name of the dump file  |                                         |
| `DUMP_FILE_CREATION_JOB_OPERATION`  | Uri of the dump task's job  |                                         |
| `DCAT_DATASET_SUBJECT`  | The dct:subject URI of the dataset |                                         |

## API

Will be served by mu-resource.
See e.g. https://github.com/kanselarij-vlaanderen/app-themis/blob/master/config/resources/dcat.json for the api definition.

## Development

For a more detailed look in how to develop a microservices based on
the [mu-javascript-template](https://github.com/mu-semtech/mu-javascript-template), we would recommend
reading "[Developing with the template](https://github.com/mu-semtech/mu-javascript-template#developing-with-the-template)"

### Developing in the `mu.semte.ch` stack

Paste the following snip-it in your `docker-compose.override.yml`:

````yaml
delta-producer-dump-file-publisher:
  image: semtech/mu-javascript-template:1.4.0
  environment:
    NODE_ENV: "development"
  volumes:
    - /absolute/path/to/your/sources/:/app/
````

## TODO
- period clean up of deprecated datasets
- eventually add dcat:Dataset to dcat:Catalog
