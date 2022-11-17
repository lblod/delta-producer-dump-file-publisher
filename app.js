import { app, errorHandler } from 'mu';
import { SERVICE_NAME } from './lib/env';
import { getScheduledDumpTask } from './lib/helpers';
import { storeError } from './lib/queries';
import { updateStatus, appendTaskError } from './lib/queries';
import { STATUS_BUSY, STATUS_SUCCESS, STATUS_FAILED } from './lib/constants';
import { DatasetManager } from './lib/dataset';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import jsonConfig from '/config/config.json';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test( req.get('content-type') ); } }));

app.get('/', function(_, res) {
  const message = `Hey there, you have reached ${SERVICE_NAME}! Seems like I'm doing just fine :)`;
  res.send(message);
});

app.post('/delta', async function( req, res ) {
  try {
    const delta = req.body;
    const inserts = flatten(delta.map(changeSet => changeSet.inserts));
    if(!inserts.length){
      console.log('No inserts found, skipping.');
      res.status(204).send();
    }
    else {
      const task = await getScheduledDumpTask(inserts);
      if (task && jsonConfig[task.jobOperation]) {
        produceDumpFile(jsonConfig[task.jobOperation], task.task); // Not awaiting to avoid socket hangup in deltanotifier
        res.send({message: `Dump file production started`});
      }
      else {
        console.log('Incoming deltas do not contain any busy job, skipping.');
        res.status(204).send();
      }
    }
  }
  catch(e){
    const msg = `General error with creating dump file: ${e}`;
    console.error(msg);
    await storeError(msg);
  }
});

async function produceDumpFile(config, task) {
  try {
    console.log(`Generating dump file for task ${task}.`);
    const manager = new DatasetManager(config.dcatDataSetSubject,
                                       config.targetGraph,
                                       config.fileBaseName,
                                       config.publicationGraphEndpoint,
                                       config.targetDcatGraph,
                                       config.targetFilesGraph,
                                       config.cleanupOldDumps);
    await updateStatus(task, STATUS_BUSY);
    await manager.createDumpFile();
    await updateStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(`An error occured while creating dump file for task ${task}: ${e}`);
    await appendTaskError(task, e.message || e);
    await updateStatus(task, STATUS_FAILED);
  }
}

app.use(errorHandler);
