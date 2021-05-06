# delta-producer-dump-file-publisher

Service that produces and publishes a dump file of the current state of deltas.

## Installation

### docker-compose.yml

To add the service to your `mu.semte.ch` stack, add the following snippet to docker-compose.yml:

```yaml
services:
  delta-producer-dump-file-publisher:
    image: lblod/delta-producer-dump-file-publisher:x.x.x
    environment:
      EXPORT_FILE_BASE_NAME: "delta-dump-xxx"
      GRAPH_TO_DUMP: "http://graphs/graph"
    volumes:
      - ./data/exports:/share/exports
```

### Wire the deltas

This service works by receiving deltas from the [delta-notifier](https://github.com/mu-semtech/delta-notifier).
It should be configured as such :

```
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://redpencil.data.gift/vocabularies/tasks/operation'
    },
    object: {
      type: 'uri',
      value: 'http://redpencil.data.gift/id/jobs/concept/JobOperation/deltas/deltaDumpFileCreation/xxx'
    }
  },
  callback: {
    url: 'http://delta-producer-dump-file-publisher/produce-dump-file',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 1000,
    ignoreFromSelf: true
  }
}
```

The value of the object is the value `DUMP_FILE_CREATION_JOB_OPERATION` defined in the
[job initiator](https://github.com/lblod/delta-producer-background-jobs-initiator) part of the stack.

### Environment variables

Provided [environment variables](https://docs.docker.com/compose/environment-variables/) by the service. These can be added in within the docker declaration.

| Name                                | Description                 | Default                                 |
| ----------------------------------- | --------------------------- | --------------------------------------- |
| `SERVICE_NAME`                      | The name of the service     | `delta-producer-dump-file-publisher`    |
| `EXPORT_TTL_BATCH_SIZE`             | Size of the batched queries | `1000`                                  |
| `DUMP_FILE_CREATION_TASK_OPERATION` | Uri of the dump task        | `http://redpencil.data.gift/id/jobs/concept/TaskOperation/deltas/deltaDumpFileCreation` |
| `FILES_GRAPH`                       | Graph to store the file     | `http://mu.semte.ch/graphs/system/jobs` |
| `GRAPH_TO_DUMP`                     | Graph to dump in file       |                                         |
| `EXPORT_FILE_BASE_NAME`             | Base name of the dump file  |                                         |

## API

### Get the latest produced dump file

> **GET** `/latest-dump-file`

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
