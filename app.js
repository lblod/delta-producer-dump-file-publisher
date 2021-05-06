import { app, errorHandler } from 'mu';
import { SERVICE_NAME } from './lib/env';
import { STATUS_BUSY, STATUS_SUCCESS, STATUS_FAILED } from './lib/constants';
import { generateDumpFile } from './lib/helpers';
import { getTask, updateStatus, getLatestFile } from './lib/queries';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import path from 'path';
import fs from 'fs-extra';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test( req.get('content-type') ); } }))

app.get('/', function(req, res) {
  const message = `Hey there, you have reached ${SERVICE_NAME}! Seems like I'm doing just fine :)`;
  res.send(message);
});

app.post('/produce-dump-file', async function( req, res ) {
  const delta = req.body;
  const inserts = flatten(delta.map(changeSet => changeSet.inserts));
  const scheduledDumpFileJobs = getBusyJobs(inserts);
  produceDumpFile(scheduledDumpFileJobs); // Not awaiting to avoid socket hangup in deltanotifier
  res.send({message: `Dump file production started`});
});

app.get('/latest-dump-file', async (req, res) => {
  const file = await getLatestFile();
  res.send(file);
});

app.use(errorHandler);

// ---------------------------------------- INTERNAL LOGIC ----------------------------------------

function getBusyJobs(inserts) {
  return inserts.filter( triple => {
    return triple.predicate.type == 'uri'
      && triple.predicate.value == 'http://www.w3.org/ns/adms#status'
      && triple.object.type == 'uri'
      && triple.object.value == STATUS_BUSY;
  }).map(triple => triple.subject.value);
}

async function produceDumpFile(scheduledDumpFileJobs) {
  if (scheduledDumpFileJobs.length) {
    const job = scheduledDumpFileJobs[0];

    try {
      const task = await getTask(job);
      console.log(`Generating dump file for task ${task}.`);

      await updateStatus(task, STATUS_BUSY);
      await generateDumpFile();
      await updateStatus(task, STATUS_SUCCESS);
      await updateStatus(job, STATUS_SUCCESS);
    } catch (e) {
      console.log(`An error occured while creating dump file for job ${job}: ${e}`)
      await updateStatus(job, STATUS_FAILED);
    }
  } else {
    console.log('Incoming deltas do not contain any busy job, skipping.');
  }
}
